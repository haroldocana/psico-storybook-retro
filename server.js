import express from 'express';
import multer from 'multer';
import mongoose from 'mongoose';
import { GoogleGenAI, Type } from '@google/genai';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json({ limit: '35mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const upload = multer({ storage: multer.memoryStorage() });
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Conexión a MongoDB Atlas optimizada con option bufferCommands: false
const MONGO_URI = process.env.MONGO_URI || '';
mongoose.connect(MONGO_URI, { bufferCommands: false })
  .then(() => console.log('🔥 Conectado exitosamente a MongoDB Atlas'))
  .catch(err => console.error('Error conectando a MongoDB:', err));

// Esquemas de Base de Datos
const UserSchema = new mongoose.Schema({
  username: { type: String, unique: true, lowercase: true },
  fullName: String,
  email: String,
  password: String,
  career: String,
  aiConsumptionUSD: { type: Number, default: 0 },
  storybooksCreated: { type: Number, default: 0 },
  examsCreated: { type: Number, default: 0 },
  subjects: Array
});

const UserModel = mongoose.model('User', UserSchema);

// Middleware para verificar conexión antes de cada petición a la BD
app.use(async (req, res, next) => {
  if (mongoose.connection.readyState !== 1) {
    return res.status(503).json({ error: "La base de datos se está conectando. Intenta de nuevo en unos segundos." });
  }
  next();
});

// Inicializar usuario haroldocana de forma segura
async function initUser() {
  try {
    let user = await UserModel.findOne({ username: 'haroldocana' });
    if (!user) {
      user = new UserModel({
        username: 'haroldocana',
        fullName: 'Harold Benjamín Ocaña Guillén',
        email: 'haroldocana@psicologia.edu',
        password: 'admin123',
        career: 'Psicología Clínica',
        subjects: [
          { id: "lpc-ep2", name: "Escuelas Psicológicas II", section: "Sección A", schedule: "Semestre 2", defaultHero: "HE_MAN", documents: [], storybooks: [], exams: [] },
          { id: "lpc-nc1", name: "Neurociencia Cognitiva", section: "Sección A", schedule: "Semestre 2", defaultHero: "TRANSFORMERS", documents: [], storybooks: [], exams: [] }
        ]
      });
      await user.save();
      console.log('👤 Usuario haroldocana creado en DB.');
    }
  } catch (e) {
    console.log('Nota inicialización DB:', e.message);
  }
}
setTimeout(initUser, 4000);

// Rutas de Autenticación
app.post('/api/auth/login', async (req, res) => {
  try {
    const { identifier, password } = req.body;
    const user = await UserModel.findOne({ 
      $or: [{ username: (identifier || '').trim().toLowerCase() }, { email: (identifier || '').trim().toLowerCase() }] 
    });
    if (!user || user.password !== password) {
      return res.status(401).json({ error: "Usuario o contraseña incorrectos." });
    }
    const obj = user.toObject();
    delete obj.password;
    res.json({ user: obj });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/auth/register', async (req, res) => {
  try {
    const { fullName, username, email, password, career } = req.body;
    const cleanUser = (username || '').trim().toLowerCase();
    const existing = await UserModel.findOne({ username: cleanUser });
    if (existing) return res.status(400).json({ error: "El usuario ya existe." });

    const newUser = new UserModel({
      username: cleanUser,
      fullName,
      email: email || `${cleanUser}@univ.edu`,
      password,
      career: career || 'Psicología Clínica',
      subjects: [
        { id: 'subj-1', name: career === 'Medicina' ? 'Fisiología Humana' : 'Escuelas Psicológicas II', section: 'Sección A', schedule: 'Semestre Actual', defaultHero: 'TRANSFORMERS', documents: [], storybooks: [], exams: [] }
      ]
    });
    await newUser.save();
    const obj = newUser.toObject();
    delete obj.password;
    res.json({ user: obj });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Rutas de Materias y Documentos
app.post('/api/subjects', async (req, res) => {
  try {
    const { username, name, section, schedule, defaultHero } = req.body;
    const user = await UserModel.findOne({ username: (username || '').toLowerCase() });
    if (!user) return res.status(401).json({ error: "Sesión no válida" });

    const newSubj = {
      id: 'subj-' + Date.now(),
      name,
      section: section || 'Sección A',
      schedule: schedule || 'Activo',
      defaultHero: defaultHero || 'CANDY_CANDY',
      documents: [],
      storybooks: [],
      exams: []
    };
    user.subjects.push(newSubj);
    await user.save();
    const obj = user.toObject();
    delete obj.password;
    res.json({ user: obj, newSubjectId: newSubj.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/documents', upload.single('document'), async (req, res) => {
  try {
    const { username, subjectId, docTitle, customText } = req.body;
    const user = await UserModel.findOne({ username: (username || '').toLowerCase() });
    if (!user) return res.status(401).json({ error: "Usuario no autenticado" });

    const subject = user.subjects.find(s => s.id === subjectId);
    if (!subject) return res.status(404).json({ error: "Materia no encontrada" });

    const newDoc = {
      id: 'doc-' + Date.now(),
      title: docTitle || (req.file ? req.file.originalname : 'Material'),
      fileName: req.file ? req.file.originalname : 'texto.txt',
      mimeType: req.file ? req.file.mimetype : 'text/plain',
      base64Data: req.file ? req.file.buffer.toString("base64") : null,
      textContent: customText || '',
      uploadedAt: new Date().toLocaleDateString('es-GT')
    };

    subject.documents.push(newDoc);
    await user.save();
    const obj = user.toObject();
    delete obj.password;
    res.json({ user: obj, documentId: newDoc.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Generar Storybook con Gemini
app.post('/api/generate-storybook', async (req, res) => {
  try {
    const { username, subjectId, documentId, focusTopic, universe } = req.body;
    const user = await UserModel.findOne({ username: (username || '').toLowerCase() });
    if (!user) return res.status(401).json({ error: "Usuario no autenticado" });

    const subject = user.subjects.find(s => s.id === subjectId);
    if (!subject) return res.status(404).json({ error: "Materia no encontrada" });

    const contents = [];
    let selectedDocs = documentId === 'ALL' ? subject.documents : subject.documents.filter(d => d.id === documentId);

    for (const doc of selectedDocs) {
      if (doc.base64Data) contents.push({ inlineData: { data: doc.base64Data, mimeType: doc.mimeType } });
      if (doc.textContent) contents.push(`Texto (${doc.title}):\n${doc.textContent}`);
    }

    contents.push(`Estudiante: ${user.fullName} (${user.career}). Materia: ${subject.name}. Tema: ${focusTopic || 'General'}. Universo: ${universe}. Genera Storybook de 5 escenas, línea de tiempo causal y quiz de 3 preguntas.`);

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            universe: { type: Type.STRING },
            summary: { type: Type.STRING },
            scenes: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  sceneNumber: { type: Type.INTEGER },
                  characterName: { type: Type.STRING },
                  academicConcept: { type: Type.STRING },
                  storyDialogue: { type: Type.STRING },
                  memoryTrick: { type: Type.STRING },
                  visualPromptRetro: { type: Type.STRING },
                  animationEffect: { type: Type.STRING }
                },
                required: ["sceneNumber", "characterName", "academicConcept", "storyDialogue", "memoryTrick", "visualPromptRetro", "animationEffect"]
              }
            },
            timeline: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  step: { type: Type.INTEGER },
                  title: { type: Type.STRING },
                  description: { type: Type.STRING }
                },
                required: ["step", "title", "description"]
              }
            },
            quiz: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  question: { type: Type.STRING },
                  options: { type: Type.ARRAY, items: { type: Type.STRING } },
                  correctIndex: { type: Type.INTEGER },
                  heroExplanation: { type: Type.STRING }
                },
                required: ["question", "options", "correctIndex", "heroExplanation"]
              }
            }
          },
          required: ["title", "universe", "summary", "scenes", "timeline", "quiz"]
        }
      }
    });

    const sbData = JSON.parse(response.text);
    user.aiConsumptionUSD += 0.25;
    user.storybooksCreated += 1;

    const newStorybook = {
      id: 'sb-' + Date.now(),
      createdAt: new Date().toLocaleString('es-GT'),
      ...sbData
    };

    subject.storybooks.push(newStorybook);
    await user.save();

    const obj = user.toObject();
    delete obj.password;
    res.json({ storybook: newStorybook, user: obj });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Generar Examen
app.post('/api/generate-exam', async (req, res) => {
  try {
    const { username, subjectId, documentId, universe } = req.body;
    const user = await UserModel.findOne({ username: (username || '').toLowerCase() });
    if (!user) return res.status(401).json({ error: "Usuario no autenticado" });

    const subject = user.subjects.find(s => s.id === subjectId);
    if (!subject) return res.status(404).json({ error: "Materia no encontrada" });

    const contents = [];
    const docsToUse = documentId === 'ALL' ? subject.documents : subject.documents.filter(d => d.id === documentId);

    for (const doc of docsToUse) {
      if (doc.base64Data) contents.push({ inlineData: { data: doc.base64Data, mimeType: doc.mimeType } });
      if (doc.textContent) contents.push(`Material (${doc.title}):\n${doc.textContent}`);
    }

    contents.push(`Genera un examen universitario de 5 preguntas sobre ${subject.name} con tono ${universe}.`);

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            examTitle: { type: Type.STRING },
            universe: { type: Type.STRING },
            questions: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  question: { type: Type.STRING },
                  options: { type: Type.ARRAY, items: { type: Type.STRING } },
                  correctIndex: { type: Type.INTEGER },
                  heroExplanation: { type: Type.STRING }
                },
                required: ["question", "options", "correctIndex", "heroExplanation"]
              }
            }
          },
          required: ["examTitle", "universe", "questions"]
        }
      }
    });

    const examData = JSON.parse(response.text);
    user.aiConsumptionUSD += 0.15;
    user.examsCreated += 1;

    const newExam = {
      id: 'ex-' + Date.now(),
      createdAt: new Date().toLocaleString('es-GT'),
      ...examData
    };

    subject.exams.push(newExam);
    await user.save();

    const obj = user.toObject();
    delete obj.password;
    res.json({ exam: newExam, user: obj });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Servidor activo en puerto ${PORT}`));
