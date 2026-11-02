import express from 'express';
import multer from 'multer';
import mongoose from 'mongoose';
import { GoogleGenAI, Type } from '@google/genai';
import path from 'path';
import { fileURLToPath } from 'url';
import Stripe from 'stripe';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// ================= STRIPE WEBHOOK (Debe ir ANTES del express.json) =================
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_tu_key_aqui');

app.post('/webhook/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error(`Webhook Error: ${err.message}`);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    // Generamos un nombre de BD único, ej: institucion_cus_12345
    const dbName = `institucion_${session.customer.toLowerCase().replace('cus_', '')}`;
    
    try {
      // 1. Registrar a la Institución en la BD Master
      await TenantModel.create({
        companyName: session.custom_fields?.[0]?.text?.value || "Nueva Institución",
        dbName: dbName,
        stripeCustomerId: session.customer,
        subscriptionStatus: 'active'
      });

      // 2. Conectarse a la nueva BD física del cliente
      const tenantDb = mongoose.connection.useDb(dbName, { useCache: true });
      const TenantUser = tenantDb.model('User', UserSchema);

      // 3. Crear el Administrador Maestro para este colegio/universidad
      await TenantUser.create({
        username: 'master',
        fullName: 'Administrador Maestro',
        email: session.customer_details.email,
        password: 'admin_temporal_123',
        role: 'admin',
        aiAllowanceUSD: 50.00, // Bolsón de Tokens Inicial
        subjects: []
      });
      console.log(`✅ Base de datos ${dbName} creada para nuevo cliente.`);
    } catch (e) {
      console.error("Error aprovisionando tenant:", e);
    }
  }
  res.json({ received: true });
});

// ================= CONFIGURACIÓN BÁSICA =================
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

// ================= ESQUEMAS DE BASE DE DATOS =================
// 1. Esquema Master (SaaS Control - COMPILADO GLOBALMENTE)
const TenantSchema = new mongoose.Schema({
  companyName: String,
  dbName: { type: String, unique: true },
  stripeCustomerId: String,
  subscriptionStatus: { type: String, default: 'active' },
  createdAt: { type: Date, default: Date.now }
});
const TenantModel = mongoose.model('Tenant', TenantSchema);

// 2. Esquemas Tenant (NO SE COMPILAN GLOBALMENTE)
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

const UserSchema = new mongoose.Schema({
  username: { type: String, unique: true, lowercase: true },
  fullName: String,
  email: { type: String, lowercase: true },
  password: String,
  recoveryWord: String,
  career: String,
  role: { type: String, default: 'student' }, 
  aiAllowanceUSD: { type: Number, default: 2.00 },
  aiConsumptionUSD: { type: Number, default: 0 },
  pendingTokenRequest: { type: Boolean, default: false },
  storybooksCreated: { type: Number, default: 0 },
  subjects: Array
});

const MONGO_URI = (process.env.MONGO_URI || '').trim();
async function connectDB() {
  if (!MONGO_URI) throw new Error("MONGO_URI no configurada.");
  if (mongoose.connection.readyState === 1) return;
  try {
    await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 5000 });
    console.log("✅ MongoDB Master conectado correctamente.");
    
    // Crear un tenant de prueba si no existe (Para desarrollo)
    const testDbName = 'institucion_demo';
    const existing = await TenantModel.findOne({ dbName: testDbName });
    if (!existing) {
      await TenantModel.create({ companyName: "Universidad Demo", dbName: testDbName, stripeCustomerId: 'demo_123' });
      const demoDb = mongoose.connection.useDb(testDbName);
      const DemoUser = demoDb.model('User', UserSchema);
      await DemoUser.create({ username: 'master', fullName: 'Admin Master Demo', email: 'admin@demo.com', password: 'master123', role: 'admin', aiAllowanceUSD: 999 });
    }
  } catch (err) {
    console.error("❌ Error Crítico de MongoDB:", err.message);
    throw err;
  }
}
connectDB().catch(() => console.log("Se reintentará conectar con la primera petición..."));

