import express from 'express';
import multer from 'multer';
import mongoose from 'mongoose';
import { GoogleGenAI, Type } from '@google/genai';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }
});

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const DEFAULT_GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.8-flash';

async function generateWithFallback(contents, responseSchema) {
  const modelsToTry = [DEFAULT_GEMINI_MODEL, 'gemini-3.8-flash', 'gemini-4-argon', 'gemini-3.0-flash'];
  let lastErr = null;
  for (const modelName of modelsToTry) {
    try {
      const response = await ai.models.generateContent({
        model: modelName,
        contents,
        config: responseSchema ? { responseMimeType: 'application/json', responseSchema } : {}
      });
      return response;
    } catch (err) {
      lastErr = err;
      console.warn(`Aviso: Falló modelo ${modelName}, probando siguiente...`, err.message);
    }
  }
  throw lastErr;
}

const DocumentSchema = new mongoose.Schema({
  docId: { type: String, unique: true, index: true },
  username: { type: String, lowercase: true, index: true },
  subjectId: { type: String, index: true },
  title: String,
  fileName: String,
  mimeType: String,
  base64Data: String,
  textContent: String,
  uploadedAt: String
});

const DocumentModel = mongoose.model('Document', DocumentSchema);

const UserSchema = new mongoose.Schema({
  username: { type: String, unique: true, lowercase: true },
  fullName: String,
  email: { type: String, lowercase: true },
  password: String,
  career: String,
  subscriptionActive: { type: Boolean, default: true },
  aiConsumptionUSD: { type: Number, default: 0 },
  storybooksCreated: { type: Number, default: 0 },
  subjects: Array
});

const UserModel = mongoose.model('User', UserSchema);

const getSubjectsForCareer = (career) => {
  switch (career) {
    case 'Derecho y Abogacía':
      return [
        { id: 'der-penal', name: 'Derecho Penal y Teórico', section: 'Sección A', schedule: 'Semestre 2', documents: [], storybooks: [], exams: [] },
        { id: 'der-civil', name: 'Derecho Civil y Contratos', section: 'Sección A', schedule: 'Semestre 2', documents: [], storybooks: [], exams: [] },
        { id: 'der-crim', name: 'Criminología y Victimología', section: 'Sección A', schedule: 'Semestre 2', documents: [], storybooks: [], exams: [] }
      ];
    case 'Medicina':
      return [
        { id: 'med-fisio', name: 'Fisiología Humana', section: 'Sección A', schedule: 'Semestre 2', documents: [], storybooks: [], exams: [] },
        { id: 'med-anato', name: 'Anatomía y Neuroanatomía', section: 'Sección A', schedule: 'Semestre 2', documents: [], storybooks: [], exams: [] },
        { id: 'med-pato', name: 'Patología General', section: 'Sección A', schedule: 'Semestre 2', documents: [], storybooks: [], exams: [] }
      ];
    case 'Filosofía':
      return [
        { id: 'filo-cont', name: 'Filosofía Contemporánea y Existencialismo', section: 'Sección A', schedule: 'Semestre 2', documents: [], storybooks: [], exams: [] },
        { id: 'filo-meta', name: 'Metafísica y Ontología del Ser', section: 'Sección A', schedule: 'Semestre 2', documents: [], storybooks: [], exams: [] }
      ];
    case 'Psicología Clínica':
    default:
      return [
        { id: 'lpc-ep2', name: 'Escuelas Psicológicas II', section: 'Sección A', schedule: 'Semestre 2', documents: [], storybooks: [], exams: [] },
        { id: 'lpc-pe2', name: 'Psicología Evolutiva II', section: 'Sección A', schedule: 'Semestre 2', documents: [], storybooks: [], exams: [] },
        { id: 'lpc-neuro', name: 'Neurociencia Cognitiva y Comportamiento', section: 'Sección A', schedule: 'Semestre 2', documents: [], storybooks: [], exams: [] }
      ];
  }
};

