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

// SCHEMA ACTUALIZADO CON ROLES, TOKENS Y RECUPERACIÓN
const UserSchema = new mongoose.Schema({
  username: { type: String, unique: true, lowercase: true },
  fullName: String,
  email: { type: String, lowercase: true },
  password: String,
  recoveryWord: String, // Palabra clave para resetear contraseña
  career: String,
  role: { type: String, default: 'student' }, // 'admin' o 'student'
  aiAllowanceUSD: { type: Number, default: 2.00 }, // Saldo total asignado al inicio
  aiConsumptionUSD: { type: Number, default: 0 }, // Saldo gastado
  pendingTokenRequest: { type: Boolean, default: false }, // ¿Pidió más saldo?
  storybooksCreated: { type: Number, default: 0 },
  subjects: Array
});

const UserModel = mongoose.model('User', UserSchema);

async function ensureDefaultUsers() {
  try {
    // 1. Crear el usuario administrador MASTER
    let admin = await UserModel.findOne({ username: 'master' });
    if (!admin) {
      await new UserModel({
        username: 'master',
        fullName: 'Administrador Maestro',
        email: 'master@universidad.edu',
        password: 'master123',
        recoveryWord: 'admin',
        career: 'Administración de Sistemas',
        role: 'admin',
        aiAllowanceUSD: 1000.00, // Saldo casi infinito para el admin
        subjects: []
      }).save();
    }
  } catch (e) {
    console.error("Error al asegurar usuarios por defecto:", e.message);
  }
}

const MONGO_URI = (process.env.MONGO_URI || '').trim();

async function connectDB() {
  if (!MONGO_URI) throw new Error("MONGO_URI no configurada.");
  if (mongoose.connection.readyState === 1) return;
  try {
    await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 5000 });
    console.log("✅ MongoDB conectado correctamente.");
    await ensureDefaultUsers();
  } catch (err) {
    console.error("❌ Error Crítico de MongoDB:", err.message);
    throw err;
  }
}

connectDB().catch(() => console.log("Se reintentará conectar con la primera petición..."));

app.use('/api', async (req, res, next) => {
  try {
    if (mongoose.connection.readyState !== 1) await connectDB();
    next();
  } catch (error) {
    return res.status(500).json({ error: "Sin conexión a la base de datos." });
  }
});

async function serializeUser(user) {
  const obj = user.toObject();
  delete obj.password; // Ocultar password por seguridad
  const savedDocs = await DocumentModel.find({ username: obj.username }, { base64Data: 0, textContent: 0 }).lean();
  obj.subjects = (obj.subjects || []).map(s => {
    const embeddedDocs = (s.documents || []).map(d => ({ id: d.id, title: d.title, fileName: d.fileName }));
    const collectionDocs = savedDocs.filter(cd => cd.subjectId === s.id).map(cd => ({ id: cd.docId, title: cd.title, fileName: cd.fileName }));
    const map = new Map();
    [...embeddedDocs, ...collectionDocs].forEach(item => map.set(item.id, item));
    return { ...s, documents: Array.from(map.values()), storybooks: s.storybooks || [], audiobooks: s.audiobooks || [] };
  });
  return obj;
}

// ================= RUTA DE AUTENTICACIÓN =================
app.post('/api/auth/login', async (req, res) => {
  try {
    const { identifier, password } = req.body;
    const cleanId = (identifier || '').trim().toLowerCase();
    await ensureDefaultUsers();
    const user = await UserModel.findOne({ $or: [{ username: cleanId }, { email: cleanId }] });
    if (!user || user.password !== password) return res.status(401).json({ error: "Usuario o contraseña incorrectos." });
    res.json({ user: await serializeUser(user) });
  } catch (err) { res.status(500).json({ error: "Fallo interno: " + err.message }); }
});