// ================= MIDDLEWARE MULTI-TENANT ENRUTADOR =================
app.use('/api', async (req, res, next) => {
  try {
    if (mongoose.connection.readyState !== 1) await connectDB();
    
    const tenantId = req.headers['x-tenant-id'];
    if (!tenantId) return res.status(400).json({ error: "Falta el código de la institución (Tenant ID)." });

    const cleanTenantId = tenantId.trim().toLowerCase();
    const tenant = await TenantModel.findOne({ dbName: cleanTenantId });
    
    if (!tenant || tenant.subscriptionStatus !== 'active') {
      return res.status(403).json({ error: "Institución no encontrada o suscripción inactiva." });
    }

    // Cambiar dinámicamente de Base de Datos
    const tenantDb = mongoose.connection.useDb(tenant.dbName, { useCache: true });
    
    // Inyectar modelos en el request para que los endpoints los usen
    req.UserModel = tenantDb.model('User', UserSchema);
    req.DocumentModel = tenantDb.model('Document', DocumentSchema);

    next();
  } catch (error) {
    return res.status(500).json({ error: "Sin conexión a la base de datos del Tenant." });
  }
});

async function serializeUser(user, DocumentModelRef) {
  const obj = user.toObject();
  delete obj.password;
  const savedDocs = await DocumentModelRef.find({ username: obj.username }, { base64Data: 0, textContent: 0 }).lean();
  obj.subjects = (obj.subjects || []).map(s => {
    const embeddedDocs = (s.documents || []).map(d => ({ id: d.id, title: d.title, fileName: d.fileName }));
    const collectionDocs = savedDocs.filter(cd => cd.subjectId === s.id).map(cd => ({ id: cd.docId, title: cd.title, fileName: cd.fileName }));
    const map = new Map();
    [...embeddedDocs, ...collectionDocs].forEach(item => map.set(item.id, item));
    return { ...s, documents: Array.from(map.values()), storybooks: s.storybooks || [], audiobooks: s.audiobooks || [] };
  });
  return obj;
}