async function ensureDefaultUser() {
  try {
    let user = await UserModel.findOne({ username: 'haroldocana' });
    if (!user) {
      user = new UserModel({
        username: 'haroldocana',
        fullName: 'Harold Benjamín Ocaña Guillén',
        email: 'haroldocana@universidad.edu',
        password: 'admin123',
        career: 'Psicología Clínica',
        subjects: getSubjectsForCareer('Psicología Clínica')
      });
      await user.save();
    }
  } catch (e) {}
}

const MONGO_URI = (process.env.MONGO_URI || '').trim();
async function connectDB() {
  if (!MONGO_URI || mongoose.connection.readyState === 1) return;
  try {
    await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 6000 });
    await ensureDefaultUser();
  } catch (err) {}
}
connectDB();

app.use('/api', async (req, res, next) => {
  if (mongoose.connection.readyState !== 1) await connectDB();
  next();
});

async function serializeUser(user) {
  const obj = user.toObject();
  delete obj.password;
  const savedDocs = await DocumentModel.find({ username: obj.username }, { base64Data: 0, textContent: 0 }).lean();
  obj.subjects = (obj.subjects || []).map(s => {
    const embeddedDocs = (s.documents || []).map(d => ({ id: d.id, title: d.title, fileName: d.fileName, mimeType: d.mimeType, uploadedAt: d.uploadedAt }));
    const collectionDocs = savedDocs.filter(cd => cd.subjectId === s.id).map(cd => ({ id: cd.docId, title: cd.title, fileName: cd.fileName, mimeType: cd.mimeType, uploadedAt: cd.uploadedAt }));
    const map = new Map();
    [...embeddedDocs, ...collectionDocs].forEach(item => map.set(item.id, item));
    return { ...s, documents: Array.from(map.values()) };
  });
  return obj;
}

