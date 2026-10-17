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

// Multer configurado para aceptar PDFs, PPTX, DOCX, TXT e Imágenes
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 } // Hasta 25MB por archivo
});

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Conexión a MongoDB Atlas con Mongoose
const MONGO_URI = process.env.MONGO_URI || '';
mongoose.connect(MONGO_URI)
  .then(() => console.log('🔥 Conectado exitosamente a MongoDB Atlas'))
  .catch(err => console.error('Error conectando a MongoDB:', err));

// Esquemas de Base de Datos
const DocumentSchema = new mongoose.Schema({
  id: String,
  title: String,
  fileName: String,
  mimeType: String,
  base64Data: String,
  textContent: String,
  uploadedAt: String
});

const StorybookSchema = new mongoose.Schema({
  id: String,
  createdAt: String,
  sourceDocTitle: String,
  universe: String,
  title: String,
  summary: String,
  scenes: Array,
  timeline: Array,
  quiz: Array,
  tokensUsed: Number,
  billedUSD: Number
});

const ExamSchema = new mongoose.Schema({
  id: String,
  createdAt: String,
  examTitle: String,
  universe: String,
  questions: Array,
  tokensUsed: Number
});

const SubjectSchema = new mongoose.Schema({
  id: String,
  name: String,
  section: String,
  schedule: String,
  defaultHero: String,
  documents: [DocumentSchema],
  storybooks: [StorybookSchema],
  exams: [ExamSchema]
});

const UserSchema = new mongoose.Schema({
  username: { type: String, unique: true, lowercase: true },
  fullName: String,
  email: { type: String, lowercase: true },
  password: String,
  career: String, // 'Psicología Clínica', 'Medicina', 'Abogacía'
  subscriptionActive: { type: Boolean, default: true },
  subscriptionBaseUSD: { type: Number, default: 6.00 },
  aiConsumptionUSD: { type: Number, default: 0.00 },
  storybooksCreated: { type: Number, default: 0 },
  examsCreated: { type: Number, default: 0 },
  subjects: [SubjectSchema]
});

const UserModel = mongoose.model('User', UserSchema);

// Materias iniciales predeterminadas según la carrera
const getInitialSubjectsForCareer = (career) => {
  if (career === 'Medicina') {
    return [
      { id: 'med-1', name: 'Fisiología Humana', section: 'Sección A', schedule: 'Semestre 2', defaultHero: 'TRANSFORMERS', documents: [], storybooks: [], exams: [] },
      { id: 'med-2', name: 'Anatomía Macroscópica', section: 'Sección A', schedule: 'Semestre 2', defaultHero: 'GI_JOE', documents: [], storybooks: [], exams: [] }
    ];
  } else if (career === 'Abogacía') {
    return [
      { id: 'der-1', name: 'Derecho Civil I', section: 'Sección A', schedule: 'Semestre 2', defaultHero: 'HE_MAN', documents: [], storybooks: [], exams: [] },
      { id: 'der-2', name: 'Derecho Procesal Penal', section: 'Sección A', schedule: 'Semestre 2', defaultHero: 'GI_JOE', documents: [], storybooks: [], exams: [] }
    ];
  } else {
    // Psicología Clínica (Por defecto para haroldocana)
    return [
      { id: "lpc-ep2", name: "Escuelas Psicológicas II", section: "Sección A", schedule: "Semestre 2, 2026", defaultHero: "HE_MAN", documents: [], storybooks: [], exams: [] },
      { id: "lpc-pe2", name: "Psicología Evolutiva II", section: "Sección A", schedule: "Semestre 2, 2026", defaultHero: "CANDY_CANDY", documents: [], storybooks: [], exams: [] },
      { id: "lpc-ti1", name: "Técnicas de Investigación", section: "Sección A", schedule: "Sáb 17 Oct", defaultHero: "GI_JOE", documents: [], storybooks: [], exams: [] },
      { id: "lpc-nc1", name: "Neurociencia Cognitiva", section: "Sección A", schedule: "Semestre 2, 2026", defaultHero: "TRANSFORMERS", documents: [], storybooks: [], exams: [] }
    ];
  }
};

// Inicializar el usuario principal si no existe en MongoDB Atlas
async function ensureHaroldUser() {
  let user = await UserModel.findOne({ username: 'haroldocana' });
  if (!user) {
    user = new UserModel({
      username: 'haroldocana',
      fullName: 'Harold Benjamín Ocaña Guillén',
      email: 'haroldocana@psicologia.edu',
      password: 'admin123',
      career: 'Psicología Clínica',
      subjects: getInitialSubjectsForCareer('Psicología Clínica')
    });
    await user.save();
    console.log('👤 Usuario principal haroldocana inicializado en MongoDB Atlas.');
  }
}
setTimeout(ensureHaroldUser, 2000);

function serializeUser(user) {
  const obj = user.toObject();
  delete obj.password;
  obj.subjects = obj.subjects.map(s => ({
    ...s,
    documents: s.documents.map(d => ({
      id: d.id,
      title: d.title,
      fileName: d.fileName,
      mimeType: d.mimeType,
      uploadedAt: d.uploadedAt,
      hasText: !!d.textContent
    }))
  }));
  return obj;
}