// ================= AUTENTICACIÓN Y CONTRASEÑAS =================
app.post('/api/auth/login', async (req, res) => {
  try {
    const { identifier, password } = req.body;
    const cleanId = (identifier || '').trim().toLowerCase();
    const user = await req.UserModel.findOne({ $or: [{ username: cleanId }, { email: cleanId }] });
    if (!user || user.password !== password) return res.status(401).json({ error: "Usuario o contraseña incorrectos." });
    res.json({ user: await serializeUser(user, req.DocumentModel) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/auth/register', async (req, res) => {
  try {
    const { fullName, username, email, password, recoveryWord, career } = req.body;
    const cleanUsername = (username || '').trim().toLowerCase();
    if (await req.UserModel.findOne({ username: cleanUsername })) return res.status(400).json({ error: "El usuario ya existe." });
    
    const newUser = new req.UserModel({
      username: cleanUsername, fullName, email: (email || `${cleanUsername}@universidad.edu`).toLowerCase(),
      password, recoveryWord, career: career || 'Estudios Generales',
      subjects: [{ id: 'subj-init', name: 'Mi Primera Materia', schedule: 'Semestre 1', documents: [], storybooks: [], audiobooks: [] }]
    });
    await newUser.save();
    res.json({ user: await serializeUser(newUser, req.DocumentModel) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/auth/session/:username', async (req, res) => {
  try {
    const user = await req.UserModel.findOne({ username: req.params.username.trim().toLowerCase() });
    if (!user) return res.status(404).json({ error: "Usuario no encontrado" });
    res.json({ user: await serializeUser(user, req.DocumentModel) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/auth/reset-password', async (req, res) => {
  try {
    const { username, recoveryWord, newPassword } = req.body;
    const user = await req.UserModel.findOne({ username: username.toLowerCase() });
    if (!user) return res.status(404).json({ error: "Usuario no existe." });
    if (user.recoveryWord !== recoveryWord) return res.status(401).json({ error: "Palabra clave de recuperación incorrecta." });
    user.password = newPassword;
    await user.save();
    res.json({ success: true, message: "Contraseña actualizada exitosamente." });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/user/change-password', async (req, res) => {
  try {
    const { username, oldPassword, newPassword } = req.body;
    const user = await req.UserModel.findOne({ username: username.toLowerCase() });
    if (!user) return res.status(404).json({ error: "Usuario no encontrado." });
    if (user.password !== oldPassword) return res.status(401).json({ error: "La contraseña actual es incorrecta." });
    
    user.password = newPassword;
    await user.save();
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ================= PANEL DE ADMINISTRADOR =================
app.get('/api/admin/users', async (req, res) => {
  try {
    const requester = await req.UserModel.findOne({ username: req.headers['x-user'] });
    if (!requester || requester.role !== 'admin') return res.status(403).json({ error: "Acceso denegado." });
    const users = await req.UserModel.find({ role: { $ne: 'admin' } }, { password: 0, recoveryWord: 0 }); 
    res.json(users);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/admin/create-user', async (req, res) => {
  try {
    const requester = await req.UserModel.findOne({ username: req.headers['x-user'] });
    if (!requester || requester.role !== 'admin') return res.status(403).json({ error: "Acceso denegado." });
    
    const { fullName, username, password, career, initialTokens } = req.body;
    const cleanUsername = username.trim().toLowerCase();
    
    if (await req.UserModel.findOne({ username: cleanUsername })) return res.status(400).json({ error: "El usuario ya existe." });
    
    await new req.UserModel({
      username: cleanUsername, fullName, email: `${cleanUsername}@universidad.edu`,
      password, recoveryWord: 'admin123', career: career || 'Estudios Generales',
      aiAllowanceUSD: parseFloat(initialTokens) || 2.00,
      subjects: [{ id: 'subj-init', name: 'Mi Primera Materia', schedule: 'Semestre 1', documents: [], storybooks: [], audiobooks: [] }]
    }).save();
    
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/admin/add-tokens', async (req, res) => {
  try {
    const requester = await req.UserModel.findOne({ username: req.headers['x-user'] });
    if (!requester || requester.role !== 'admin') return res.status(403).json({ error: "Acceso denegado." });
    
    const targetUser = await req.UserModel.findOne({ username: req.body.targetUsername });
    if (!targetUser) return res.status(404).json({ error: "Usuario no encontrado." });

    targetUser.aiAllowanceUSD += parseFloat(req.body.amount);
    targetUser.pendingTokenRequest = false;
    await targetUser.save();
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/admin/force-reset', async (req, res) => {
  try {
    const requester = await req.UserModel.findOne({ username: req.headers['x-user'] });
    if (!requester || requester.role !== 'admin') return res.status(403).json({ error: "Acceso denegado." });
    
    const targetUser = await req.UserModel.findOne({ username: req.body.targetUsername });
    targetUser.password = req.body.newPassword;
    await targetUser.save();
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/user/request-tokens', async (req, res) => {
  try {
    const user = await req.UserModel.findOne({ username: req.body.username });
    user.pendingTokenRequest = true;
    await user.save();
    res.json({ success: true, user: await serializeUser(user, req.DocumentModel) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ================= GESTIÓN DE MATERIAS Y ARCHIVOS =================
app.post('/api/subjects', async (req, res) => {
  try {
    const { username, name, schedule } = req.body;
    const user = await req.UserModel.findOne({ username: (username || '').toLowerCase() });
    const newSubj = { id: 'subj-' + Date.now(), name, schedule: schedule || 'Semestre Actual', documents: [], storybooks: [], audiobooks: [] };
    user.subjects.push(newSubj);
    user.markModified('subjects');
    await user.save();
    res.json({ user: await serializeUser(user, req.DocumentModel), newSubjectId: newSubj.id });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/subjects/:subjectId', async (req, res) => {
  try {
    const user = await req.UserModel.findOne({ username: req.body.username.toLowerCase() });
    await req.DocumentModel.deleteMany({ username: user.username, subjectId: req.params.subjectId });
    user.subjects = user.subjects.filter(s => s.id !== req.params.subjectId);
    user.markModified('subjects');
    await user.save();
    res.json({ user: await serializeUser(user, req.DocumentModel) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/documents', upload.any(), async (req, res) => {
  try {
    const { username, subjectId, docTitle, youtubeUrl } = req.body;
    const user = await req.UserModel.findOne({ username: username.toLowerCase() });
    const dateStr = new Date().toLocaleDateString('es-GT');
    
    if (youtubeUrl && youtubeUrl.includes('youtu')) {
      const ytRes = await generateWithFallback([`Extrae un resumen detallado y puntos clave del siguiente video de YouTube: ${youtubeUrl}`], null);
      await new req.DocumentModel({
        docId: `doc-yt-${Date.now()}`, username: user.username, subjectId,
        title: docTitle || `Video Clase YouTube`, fileName: 'YouTube_Clase.txt', mimeType: 'text/plain',
        base64Data: null, textContent: `Resumen de Video:\n${ytRes.text}`, uploadedAt: dateStr
      }).save();
    }

    if (req.files && req.files.length > 0) {
      for (let file of req.files) {
        await new req.DocumentModel({
          docId: `doc-${Date.now()}-${Math.random()}`, username: user.username, subjectId,
          title: docTitle ? `${docTitle} (${file.originalname})` : file.originalname,
          fileName: file.originalname, mimeType: file.mimetype,
          base64Data: file.buffer.toString("base64"), textContent: '', uploadedAt: dateStr
        }).save();
      }
    }

    res.json({ user: await serializeUser(user, req.DocumentModel) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/documents/:docId', async (req, res) => {
  try {
    await req.DocumentModel.deleteOne({ docId: req.params.docId, username: req.body.username.toLowerCase() });
    const user = await req.UserModel.findOne({ username: req.body.username.toLowerCase() });
    res.json({ user: await serializeUser(user, req.DocumentModel) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/audiobooks/:abId', async (req, res) => {
  try {
    const user = await req.UserModel.findOne({ username: req.body.username.toLowerCase() });
    const subj = user.subjects.find(s => s.id === req.body.subjectId);
    subj.audiobooks = subj.audiobooks.filter(ab => ab.id !== req.params.abId);
    user.markModified('subjects'); await user.save();
    res.json({ user: await serializeUser(user, req.DocumentModel) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/storybooks/:sbId', async (req, res) => {
  try {
    const user = await req.UserModel.findOne({ username: req.body.username.toLowerCase() });
    const subj = user.subjects.find(s => s.id === req.body.subjectId);
    subj.storybooks = subj.storybooks.filter(sb => sb.id !== req.params.sbId);
    user.markModified('subjects'); await user.save();
    res.json({ user: await serializeUser(user, req.DocumentModel) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/subjects/:subjectId/documents', async (req, res) => {
  try {
    const user = await req.UserModel.findOne({ username: req.body.username.toLowerCase() });
    await req.DocumentModel.deleteMany({ username: user.username, subjectId: req.params.subjectId });
    res.json({ user: await serializeUser(user, req.DocumentModel) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ================= LÓGICA DE IA Y TOKENS =================
async function consumeTokens(user, costUSD) {
  if (user.role === 'admin') return true; 
  const remaining = user.aiAllowanceUSD - user.aiConsumptionUSD;
  if (remaining <= 0) throw new Error("Saldo de Tokens agotado. Solicita más saldo a tu administrador.");
  user.aiConsumptionUSD += costUSD;
  return true;
}

async function getFullDocumentsForSubject(DocumentModelRef, username, subjectId, documentId) {
  const docs = await DocumentModelRef.find({ username, subjectId }).lean();
  if (documentId === 'ALL') return docs;
  return docs.filter(d => d.docId === documentId);
}

// ================= MOTOR DE LIMPIEZA TTS (FASE 2) =================
app.post('/api/tts-clean', async (req, res) => {
  try {
    const { rawText } = req.body;
    if (!rawText) return res.json({ cleanedText: "" });

    // Lógica Regex para limpiar el texto antes de narrar
    const cleanedText = rawText
      // 1. Marcas de agua y textos de confidencialidad
      .replace(/\b(CONFIDENCIAL|DRAFT|BORRADOR|PROPIEDAD DE)\b/gmi, '')
      // 2. Numeración de páginas (ej. Página 12, - 12 -)
      .replace(/(?:\bPágina\s+\d+\b|^\s*-\s*\d+\s*-\s*$|\b\d+\/\d+\b)/gmi, '')
      // 3. Citas bibliográficas [12], (Autor, 2020)
      .replace(/\[\d+(-\d+)?\]|\([A-Za-z]+,\s*\d{4}\)/g, '')
      // 4. URLs (evita que la voz deletree enlaces largos)
      .replace(/https?:\/\/[^\s]+/g, ' enlace omitido ')
      // 5. Caracteres especiales de formato
      .replace(/[*_~^|<>{}\\]/g, '')
      // 6. Múltiples saltos de línea a punto (pausa de respiración)
      .replace(/\n+/g, '. ')
      // 7. Dobles espacios
      .replace(/\s{2,}/g, ' ')
      .trim();

    res.json({ cleanedText });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ================= ENDPOINTS IA =================
app.post('/api/audiobook-chapters', async (req, res) => {
  try {
    const user = await req.UserModel.findOne({ username: req.body.username.toLowerCase() });
    await consumeTokens(user, 0.25);
    const docs = await getFullDocumentsForSubject(req.DocumentModel, user.username, req.body.subjectId, req.body.documentId);
    if (docs.length === 0) throw new Error("El libro está vacío o es ilegible.");

    const contents = ["Analiza el siguiente documento y extrae la obra completa dividida en capítulos (chapterContent). NO HAGAS RESÚMENES, quiero la lectura íntegra. Genera también un resumen analítico descargable (bookSummary)."];
    docs.forEach(doc => contents.push({ inlineData: { data: doc.base64Data, mimeType: doc.mimeType } }));

    const schema = { type: Type.OBJECT, properties: { audiobookTitle: { type: Type.STRING }, bookSummary: { type: Type.STRING }, chapters: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { chapterTitle: { type: Type.STRING }, chapterContent: { type: Type.STRING } }, required: ["chapterTitle", "chapterContent"] } } }, required: ["audiobookTitle", "bookSummary", "chapters"] };
    const response = await generateWithFallback(contents, schema);
    
    const newAudiobook = { id: 'ab-' + Date.now(), createdAt: new Date().toLocaleString('es-GT'), ...JSON.parse(response.text) };
    const subj = user.subjects.find(s => s.id === req.body.subjectId);
    subj.audiobooks = subj.audiobooks || []; subj.audiobooks.push(newAudiobook);
    user.markModified('subjects'); await user.save();
    
    res.json({ audiobook: newAudiobook, user: await serializeUser(user, req.DocumentModel) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/phenomenology-query', async (req, res) => {
  try {
    const user = await req.UserModel.findOne({ username: req.body.username.toLowerCase() });
    await consumeTokens(user, 0.05);
    const response = await generateWithFallback([`Actúa como purista de Husserl y Heidegger. Explica profundo: ${req.body.query}`], null);
    await user.save();
    res.json({ answer: response.text, user: await serializeUser(user, req.DocumentModel) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/university-homework', async (req, res) => {
  try {
    const user = await req.UserModel.findOne({ username: req.body.username.toLowerCase() });
    await consumeTokens(user, 0.15);
    const docs = await getFullDocumentsForSubject(req.DocumentModel, user.username, req.body.subjectId, 'ALL');
    const contents = [`Actúa como profesor experto. Aplica método humanista-existencial. Resuelve la solicitud leyendo los documentos adjuntos: "${req.body.promptTask}"`];
    docs.forEach(doc => contents.push({ inlineData: { data: doc.base64Data, mimeType: doc.mimeType } }));
    const response = await generateWithFallback(contents, null);
    await user.save();
    res.json({ result: response.text, user: await serializeUser(user, req.DocumentModel) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/socratic-debate', async (req, res) => {
  try {
    const user = await req.UserModel.findOne({ username: req.body.username.toLowerCase() });
    await consumeTokens(user, 0.05);
    const response = await generateWithFallback([`Actúa como el experto: "${req.body.philosopher}". Historial: ${req.body.history}. Responde al estudiante: "${req.body.message}"`], null);
    await user.save();
    res.json({ reply: response.text, user: await serializeUser(user, req.DocumentModel) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/generate-timeline-map', async (req, res) => {
  try {
    const user = await req.UserModel.findOne({ username: req.body.username.toLowerCase() });
    await consumeTokens(user, 0.15);
    const docs = await getFullDocumentsForSubject(req.DocumentModel, user.username, req.body.subjectId, req.body.documentId);
    const contents = [`Genera una línea de tiempo usando los documentos adjuntos.`];
    docs.forEach(doc => contents.push({ inlineData: { data: doc.base64Data, mimeType: doc.mimeType } }));
    const schema = { type: Type.OBJECT, properties: { timelineTitle: { type: Type.STRING }, eras: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { eraName: { type: Type.STRING }, mainAuthor: { type: Type.STRING }, coreIdea: { type: Type.STRING }, refutationOrLink: { type: Type.STRING } }, required: ["eraName", "mainAuthor", "coreIdea", "refutationOrLink"] } } }, required: ["timelineTitle", "eras"] };
    const response = await generateWithFallback(contents, schema);
    await user.save(); res.json({ timelineMap: JSON.parse(response.text), user: await serializeUser(user, req.DocumentModel) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/generate-mindmap', async (req, res) => {
  try {
    const user = await req.UserModel.findOne({ username: req.body.username.toLowerCase() });
    await consumeTokens(user, 0.15);
    const docs = await getFullDocumentsForSubject(req.DocumentModel, user.username, req.body.subjectId, req.body.documentId);
    const contents = [`Genera un mapa conceptual usando los documentos adjuntos.`];
    docs.forEach(doc => contents.push({ inlineData: { data: doc.base64Data, mimeType: doc.mimeType } }));
    const schema = { type: Type.OBJECT, properties: { centralTopic: { type: Type.STRING }, branches: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { branchName: { type: Type.STRING }, subitems: { type: Type.ARRAY, items: { type: Type.STRING } } }, required: ["branchName", "subitems"] } } }, required: ["centralTopic", "branches"] };
    const response = await generateWithFallback(contents, schema);
    await user.save(); res.json({ mindmap: JSON.parse(response.text), user: await serializeUser(user, req.DocumentModel) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/generate-flashcards', async (req, res) => {
  try {
    const user = await req.UserModel.findOne({ username: req.body.username.toLowerCase() });
    await consumeTokens(user, 0.15);
    const docs = await getFullDocumentsForSubject(req.DocumentModel, user.username, req.body.subjectId, req.body.documentId);
    const contents = [`Genera 6 fichas de estudio basadas en el documento adjunto.`];
    docs.forEach(doc => contents.push({ inlineData: { data: doc.base64Data, mimeType: doc.mimeType } }));
    const schema = { type: Type.OBJECT, properties: { flashcards: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { question: { type: Type.STRING }, answer: { type: Type.STRING }, hint: { type: Type.STRING } }, required: ["question", "answer", "hint"] } } }, required: ["flashcards"] };
    const response = await generateWithFallback(contents, schema);
    await user.save(); res.json({ flashcards: JSON.parse(response.text).flashcards, user: await serializeUser(user, req.DocumentModel) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/generate-storybook', async (req, res) => {
  try {
    const user = await req.UserModel.findOne({ username: req.body.username.toLowerCase() });
    await consumeTokens(user, 0.20);
    const docs = await getFullDocumentsForSubject(req.DocumentModel, user.username, req.body.subjectId, req.body.documentId);
    const contents = [`Crea una monografía académica gamificada basada en el documento.`];
    docs.forEach(doc => contents.push({ inlineData: { data: doc.base64Data, mimeType: doc.mimeType } }));
    const schema = { type: Type.OBJECT, properties: { title: { type: Type.STRING }, summary: { type: Type.STRING }, scenes: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { sceneNumber: { type: Type.INTEGER }, characterName: { type: Type.STRING }, academicConcept: { type: Type.STRING }, storyDialogue: { type: Type.STRING } }, required: ["sceneNumber", "characterName", "academicConcept", "storyDialogue"] } }, timeline: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { step: { type: Type.INTEGER }, title: { type: Type.STRING }, description: { type: Type.STRING } }, required: ["step", "title", "description"] } }, quiz: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { question: { type: Type.STRING }, options: { type: Type.ARRAY, items: { type: Type.STRING } }, correctIndex: { type: Type.INTEGER }, heroExplanation: { type: Type.STRING } }, required: ["question", "options", "correctIndex", "heroExplanation"] } } }, required: ["title", "summary", "scenes", "timeline", "quiz"] };
    const response = await generateWithFallback(contents, schema);
    
    const newStorybook = { id: 'sb-' + Date.now(), ...JSON.parse(response.text) };
    const subj = user.subjects.find(s => s.id === req.body.subjectId);
    subj.storybooks = subj.storybooks || []; subj.storybooks.push(newStorybook);
    user.markModified('subjects'); await user.save();
    
    res.json({ storybook: newStorybook, user: await serializeUser(user, req.DocumentModel) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Servidor Multi-Tenant activo en puerto ${PORT}`));