app.post('/api/auth/login', async (req, res) => {
  try {
    const { identifier, password } = req.body;
    const cleanId = (identifier || '').trim().toLowerCase();
    await ensureDefaultUser();
    const user = await UserModel.findOne({ $or: [{ username: cleanId }, { email: cleanId }] });
    if (!user || user.password !== password) {
      return res.status(401).json({ error: "Usuario o contraseña incorrectos." });
    }
    res.json({ user: await serializeUser(user) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/auth/register', async (req, res) => {
  try {
    const { fullName, username, email, password, career } = req.body;
    const cleanUsername = (username || '').trim().toLowerCase();
    const existing = await UserModel.findOne({ username: cleanUsername });
    if (existing) return res.status(400).json({ error: "El usuario ya existe." });
    
    const selectedCareer = career || 'Psicología Clínica';
    const newUser = new UserModel({
      username: cleanUsername, fullName, email: (email || `${cleanUsername}@universidad.edu`).toLowerCase(),
      password, career: selectedCareer, subjects: getSubjectsForCareer(selectedCareer)
    });
    await newUser.save();
    res.json({ user: await serializeUser(newUser) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/auth/session/:username', async (req, res) => {
  try {
    const cleanU = (req.params.username || '').trim().toLowerCase();
    await ensureDefaultUser();
    let user = await UserModel.findOne({ username: cleanU });
    if (!user) return res.status(404).json({ error: "Usuario no encontrado" });
    res.json({ user: await serializeUser(user) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/subjects', async (req, res) => {
  try {
    const { username, name, section, schedule } = req.body;
    const user = await UserModel.findOne({ username: (username || '').toLowerCase() });
    if (!user) return res.status(401).json({ error: "Sesión no válida" });
    const newSubj = { id: 'subj-' + Date.now(), name, section: section || 'Sección A', schedule: schedule || 'Semestre Actual', documents: [], storybooks: [], exams: [] };
    user.subjects.push(newSubj);
    user.markModified('subjects');
    await user.save();
    res.json({ user: await serializeUser(user), newSubjectId: newSubj.id });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/subjects/:subjectId', async (req, res) => {
  try {
    const { username } = req.body;
    const cleanUsername = (username || '').toLowerCase();
    await DocumentModel.deleteMany({ username: cleanUsername, subjectId: req.params.subjectId });
    const user = await UserModel.findOne({ username: cleanUsername });
    if (user) {
      user.subjects = user.subjects.filter(s => s.id !== req.params.subjectId);
      user.markModified('subjects');
      await user.save();
    }
    res.json({ user: await serializeUser(user) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/documents', upload.any(), async (req, res) => {
  try {
    const { username, subjectId, docTitle, customText, youtubeUrl } = req.body;
    const cleanUsername = (username || '').toLowerCase();
    const user = await UserModel.findOne({ username: cleanUsername });
    if (!user) return res.status(401).json({ error: "Usuario no autenticado" });
    const subject = user.subjects.find(s => s.id === subjectId);
    if (!subject) return res.status(404).json({ error: "Materia no encontrada" });

    const files = req.files || [];
    const dateStr = new Date().toLocaleDateString('es-GT');

    if (youtubeUrl && youtubeUrl.includes('youtu')) {
      const ytContents = [`Extrae y explica con claridad el contenido de la clase en video de YouTube para la carrera ${user.career}: ${youtubeUrl}`];
      const ytRes = await generateWithFallback(ytContents, null);

      const newDoc = new DocumentModel({
        docId: `doc-yt-${Date.now()}`, username: cleanUsername, subjectId,
        title: docTitle || `Video Clase YouTube`, fileName: 'YouTube_Clase.txt', mimeType: 'text/plain',
        base64Data: null, textContent: `Resumen de Clase YouTube:\n${ytRes.text}`, uploadedAt: dateStr
      });
      await newDoc.save();
    }

    if (files.length > 0) {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const newDoc = new DocumentModel({
          docId: `doc-${Date.now()}-${i}`, username: cleanUsername, subjectId,
          title: docTitle ? `${docTitle} (${file.originalname})` : file.originalname,
          fileName: file.originalname, mimeType: file.mimetype,
          base64Data: file.buffer.toString("base64"), textContent: (i === 0 && customText) ? customText : '', uploadedAt: dateStr
        });
        await newDoc.save();
      }
    } else if (customText?.trim() && !youtubeUrl) {
      const newDoc = new DocumentModel({
        docId: `doc-${Date.now()}-txt`, username: cleanUsername, subjectId,
        title: docTitle || 'Apuntes', fileName: 'Apuntes.txt', mimeType: 'text/plain',
        base64Data: null, textContent: customText, uploadedAt: dateStr
      });
      await newDoc.save();
    }
    
    user.aiConsumptionUSD += 0.15;
    await user.save();
    res.json({ user: await serializeUser(user) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/documents/:docId', async (req, res) => {
  try {
    const { username, subjectId } = req.body;
    await DocumentModel.deleteOne({ docId: req.params.docId, username: (username || '').toLowerCase() });
    const user = await UserModel.findOne({ username: username.toLowerCase() });
    if (user) {
      const subj = user.subjects.find(s => s.id === subjectId);
      if (subj) { subj.documents = subj.documents.filter(d => d.id !== req.params.docId); user.markModified('subjects'); await user.save(); }
    }
    res.json({ user: await serializeUser(user) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/storybooks/:sbId', async (req, res) => {
  try {
    const { username, subjectId } = req.body;
    const user = await UserModel.findOne({ username: (username || '').toLowerCase() });
    if (user) {
      const subj = user.subjects.find(s => s.id === subjectId);
      if (subj) {
        subj.storybooks = (subj.storybooks || []).filter(sb => sb.id !== req.params.sbId);
        user.markModified('subjects');
        await user.save();
      }
    }
    res.json({ user: await serializeUser(user) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/subjects/:subjectId/documents', async (req, res) => {
  try {
    const { username } = req.body;
    const cleanUsername = (username || '').toLowerCase();
    await DocumentModel.deleteMany({ username: cleanUsername, subjectId: req.params.subjectId });
    const user = await UserModel.findOne({ username: cleanUsername });
    if (user) {
      const subj = user.subjects.find(s => s.id === req.params.subjectId);
      if (subj) { subj.documents = []; user.markModified('subjects'); await user.save(); }
    }
    res.json({ user: await serializeUser(user) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

async function getFullDocumentsForSubject(username, subject, documentId) {
  const savedDocs = await DocumentModel.find({ username: username.toLowerCase(), subjectId: subject.id }).lean();
  const embeddedDocs = (subject.documents || []).filter(d => d.base64Data || d.textContent);
  const allDocs = [...embeddedDocs, ...savedDocs.map(cd => ({ id: cd.docId, title: cd.title, fileName: cd.fileName, mimeType: cd.mimeType, base64Data: cd.base64Data, textContent: cd.textContent }))];
  if (!documentId || documentId === 'ALL') return allDocs;
  return allDocs.filter(d => d.id === documentId);
}

// 🎧 ENDPOINT AUDIOLIBRO (LECTURA DE PDFs USANDO IA MULTIMODAL)
app.post('/api/audiobook-chapters', async (req, res) => {
  try {
    const { username, subjectId, documentId } = req.body;
    if (!documentId || documentId === 'ALL') return res.status(400).json({ error: "Por favor, selecciona un libro o documento específico del menú para generar el audiolibre." });
    
    const user = await UserModel.findOne({ username: (username || '').toLowerCase() });
    if (!user) return res.status(401).json({ error: "Usuario no autenticado" });
    const subject = user.subjects.find(s => s.id === subjectId);
    if (!subject) return res.status(404).json({ error: "Materia no encontrada" });

    const docs = await getFullDocumentsForSubject(user.username, subject, documentId);
    
    const contents = [
      `Analiza el siguiente documento (ya sea mediante el texto extraído o leyendo el archivo adjunto directamente) y divídelo en capítulos o lecciones lógicas para un audiolibre educativo con enfoque humanista-existencial. Cada capítulo debe tener un título claro y un texto redactado fluidamente para ser escuchado en voz alta:`
    ];

    let hasContent = false;
    for (const doc of docs) {
      // Si el documento es un PDF u otra imagen, pasamos el base64 directo a Gemini
      if (doc.base64Data) {
        contents.push({ inlineData: { data: doc.base64Data, mimeType: doc.mimeType } });
        hasContent = true;
      }
      if (doc.textContent) {
        contents.push(`\n--- Texto del documento ---\n${doc.textContent}`);
        hasContent = true;
      }
    }

    if (!hasContent) {
      return res.status(400).json({ error: "El libro seleccionado está vacío o no contiene datos válidos." });
    }

    const schema = {
      type: Type.OBJECT,
      properties: {
        audiobookTitle: { type: Type.STRING },
        chapters: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: { chapterTitle: { type: Type.STRING }, chapterContent: { type: Type.STRING } },
            required: ["chapterTitle", "chapterContent"]
          }
        }
      },
      required: ["audiobookTitle", "chapters"]
    };

    const response = await generateWithFallback(contents, schema);
    user.aiConsumptionUSD += 0.15;
    await user.save();
    res.json({ audiobook: JSON.parse(response.text), user: await serializeUser(user) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 🏛️ ENDPOINT: ORÁCULO FENOMENOLÓGICO (HUSSERL Y HEIDEGGER EXCLUSIVO)
app.post('/api/phenomenology-query', async (req, res) => {
  try {
    const { username, query } = req.body;
    const user = await UserModel.findOne({ username: (username || '').toLowerCase() });
    if (!user) return res.status(401).json({ error: "Usuario no autenticado" });

    const contents = [
      `Actúa como un purista y máximo académico de la Fenomenología y el Existencialismo continental. 
       REGLA ABSOLUTA: Te centrarás ESTRICTAMENTE en Edmund Husserl y Martin Heidegger. NO usarás, mencionarás ni aplicarás NADA de filosofía analítica, empirismo anglosajón, positivismo lógico (ni Russell, ni Wittgenstein, ni Locke). Todo es puramente continental.
       Explica la siguiente consulta del estudiante usando palabras humanas, profundas y comprensibles para la psicología clínica.
       Consulta: "${query}"`
    ];

    const response = await generateWithFallback(contents, null);
    user.aiConsumptionUSD += 0.10;
    await user.save();
    res.json({ answer: response.text, user: await serializeUser(user) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 📝 SOLICITUD DE TAREAS Y RESÚMENES (HUMANISTA-EXISTENCIAL) LEYENDO PDFs DIRECTAMENTE
app.post('/api/university-homework', async (req, res) => {
  try {
    const { username, subjectId, promptTask } = req.body;
    const user = await UserModel.findOne({ username: (username || '').toLowerCase() });
    if (!user) return res.status(401).json({ error: "Usuario no autenticado" });
    const subject = user.subjects.find(s => s.id === subjectId);
    if (!subject) return res.status(404).json({ error: "Materia no encontrada" });

    const allDocs = await getFullDocumentsForSubject(user.username, subject, 'ALL');
    const contents = [
      `Actúa como mentor y profesor universitario experto en la carrera de "${user.career}", impartiendo la materia "${subject.name}".
      INSTRUCCIÓN ESTRICTA Y METODOLÓGICA:
      - Realiza el resumen o resolución solicitado basándote en los documentos del repositorio (adjuntos a continuación).
      - ENFOQUE OBLIGATORIO: Utiliza un método humanista-existencial (enfocado en la vivencia subjetiva, el sentido, la libertad y la experiencia humana real) y un tono profesional pero 100% en palabras humanas, cálidas y de puro entendimiento, PROHIBIDO el uso de jerga fría sin explicación.
      - Solicitud del estudiante: "${promptTask}"`
    ];
    
    let hasContent = false;
    for (const doc of allDocs) {
      if (doc.base64Data) { contents.push({ inlineData: { data: doc.base64Data, mimeType: doc.mimeType } }); hasContent = true; }
      if (doc.textContent) { contents.push(`[${doc.title}]:\n${doc.textContent}`); hasContent = true; }
    }
    
    if (!hasContent) {
      return res.status(400).json({ error: "Debes subir al menos un PDF o texto en el repositorio para que la IA pueda resolver la tarea."});
    }

    const response = await generateWithFallback(contents, null);
    user.aiConsumptionUSD += 0.12;
    await user.save();
    res.json({ result: response.text, user: await serializeUser(user) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/socratic-debate', async (req, res) => {
  try {
    const { username, subjectId, philosopher, message, history } = req.body;
    const user = await UserModel.findOne({ username: (username || '').toLowerCase() });
    if (!user) return res.status(401).json({ error: "Usuario no autenticado" });
    const subject = user.subjects.find(s => s.id === subjectId);
    if (!subject) return res.status(404).json({ error: "Materia no encontrada" });

    const allDocs = await getFullDocumentsForSubject(user.username, subject, 'ALL');
    const contents = [`Actúa como el experto: "${philosopher}". Carrera del estudiante: ${user.career}. Historial: ${history}. Intervención: "${message}". Responde con enfoque humanista-existencial, leyendo los documentos adjuntos si es necesario.`];
    
    for (const doc of allDocs) {
      if (doc.base64Data) contents.push({ inlineData: { data: doc.base64Data, mimeType: doc.mimeType } });
      if (doc.textContent) contents.push(`[${doc.title}]:\n${doc.textContent}`);
    }

    const response = await generateWithFallback(contents, null);
    user.aiConsumptionUSD += 0.08;
    await user.save();
    res.json({ reply: response.text, user: await serializeUser(user) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/generate-timeline-map', async (req, res) => {
  try {
    const { username, subjectId, documentId } = req.body;
    const user = await UserModel.findOne({ username: (username || '').toLowerCase() });
    if (!user) return res.status(401).json({ error: "Usuario no autenticado" });
    const subject = user.subjects.find(s => s.id === subjectId);
    
    const docs = await getFullDocumentsForSubject(user.username, subject, documentId);
    const contents = [`Genera una línea de tiempo para ${subject.name} con perspectiva humana usando los documentos adjuntos.`];
    
    let hasContent = false;
    for (const doc of docs) { 
      if (doc.base64Data) { contents.push({ inlineData: { data: doc.base64Data, mimeType: doc.mimeType } }); hasContent = true; }
      if (doc.textContent) { contents.push(`[${doc.title}]:\n${doc.textContent}`); hasContent = true; }
    }
    if (!hasContent) return res.status(400).json({ error: "Documento vacío." });

    const schema = { type: Type.OBJECT, properties: { timelineTitle: { type: Type.STRING }, eras: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { eraName: { type: Type.STRING }, mainAuthor: { type: Type.STRING }, coreIdea: { type: Type.STRING }, refutationOrLink: { type: Type.STRING } }, required: ["eraName", "mainAuthor", "coreIdea", "refutationOrLink"] } } }, required: ["timelineTitle", "eras"] };
    const response = await generateWithFallback(contents, schema);
    
    user.aiConsumptionUSD += 0.20; await user.save();
    res.json({ timelineMap: JSON.parse(response.text), user: await serializeUser(user) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/generate-mindmap', async (req, res) => {
  try {
    const { username, subjectId, documentId } = req.body;
    const user = await UserModel.findOne({ username: (username || '').toLowerCase() });
    const subject = user.subjects.find(s => s.id === subjectId);
    
    const docs = await getFullDocumentsForSubject(user.username, subject, documentId);
    const contents = [`Genera un mapa conceptual para ${subject.name} usando los documentos adjuntos.`];
    
    let hasContent = false;
    for (const doc of docs) { 
      if (doc.base64Data) { contents.push({ inlineData: { data: doc.base64Data, mimeType: doc.mimeType } }); hasContent = true; }
      if (doc.textContent) { contents.push(`[${doc.title}]:\n${doc.textContent}`); hasContent = true; }
    }
    if (!hasContent) return res.status(400).json({ error: "Documento vacío." });

    const schema = { type: Type.OBJECT, properties: { centralTopic: { type: Type.STRING }, branches: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { branchName: { type: Type.STRING }, subitems: { type: Type.ARRAY, items: { type: Type.STRING } } }, required: ["branchName", "subitems"] } } }, required: ["centralTopic", "branches"] };
    const response = await generateWithFallback(contents, schema);
    
    user.aiConsumptionUSD += 0.15; await user.save();
    res.json({ mindmap: JSON.parse(response.text), user: await serializeUser(user) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/rag-search', async (req, res) => {
  try {
    const { username, subjectId, query } = req.body;
    const user = await UserModel.findOne({ username: (username || '').toLowerCase() });
    const subject = user.subjects.find(s => s.id === subjectId);
    
    const allDocs = await getFullDocumentsForSubject(user.username, subject, 'ALL');
    const contents = [`Explica con enfoque existencial basándote en los adjuntos: "${query}"`];
    
    for (const doc of allDocs) { 
      if (doc.base64Data) contents.push({ inlineData: { data: doc.base64Data, mimeType: doc.mimeType } });
      if (doc.textContent) contents.push(`[${doc.title}]:\n${doc.textContent}`);
    }

    const response = await generateWithFallback(contents, null);
    user.aiConsumptionUSD += 0.10; await user.save();
    res.json({ answer: response.text, user: await serializeUser(user) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/generate-flashcards', async (req, res) => {
  try {
    const { username, subjectId, documentId } = req.body;
    const user = await UserModel.findOne({ username: (username || '').toLowerCase() });
    const subject = user.subjects.find(s => s.id === subjectId);
    
    const docs = await getFullDocumentsForSubject(user.username, subject, documentId);
    const contents = [`Genera 6 fichas de estudio con lenguaje humano basadas en el documento adjunto.`];
    
    let hasContent = false;
    for (const doc of docs) { 
      if (doc.base64Data) { contents.push({ inlineData: { data: doc.base64Data, mimeType: doc.mimeType } }); hasContent = true; }
      if (doc.textContent) { contents.push(`[${doc.title}]:\n${doc.textContent}`); hasContent = true; }
    }
    if (!hasContent) return res.status(400).json({ error: "Documento vacío." });

    const schema = { type: Type.OBJECT, properties: { flashcards: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { question: { type: Type.STRING }, answer: { type: Type.STRING }, hint: { type: Type.STRING } }, required: ["question", "answer", "hint"] } } }, required: ["flashcards"] };
    const response = await generateWithFallback(contents, schema);
    
    user.aiConsumptionUSD += 0.15; await user.save();
    res.json({ flashcards: JSON.parse(response.text).flashcards, user: await serializeUser(user) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/generate-storybook', async (req, res) => {
  try {
    const { username, subjectId, documentId, focusTopic } = req.body;
    const user = await UserModel.findOne({ username: (username || '').toLowerCase() });
    const subject = user.subjects.find(s => s.id === subjectId);

    const selectedDocs = await getFullDocumentsForSubject(user.username, subject, documentId);
    const contents = [`Crea una monografía académica con enfoque humanista sobre ${subject.name} basada en el documento adjunto. Incluye resumen, línea de tiempo, escenas por autores, y trivia gamificada.`];
    
    let hasContent = false;
    for (const doc of selectedDocs) { 
      if (doc.base64Data) { contents.push({ inlineData: { data: doc.base64Data, mimeType: doc.mimeType } }); hasContent = true; }
      if (doc.textContent) { contents.push(`Texto (${doc.title}):\n${doc.textContent}`); hasContent = true; }
    }
    if (!hasContent) return res.status(400).json({ error: "Documento vacío." });

    const schema = { type: Type.OBJECT, properties: { title: { type: Type.STRING }, universe: { type: Type.STRING }, summary: { type: Type.STRING }, scenes: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { sceneNumber: { type: Type.INTEGER }, characterName: { type: Type.STRING }, academicConcept: { type: Type.STRING }, storyDialogue: { type: Type.STRING }, memoryTrick: { type: Type.STRING }, animationEffect: { type: Type.STRING } }, required: ["sceneNumber", "characterName", "academicConcept", "storyDialogue", "memoryTrick", "animationEffect"] } }, timeline: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { step: { type: Type.INTEGER }, title: { type: Type.STRING }, description: { type: Type.STRING } }, required: ["step", "title", "description"] } }, quiz: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { question: { type: Type.STRING }, options: { type: Type.ARRAY, items: { type: Type.STRING } }, correctIndex: { type: Type.INTEGER }, heroExplanation: { type: Type.STRING } }, required: ["question", "options", "correctIndex", "heroExplanation"] } } }, required: ["title", "universe", "summary", "scenes", "timeline", "quiz"] };
    
    const response = await generateWithFallback(contents, schema);
    const sbData = JSON.parse(response.text);

    user.aiConsumptionUSD += 0.25; user.storybooksCreated += 1;
    const newStorybook = { id: 'sb-' + Date.now(), createdAt: new Date().toLocaleString('es-GT'), sourceDocTitle: selectedDocs.map(d => d.title).join(' + ') || focusTopic, ...sbData };
    subject.storybooks.push(newStorybook); user.markModified('subjects'); await user.save();

    res.json({ storybook: newStorybook, user: await serializeUser(user) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Servidor universitario activo en puerto ${PORT}`));