// 1. REGISTRO DE USUARIO
app.post('/api/auth/register', async (req, res) => {
  try {
    const { fullName, username, email, password, career } = req.body;
    const cleanUsername = (username || '').trim().toLowerCase();
    const selectedCareer = career || 'Psicología Clínica';

    const existing = await UserModel.findOne({ username: cleanUsername });
    if (existing) return res.status(400).json({ error: "El usuario ya existe." });

    const newUser = new UserModel({
      username: cleanUsername,
      fullName,
      email: (email || `${cleanUsername}@universidad.edu`).trim().toLowerCase(),
      password,
      career: selectedCareer,
      subjects: getInitialSubjectsForCareer(selectedCareer)
    });

    await newUser.save();
    res.json({ user: serializeUser(newUser) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2. INICIO DE SESIÓN
app.post('/api/auth/login', async (req, res) => {
  try {
    const { identifier, password } = req.body;
    const cleanId = (identifier || '').trim().toLowerCase();
    const user = await UserModel.findOne({ $or: [{ username: cleanId }, { email: cleanId }] });

    if (!user || user.password !== password) {
      return res.status(401).json({ error: "Usuario o contraseña incorrectos." });
    }
    res.json({ user: serializeUser(user) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3. CREAR NUEVA MATERIA
app.post('/api/subjects', async (req, res) => {
  try {
    const { username, name, section, schedule, defaultHero } = req.body;
    const user = await UserModel.findOne({ username: (username || '').toLowerCase() });
    if (!user) return res.status(401).json({ error: "Sesión no válida" });

    const newSubj = {
      id: 'subj-' + Date.now(),
      name,
      section: section || 'Sección A',
      schedule: schedule || 'Semestre Actual',
      defaultHero: defaultHero || 'CANDY_CANDY',
      documents: [],
      storybooks: [],
      exams: []
    };
    user.subjects.push(newSubj);
    await user.save();
    res.json({ user: serializeUser(user), newSubjectId: newSubj.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 4. SUBIR DOCUMENTO MULTIFORMATO (PDF, PPTX, Word, Imagen, TXT)
app.post('/api/documents', upload.single('document'), async (req, res) => {
  try {
    const { username, subjectId, docTitle, customText } = req.body;
    const user = await UserModel.findOne({ username: (username || '').toLowerCase() });
    if (!user) return res.status(401).json({ error: "Usuario no autenticado" });

    const subject = user.subjects.id(subjectId) || user.subjects.find(s => s.id === subjectId);
    if (!subject) return res.status(404).json({ error: "Materia no encontrada" });

    const newDoc = {
      id: 'doc-' + Date.now(),
      title: docTitle || (req.file ? req.file.originalname : 'Material de Estudio'),
      fileName: req.file ? req.file.originalname : 'Apuntes.txt',
      mimeType: req.file ? req.file.mimetype : 'text/plain',
      base64Data: req.file ? req.file.buffer.toString("base64") : null,
      textContent: customText || '',
      uploadedAt: new Date().toLocaleDateString('es-GT')
    };

    subject.documents.push(newDoc);
    await user.save();
    res.json({ user: serializeUser(user), documentId: newDoc.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 5. GENERAR STORYBOOK + LÍNEA DE TIEMPO CON GEMINI
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
      if (doc.base64Data) {
        contents.push({ inlineData: { data: doc.base64Data, mimeType: doc.mimeType } });
      }
      if (doc.textContent) {
        contents.push(`Texto del material (${doc.title}):\n${doc.textContent}`);
      }
    }

    const prompt = `
      Eres el Motor Pedagógico Multidisciplinario del estudiante ${user.fullName} (${user.career}).
      Materia: "${subject.name}". Tema de estudio: "${focusTopic || 'Análisis integral de los archivos'}".
      Universo / Estilo pedagógico: "${universe}".

      INSTRUCCIÓN:
      Analiza los archivos (PDF, PPTX, Word o imágenes) cargados y genera:
      1. Un Storybook interactivo de 5 escenas profundas con rigor universitario.
      2. Una Línea de Tiempo Causal (array de 4 a 5 hitos secuenciales o cronológicos clave para materias complejas).
      3. Un Quiz de 3 preguntas con explicaciones del personaje.
    `;
    contents.push(prompt);

    const response = await ai.models.generateContent({
      model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
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
      sourceDocTitle: selectedDocs.map(d => d.title).join(', ') || focusTopic,
      billedUSD: 0.25,
      ...sbData
    };

    subject.storybooks.push(newStorybook);
    await user.save();

    res.json({ storybook: newStorybook, user: serializeUser(user) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 6. GENERAR EXAMEN PRÁCTICO
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

    contents.push(`Genera un examen universitario de 5 preguntas rigurosas sobre ${subject.name} con tono ${universe}.`);

    const response = await ai.models.generateContent({
      model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
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

    res.json({ exam: newExam, user: serializeUser(user) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Servidor Multicarrera activo en puerto ${PORT}`));