app.post('/api/auth/register', async (req, res) => {
  try {
    const { fullName, username, email, password, recoveryWord, career } = req.body;
    const cleanUsername = (username || '').trim().toLowerCase();
    const existing = await UserModel.findOne({ username: cleanUsername });
    if (existing) return res.status(400).json({ error: "El usuario ya existe." });
    
    const newUser = new UserModel({
      username: cleanUsername, fullName, email: (email || `${cleanUsername}@universidad.edu`).toLowerCase(),
      password, recoveryWord, career: career || 'Estudios Generales',
      subjects: [{ id: 'subj-init', name: 'Mi Primera Materia', section: 'A', schedule: 'Semestre 1', documents: [], storybooks: [], audiobooks: [] }]
    });
    await newUser.save();
    res.json({ user: await serializeUser(newUser) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/auth/session/:username', async (req, res) => {
  try {
    const user = await UserModel.findOne({ username: req.params.username.trim().toLowerCase() });
    if (!user) return res.status(404).json({ error: "Usuario no encontrado" });
    res.json({ user: await serializeUser(user) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ================= RECUPERACIÓN DE CONTRASEÑA =================
app.post('/api/auth/reset-password', async (req, res) => {
  try {
    const { username, recoveryWord, newPassword } = req.body;
    const user = await UserModel.findOne({ username: username.toLowerCase() });
    if (!user) return res.status(404).json({ error: "Usuario no existe." });
    if (user.recoveryWord !== recoveryWord) return res.status(401).json({ error: "Palabra clave de recuperación incorrecta." });
    
    user.password = newPassword;
    await user.save();
    res.json({ success: true, message: "Contraseña actualizada exitosamente." });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ================= PANEL DE ADMINISTRADOR MASTER =================
app.get('/api/admin/users', async (req, res) => {
  try {
    const requester = await UserModel.findOne({ username: req.headers['x-user'] });
    if (!requester || requester.role !== 'admin') return res.status(403).json({ error: "Acceso denegado." });
    const users = await UserModel.find({}, { password: 0, recoveryWord: 0 }); // Todo menos info sensible
    res.json(users);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/admin/add-tokens', async (req, res) => {
  try {
    const requester = await UserModel.findOne({ username: req.headers['x-user'] });
    if (!requester || requester.role !== 'admin') return res.status(403).json({ error: "Acceso denegado." });
    
    const targetUser = await UserModel.findOne({ username: req.body.targetUsername });
    if (!targetUser) return res.status(404).json({ error: "Usuario no encontrado." });

    targetUser.aiAllowanceUSD += parseFloat(req.body.amount);
    targetUser.pendingTokenRequest = false;
    await targetUser.save();
    res.json({ success: true, user: await serializeUser(targetUser) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/admin/force-reset', async (req, res) => {
  try {
    const requester = await UserModel.findOne({ username: req.headers['x-user'] });
    if (!requester || requester.role !== 'admin') return res.status(403).json({ error: "Acceso denegado." });
    
    const targetUser = await UserModel.findOne({ username: req.body.targetUsername });
    targetUser.password = req.body.newPassword;
    await targetUser.save();
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ================= SOLICITUD DE TOKENS DEL ESTUDIANTE =================
app.post('/api/user/request-tokens', async (req, res) => {
  try {
    const user = await UserModel.findOne({ username: req.body.username });
    user.pendingTokenRequest = true;
    await user.save();
    res.json({ success: true, user: await serializeUser(user) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ================= GESTIÓN DE MATERIAS Y ARCHIVOS =================
app.post('/api/subjects', async (req, res) => {
  try {
    const { username, name, schedule } = req.body;
    const user = await UserModel.findOne({ username: (username || '').toLowerCase() });
    const newSubj = { id: 'subj-' + Date.now(), name, schedule: schedule || 'Semestre Actual', documents: [], storybooks: [], audiobooks: [] };
    user.subjects.push(newSubj);
    user.markModified('subjects');
    await user.save();
    res.json({ user: await serializeUser(user), newSubjectId: newSubj.id });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/subjects/:subjectId', async (req, res) => {
  try {
    const user = await UserModel.findOne({ username: req.body.username.toLowerCase() });
    await DocumentModel.deleteMany({ username: user.username, subjectId: req.params.subjectId });
    user.subjects = user.subjects.filter(s => s.id !== req.params.subjectId);
    user.markModified('subjects');
    await user.save();
    res.json({ user: await serializeUser(user) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/documents', upload.any(), async (req, res) => {
  try {
    const { username, subjectId, docTitle } = req.body;
    const user = await UserModel.findOne({ username: username.toLowerCase() });
    const dateStr = new Date().toLocaleDateString('es-GT');
    for (let file of req.files || []) {
      await new DocumentModel({
        docId: `doc-${Date.now()}-${Math.random()}`, username: user.username, subjectId,
        title: docTitle ? `${docTitle} (${file.originalname})` : file.originalname,
        fileName: file.originalname, mimeType: file.mimetype,
        base64Data: file.buffer.toString("base64"), textContent: '', uploadedAt: dateStr
      }).save();
    }
    res.json({ user: await serializeUser(user) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/documents/:docId', async (req, res) => {
  try {
    await DocumentModel.deleteOne({ docId: req.params.docId, username: req.body.username.toLowerCase() });
    const user = await UserModel.findOne({ username: req.body.username.toLowerCase() });
    res.json({ user: await serializeUser(user) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// NUEVO: Eliminar Audiolibros de la Bitácora
app.delete('/api/audiobooks/:abId', async (req, res) => {
  try {
    const user = await UserModel.findOne({ username: req.body.username.toLowerCase() });
    const subj = user.subjects.find(s => s.id === req.body.subjectId);
    subj.audiobooks = subj.audiobooks.filter(ab => ab.id !== req.params.abId);
    user.markModified('subjects');
    await user.save();
    res.json({ user: await serializeUser(user) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/storybooks/:sbId', async (req, res) => {
  try {
    const user = await UserModel.findOne({ username: req.body.username.toLowerCase() });
    const subj = user.subjects.find(s => s.id === req.body.subjectId);
    subj.storybooks = subj.storybooks.filter(sb => sb.id !== req.params.sbId);
    user.markModified('subjects');
    await user.save();
    res.json({ user: await serializeUser(user) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/subjects/:subjectId/documents', async (req, res) => {
  try {
    const user = await UserModel.findOne({ username: req.body.username.toLowerCase() });
    await DocumentModel.deleteMany({ username: user.username, subjectId: req.params.subjectId });
    const subj = user.subjects.find(s => s.id === req.params.subjectId);
    if (subj) { subj.documents = []; user.markModified('subjects'); await user.save(); }
    res.json({ user: await serializeUser(user) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ================= COMPROBACIÓN DE SALDO IA =================
async function consumeTokens(user, costUSD) {
  if (user.role === 'admin') return true; // El admin tiene recursos ilimitados
  const remaining = user.aiAllowanceUSD - user.aiConsumptionUSD;
  if (remaining < costUSD) throw new Error("Saldo de IA insuficiente. Solicita más Tokens a tu administrador.");
  user.aiConsumptionUSD += costUSD;
  return true;
}

async function getFullDocumentsForSubject(username, subjectId, documentId) {
  const docs = await DocumentModel.find({ username, subjectId }).lean();
  if (documentId === 'ALL') return docs;
  return docs.filter(d => d.docId === documentId);
}

// 🎧 ENDPOINT AUDIOLIBRO COMPLETO (CON BITÁCORA)
app.post('/api/audiobook-chapters', async (req, res) => {
  try {
    const user = await UserModel.findOne({ username: req.body.username.toLowerCase() });
    await consumeTokens(user, 0.25); // Cuesta 25 centavos
    
    const docs = await getFullDocumentsForSubject(user.username, req.body.subjectId, req.body.documentId);
    const contents = [
      `Analiza el siguiente documento y prepáralo para un audiolibro.
       INSTRUCCIÓN ABSOLUTA: Extrae el texto ORIGINAL y COMPLETO de la obra. NO HAGAS RESÚMENES.
       Divide el texto íntegro en capítulos largos (chapterContent).
       Adicionalmente, genera un resumen ejecutivo del libro (bookSummary) para descarga.`
    ];
    docs.forEach(doc => contents.push({ inlineData: { data: doc.base64Data, mimeType: doc.mimeType } }));
    
    if (docs.length === 0) throw new Error("El libro está vacío o es ilegible.");

    const schema = {
      type: Type.OBJECT,
      properties: {
        audiobookTitle: { type: Type.STRING },
        bookSummary: { type: Type.STRING },
        chapters: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: { chapterTitle: { type: Type.STRING }, chapterContent: { type: Type.STRING } },
            required: ["chapterTitle", "chapterContent"]
          }
        }
      },
      required: ["audiobookTitle", "bookSummary", "chapters"]
    };

    const response = await generateWithFallback(contents, schema);
    const abData = JSON.parse(response.text);

    // Guardar en bitácora permanentemente
    const newAudiobook = {
      id: 'ab-' + Date.now(),
      createdAt: new Date().toLocaleString('es-GT'),
      audiobookTitle: abData.audiobookTitle || "Audiolibro Completo",
      bookSummary: abData.bookSummary || "Resumen no disponible.",
      chapters: abData.chapters || []
    };

    const subj = user.subjects.find(s => s.id === req.body.subjectId);
    subj.audiobooks = subj.audiobooks || [];
    subj.audiobooks.push(newAudiobook);

    user.markModified('subjects');
    await user.save();

    res.json({ audiobook: newAudiobook, user: await serializeUser(user) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 🏛️ ENDPOINT: ORÁCULO FENOMENOLÓGICO
app.post('/api/phenomenology-query', async (req, res) => {
  try {
    const user = await UserModel.findOne({ username: req.body.username.toLowerCase() });
    await consumeTokens(user, 0.05);
    const response = await generateWithFallback([`Actúa como purista de Husserl y Heidegger. Explica profundo: ${req.body.query}`], null);
    await user.save();
    res.json({ answer: response.text, user: await serializeUser(user) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 📝 MÓDULO DE TAREAS Y RESÚMENES HUMANISTAS
app.post('/api/university-homework', async (req, res) => {
  try {
    const user = await UserModel.findOne({ username: req.body.username.toLowerCase() });
    await consumeTokens(user, 0.15);
    const docs = await getFullDocumentsForSubject(user.username, req.body.subjectId, 'ALL');
    const contents = [`Actúa como profesor experto. Aplica método humanista-existencial. Resuelve la solicitud leyendo los documentos adjuntos: "${req.body.promptTask}"`];
    docs.forEach(doc => contents.push({ inlineData: { data: doc.base64Data, mimeType: doc.mimeType } }));
    
    const response = await generateWithFallback(contents, null);
    await user.save();
    res.json({ result: response.text, user: await serializeUser(user) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// OTRAS HERRAMIENTAS DE IA
app.post('/api/socratic-debate', async (req, res) => {
  try {
    const user = await UserModel.findOne({ username: req.body.username.toLowerCase() });
    await consumeTokens(user, 0.08);
    const response = await generateWithFallback([`Actúa como el experto: "${req.body.philosopher}". Historial: ${req.body.history}. Responde al estudiante: "${req.body.message}"`], null);
    await user.save();
    res.json({ reply: response.text, user: await serializeUser(user) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/generate-timeline-map', async (req, res) => {
  try {
    const user = await UserModel.findOne({ username: req.body.username.toLowerCase() });
    await consumeTokens(user, 0.20);
    const docs = await getFullDocumentsForSubject(user.username, req.body.subjectId, req.body.documentId);
    const contents = [`Genera una línea de tiempo para la materia usando los documentos adjuntos.`];
    docs.forEach(doc => contents.push({ inlineData: { data: doc.base64Data, mimeType: doc.mimeType } }));
    
    const schema = { type: Type.OBJECT, properties: { timelineTitle: { type: Type.STRING }, eras: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { eraName: { type: Type.STRING }, mainAuthor: { type: Type.STRING }, coreIdea: { type: Type.STRING }, refutationOrLink: { type: Type.STRING } }, required: ["eraName", "mainAuthor", "coreIdea", "refutationOrLink"] } } }, required: ["timelineTitle", "eras"] };
    const response = await generateWithFallback(contents, schema);
    await user.save();
    res.json({ timelineMap: JSON.parse(response.text), user: await serializeUser(user) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/generate-mindmap', async (req, res) => {
  try {
    const user = await UserModel.findOne({ username: req.body.username.toLowerCase() });
    await consumeTokens(user, 0.15);
    const docs = await getFullDocumentsForSubject(user.username, req.body.subjectId, req.body.documentId);
    const contents = [`Genera un mapa conceptual usando los documentos adjuntos.`];
    docs.forEach(doc => contents.push({ inlineData: { data: doc.base64Data, mimeType: doc.mimeType } }));

    const schema = { type: Type.OBJECT, properties: { centralTopic: { type: Type.STRING }, branches: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { branchName: { type: Type.STRING }, subitems: { type: Type.ARRAY, items: { type: Type.STRING } } }, required: ["branchName", "subitems"] } } }, required: ["centralTopic", "branches"] };
    const response = await generateWithFallback(contents, schema);
    await user.save();
    res.json({ mindmap: JSON.parse(response.text), user: await serializeUser(user) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/generate-flashcards', async (req, res) => {
  try {
    const user = await UserModel.findOne({ username: req.body.username.toLowerCase() });
    await consumeTokens(user, 0.15);
    const docs = await getFullDocumentsForSubject(user.username, req.body.subjectId, req.body.documentId);
    const contents = [`Genera 6 fichas de estudio basadas en el documento adjunto.`];
    docs.forEach(doc => contents.push({ inlineData: { data: doc.base64Data, mimeType: doc.mimeType } }));

    const schema = { type: Type.OBJECT, properties: { flashcards: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { question: { type: Type.STRING }, answer: { type: Type.STRING }, hint: { type: Type.STRING } }, required: ["question", "answer", "hint"] } } }, required: ["flashcards"] };
    const response = await generateWithFallback(contents, schema);
    await user.save();
    res.json({ flashcards: JSON.parse(response.text).flashcards, user: await serializeUser(user) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/generate-storybook', async (req, res) => {
  try {
    const user = await UserModel.findOne({ username: req.body.username.toLowerCase() });
    await consumeTokens(user, 0.20);
    const docs = await getFullDocumentsForSubject(user.username, req.body.subjectId, req.body.documentId);
    const contents = [`Crea una monografía académica gamificada basada en el documento.`];
    docs.forEach(doc => contents.push({ inlineData: { data: doc.base64Data, mimeType: doc.mimeType } }));

    const schema = { type: Type.OBJECT, properties: { title: { type: Type.STRING }, summary: { type: Type.STRING }, scenes: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { sceneNumber: { type: Type.INTEGER }, characterName: { type: Type.STRING }, academicConcept: { type: Type.STRING }, storyDialogue: { type: Type.STRING } }, required: ["sceneNumber", "characterName", "academicConcept", "storyDialogue"] } }, timeline: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { step: { type: Type.INTEGER }, title: { type: Type.STRING }, description: { type: Type.STRING } }, required: ["step", "title", "description"] } }, quiz: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { question: { type: Type.STRING }, options: { type: Type.ARRAY, items: { type: Type.STRING } }, correctIndex: { type: Type.INTEGER }, heroExplanation: { type: Type.STRING } }, required: ["question", "options", "correctIndex", "heroExplanation"] } } }, required: ["title", "summary", "scenes", "timeline", "quiz"] };
    const response = await generateWithFallback(contents, schema);
    
    const newStorybook = { id: 'sb-' + Date.now(), ...JSON.parse(response.text) };
    const subj = user.subjects.find(s => s.id === req.body.subjectId);
    subj.storybooks = subj.storybooks || [];
    subj.storybooks.push(newStorybook);
    user.markModified('subjects'); await user.save();
    
    res.json({ storybook: newStorybook, user: await serializeUser(user) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Servidor universitario activo en puerto ${PORT}`));
