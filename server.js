import express from 'express';
import multer from 'multer';
import mongoose from 'mongoose';
import { GoogleGenAI, Type } from '@google/genai';
import path from 'path';
import { fileURLToPath } from 'url';
import Stripe from 'stripe';
import { YoutubeTranscript } from 'youtube-transcript'; // NUEVO: Fase 4

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// ================= STRIPE WEBHOOK =================
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_dummy');
app.post('/webhook/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const dbName = `tenant_${session.customer.toLowerCase().replace('cus_', '')}`;
    
    try {
      await TenantModel.create({
        companyName: session.custom_fields?.[0]?.text?.value || "Nueva Institución",
        dbName: dbName,
        stripeCustomerId: session.customer,
        subscriptionStatus: 'active'
      });

      const tenantDb = mongoose.connection.useDb(dbName, { useCache: true });
      const TenantUser = tenantDb.model('User', UserSchema);

      await TenantUser.create({
        username: 'master', fullName: 'Administrador Maestro', email: session.customer_details.email,
        password: 'admin_temporal_123', role: 'admin', aiAllowanceUSD: 50.00, subjects: []
      });
    } catch (e) { console.error("Error aprovisionando tenant:", e); }
  }
  res.json({ received: true });
});

// ================= CONFIGURACIÓN BÁSICA =================
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const DEFAULT_GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.8-flash';

async function generateWithFallback(contents, responseSchema) {
  const modelsToTry = [DEFAULT_GEMINI_MODEL, 'gemini-3.8-flash', 'gemini-4-argon', 'gemini-3.0-flash'];
  let lastErr = null;
  for (const modelName of modelsToTry) {
    try {
      return await ai.models.generateContent({ model: modelName, contents, config: responseSchema ? { responseMimeType: 'application/json', responseSchema } : {} });
    } catch (err) { lastErr = err; }
  }
  throw lastErr;
}

// ================= ESQUEMAS DE BASE DE DATOS =================
const TenantSchema = new mongoose.Schema({ companyName: String, dbName: { type: String, unique: true }, stripeCustomerId: String, subscriptionStatus: { type: String, default: 'active' }, createdAt: { type: Date, default: Date.now }});
const TenantModel = mongoose.model('Tenant', TenantSchema);
const DocumentSchema = new mongoose.Schema({ docId: { type: String, unique: true, index: true }, username: { type: String, lowercase: true, index: true }, subjectId: { type: String, index: true }, title: String, fileName: String, mimeType: String, base64Data: String, textContent: String, uploadedAt: String });
const UserSchema = new mongoose.Schema({ username: { type: String, unique: true, lowercase: true }, fullName: String, email: { type: String, lowercase: true }, password: String, recoveryWord: String, career: String, role: { type: String, default: 'student' }, aiAllowanceUSD: { type: Number, default: 2.00 }, aiConsumptionUSD: { type: Number, default: 0 }, pendingTokenRequest: { type: Boolean, default: false }, storybooksCreated: { type: Number, default: 0 }, subjects: Array });

const MONGO_URI = (process.env.MONGO_URI || '').trim();
async function connectDB() {
  if (!MONGO_URI) throw new Error("MONGO_URI no configurada.");
  if (mongoose.connection.readyState === 1) return;
  try {
    await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 5000 });
    const testDbName = 'institucion_demo';
    if (!(await TenantModel.findOne({ dbName: testDbName }))) {
      await TenantModel.create({ companyName: "Universidad Demo", dbName: testDbName, stripeCustomerId: 'demo_123' });
      const demoDb = mongoose.connection.useDb(testDbName);
      await demoDb.model('User', UserSchema).create({ username: 'master', fullName: 'Admin Demo', email: 'admin@demo.com', password: 'master123', role: 'admin', aiAllowanceUSD: 999 });
    }
  } catch (err) { throw err; }
}
connectDB().catch(() => {});

// ================= DEV =================
app.post('/dev/crear-institucion', async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) await connectDB();
    const { codigo_institucion } = req.body;
    await TenantModel.findOneAndUpdate({ dbName: codigo_institucion.toLowerCase() }, { companyName: "Universidad Dev", dbName: codigo_institucion.toLowerCase(), stripeCustomerId: "dev_123", subscriptionStatus: 'active' }, { upsert: true });
    const tenantDb = mongoose.connection.useDb(codigo_institucion.toLowerCase(), { useCache: true });
    await tenantDb.model('User', UserSchema).findOneAndUpdate({ username: 'master' }, { fullName: 'Admin Maestro', email: 'master@dev.edu', password: 'master123', role: 'admin', aiAllowanceUSD: 9999 }, { upsert: true });
    res.json({ success: true, message: `Institución creada.` });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ================= MIDDLEWARE MULTI-TENANT =================
app.use('/api', async (req, res, next) => {
  try {
    if (mongoose.connection.readyState !== 1) await connectDB();
    const tenantId = req.headers['x-tenant-id'];
    if (!tenantId) return res.status(400).json({ error: "Falta Tenant ID." });
    const tenant = await TenantModel.findOne({ dbName: tenantId.trim().toLowerCase() });
    if (!tenant || tenant.subscriptionStatus !== 'active') return res.status(403).json({ error: "Tenant inactivo." });
    const tenantDb = mongoose.connection.useDb(tenant.dbName, { useCache: true });
    req.UserModel = tenantDb.model('User', UserSchema); req.DocumentModel = tenantDb.model('Document', DocumentSchema);
    next();
  } catch (error) { res.status(500).json({ error: "Sin conexión." }); }
});

async function serializeUser(user, DocumentModelRef) {
  const obj = user.toObject(); delete obj.password;
  const savedDocs = await DocumentModelRef.find({ username: obj.username }, { base64Data: 0, textContent: 0 }).lean();
  obj.subjects = (obj.subjects || []).map(s => {
    const embeddedDocs = (s.documents || []).map(d => ({ id: d.id, title: d.title, fileName: d.fileName }));
    const collectionDocs = savedDocs.filter(cd => cd.subjectId === s.id).map(cd => ({ id: cd.docId, title: cd.title, fileName: cd.fileName }));
    const map = new Map(); [...embeddedDocs, ...collectionDocs].forEach(item => map.set(item.id, item));
    return { ...s, documents: Array.from(map.values()), storybooks: s.storybooks || [], audiobooks: s.audiobooks || [] };
  }); return obj;
}

async function consumeTokens(user, costUSD) {
  if (user.role === 'admin') return true; 
  if (user.aiAllowanceUSD - user.aiConsumptionUSD <= 0) throw new Error("Saldo agotado.");
  user.aiConsumptionUSD += costUSD; return true;
}

async function getFullDocumentsForSubject(DocumentModelRef, username, subjectId, documentId) {
  const docs = await DocumentModelRef.find({ username, subjectId }).lean();
  return documentId === 'ALL' ? docs : docs.filter(d => d.docId === documentId);
}

// ================= AUTH Y ADMIN =================
app.post('/api/auth/login', async (req, res) => { try { const user = await req.UserModel.findOne({ $or: [{ username: req.body.identifier.trim().toLowerCase() }, { email: req.body.identifier.trim().toLowerCase() }] }); if (!user || user.password !== req.body.password) return res.status(401).json({ error: "Credenciales incorrectas." }); res.json({ user: await serializeUser(user, req.DocumentModel) }); } catch (err) { res.status(500).json({ error: err.message }); } });
app.post('/api/auth/register', async (req, res) => { try { const cleanUsername = req.body.username.trim().toLowerCase(); if (await req.UserModel.findOne({ username: cleanUsername })) return res.status(400).json({ error: "El usuario ya existe." }); const newUser = new req.UserModel({ username: cleanUsername, fullName: req.body.fullName, email: (req.body.email || `${cleanUsername}@universidad.edu`).toLowerCase(), password: req.body.password, recoveryWord: req.body.recoveryWord, career: req.body.career || 'General', subjects: [{ id: 'subj-init', name: 'Mi Primera Materia', schedule: 'Semestre 1', documents: [], storybooks: [], audiobooks: [] }] }); await newUser.save(); res.json({ user: await serializeUser(newUser, req.DocumentModel) }); } catch (err) { res.status(500).json({ error: err.message }); } });
app.get('/api/auth/session/:username', async (req, res) => { try { const user = await req.UserModel.findOne({ username: req.params.username.trim().toLowerCase() }); res.json({ user: await serializeUser(user, req.DocumentModel) }); } catch (err) { res.status(500).json({ error: err.message }); } });
app.post('/api/auth/reset-password', async (req, res) => { try { const user = await req.UserModel.findOne({ username: req.body.username.toLowerCase() }); if (!user || user.recoveryWord !== req.body.recoveryWord) return res.status(401).json({ error: "Datos incorrectos." }); user.password = req.body.newPassword; await user.save(); res.json({ success: true }); } catch (err) { res.status(500).json({ error: err.message }); } });
app.post('/api/user/change-password', async (req, res) => { try { const user = await req.UserModel.findOne({ username: req.body.username.toLowerCase() }); if (!user || user.password !== req.body.oldPassword) return res.status(401).json({ error: "Contraseña actual incorrecta." }); user.password = req.body.newPassword; await user.save(); res.json({ success: true }); } catch (err) { res.status(500).json({ error: err.message }); } });

app.get('/api/admin/users', async (req, res) => { try { const requester = await req.UserModel.findOne({ username: req.headers['x-user'] }); if (!requester || requester.role !== 'admin') return res.status(403).json({ error: "Denegado." }); res.json(await req.UserModel.find({ role: { $ne: 'admin' } }, { password: 0, recoveryWord: 0 })); } catch (err) { res.status(500).json({ error: err.message }); } });
app.post('/api/admin/create-user', async (req, res) => { try { const requester = await req.UserModel.findOne({ username: req.headers['x-user'] }); if (!requester || requester.role !== 'admin') return res.status(403).json({ error: "Denegado." }); await new req.UserModel({ username: req.body.username.trim().toLowerCase(), fullName: req.body.fullName, email: `${req.body.username.trim().toLowerCase()}@universidad.edu`, password: req.body.password, recoveryWord: 'admin123', career: req.body.career, aiAllowanceUSD: parseFloat(req.body.initialTokens) || 2.00, subjects: [{ id: 'subj-init', name: 'Mi Primera Materia', schedule: 'Semestre 1', documents: [], storybooks: [], audiobooks: [] }] }).save(); res.json({ success: true }); } catch (err) { res.status(500).json({ error: err.message }); } });
app.post('/api/admin/add-tokens', async (req, res) => { try { const requester = await req.UserModel.findOne({ username: req.headers['x-user'] }); if (!requester || requester.role !== 'admin') return res.status(403).json({ error: "Denegado." }); const user = await req.UserModel.findOne({ username: req.body.targetUsername }); user.aiAllowanceUSD += parseFloat(req.body.amount); user.pendingTokenRequest = false; await user.save(); res.json({ success: true }); } catch (err) { res.status(500).json({ error: err.message }); } });
app.post('/api/admin/force-reset', async (req, res) => { try { const requester = await req.UserModel.findOne({ username: req.headers['x-user'] }); if (!requester || requester.role !== 'admin') return res.status(403).json({ error: "Denegado." }); const user = await req.UserModel.findOne({ username: req.body.targetUsername }); user.password = req.body.newPassword; await user.save(); res.json({ success: true }); } catch (err) { res.status(500).json({ error: err.message }); } });
app.post('/api/user/request-tokens', async (req, res) => { try { const user = await req.UserModel.findOne({ username: req.body.username }); user.pendingTokenRequest = true; await user.save(); res.json({ success: true, user: await serializeUser(user, req.DocumentModel) }); } catch (err) { res.status(500).json({ error: err.message }); } });

// ================= GESTIÓN MATERIAS =================
app.post('/api/subjects', async (req, res) => { try { const user = await req.UserModel.findOne({ username: req.body.username.toLowerCase() }); const newSubj = { id: 'subj-' + Date.now(), name: req.body.name, schedule: req.body.schedule, documents: [], storybooks: [], audiobooks: [] }; user.subjects.push(newSubj); user.markModified('subjects'); await user.save(); res.json({ user: await serializeUser(user, req.DocumentModel), newSubjectId: newSubj.id }); } catch (err) { res.status(500).json({ error: err.message }); } });
app.delete('/api/subjects/:subjectId', async (req, res) => { try { const user = await req.UserModel.findOne({ username: req.body.username.toLowerCase() }); await req.DocumentModel.deleteMany({ username: user.username, subjectId: req.params.subjectId }); user.subjects = user.subjects.filter(s => s.id !== req.params.subjectId); user.markModified('subjects'); await user.save(); res.json({ user: await serializeUser(user, req.DocumentModel) }); } catch (err) { res.status(500).json({ error: err.message }); } });

// ================= FASE 4: SUBIDA + YOUTUBE EXTRACTOR =================
app.post('/api/documents', upload.any(), async (req, res) => {
  try {
    const { username, subjectId, docTitle, youtubeUrl } = req.body;
    const user = await req.UserModel.findOne({ username: username.toLowerCase() });
    const dateStr = new Date().toLocaleDateString('es-GT');
    
    // YOUTUBE EXTRACTOR (NATIVO - FASE 4)
    if (youtubeUrl && youtubeUrl.includes('youtu')) {
      try {
        const transcript = await YoutubeTranscript.fetchTranscript(youtubeUrl);
        const fullTranscriptionText = transcript.map(t => t.text).join(' ');
        
        await new req.DocumentModel({
          docId: `doc-yt-${Date.now()}`, username: user.username, subjectId,
          title: docTitle || `Transcripción YouTube`, fileName: 'YouTube_Transcript.txt', mimeType: 'text/plain',
          base64Data: null, textContent: fullTranscriptionText, uploadedAt: dateStr
        }).save();
      } catch (ytError) {
        // Fallback si el video no tiene subtítulos: usar IA
        const ytRes = await generateWithFallback([`Analiza este video de YouTube y describe de qué trata detalladamente: ${youtubeUrl}`], null);
        await new req.DocumentModel({
          docId: `doc-yt-${Date.now()}`, username: user.username, subjectId, title: docTitle || `Análisis de Video`, fileName: 'YouTube_Analisis.txt', mimeType: 'text/plain', base64Data: null, textContent: ytRes.text, uploadedAt: dateStr
        }).save();
      }
    }

    if (req.files && req.files.length > 0) {
      for (let file of req.files) {
        await new req.DocumentModel({
          docId: `doc-${Date.now()}-${Math.random()}`, username: user.username, subjectId,
          title: docTitle ? `${docTitle} (${file.originalname})` : file.originalname, fileName: file.originalname, mimeType: file.mimetype,
          base64Data: file.buffer.toString("base64"), textContent: '', uploadedAt: dateStr
        }).save();
      }
    }
    res.json({ user: await serializeUser(user, req.DocumentModel) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/documents/:docId', async (req, res) => { try { await req.DocumentModel.deleteOne({ docId: req.params.docId, username: req.body.username.toLowerCase() }); res.json({ user: await serializeUser(await req.UserModel.findOne({ username: req.body.username.toLowerCase() }), req.DocumentModel) }); } catch (err) { res.status(500).json({ error: err.message }); } });
app.delete('/api/audiobooks/:abId', async (req, res) => { try { const user = await req.UserModel.findOne({ username: req.body.username.toLowerCase() }); const subj = user.subjects.find(s => s.id === req.body.subjectId); subj.audiobooks = subj.audiobooks.filter(ab => ab.id !== req.params.abId); user.markModified('subjects'); await user.save(); res.json({ user: await serializeUser(user, req.DocumentModel) }); } catch (err) { res.status(500).json({ error: err.message }); } });
app.delete('/api/storybooks/:sbId', async (req, res) => { try { const user = await req.UserModel.findOne({ username: req.body.username.toLowerCase() }); const subj = user.subjects.find(s => s.id === req.body.subjectId); subj.storybooks = subj.storybooks.filter(sb => sb.id !== req.params.sbId); user.markModified('subjects'); await user.save(); res.json({ user: await serializeUser(user, req.DocumentModel) }); } catch (err) { res.status(500).json({ error: err.message }); } });
app.delete('/api/subjects/:subjectId/documents', async (req, res) => { try { const user = await req.UserModel.findOne({ username: req.body.username.toLowerCase() }); await req.DocumentModel.deleteMany({ username: user.username, subjectId: req.params.subjectId }); res.json({ user: await serializeUser(user, req.DocumentModel) }); } catch (err) { res.status(500).json({ error: err.message }); } });

// ================= TTS (FASE 2) =================
app.post('/api/tts-clean', async (req, res) => {
  try {
    if (!req.body.rawText) return res.json({ cleanedText: "" });
    const cleanedText = req.body.rawText.replace(/\b(CONFIDENCIAL|DRAFT|BORRADOR|PROPIEDAD DE)\b/gmi, '').replace(/(?:\bPágina\s+\d+\b|^\s*-\s*\d+\s*-\s*$|\b\d+\/\d+\b)/gmi, '').replace(/\[\d+(-\d+)?\]|\([A-Za-z]+,\s*\d{4}\)/g, '').replace(/https?:\/\/[^\s]+/g, ' enlace omitido ').replace(/[*_~^|<>{}\\]/g, '').replace(/\n+/g, '. ').replace(/\s{2,}/g, ' ').trim();
    res.json({ cleanedText });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

// ================= ENDPOINTS IA (FASES 3 Y 4) =================

// FASE 4: GLOSARIO TÉCNICO
app.post('/api/generate-glossary', async (req, res) => {
  try {
    const user = await req.UserModel.findOne({ username: req.body.username.toLowerCase() });
    await consumeTokens(user, 0.10);
    const docs = await getFullDocumentsForSubject(req.DocumentModel, user.username, req.body.subjectId, req.body.documentId);
    const contents = ["Actúa como un experto. Extrae los 15 términos técnicos más importantes del documento adjunto y define cada uno creando un glosario."];
    docs.forEach(doc => contents.push({ inlineData: { data: doc.base64Data, mimeType: doc.mimeType } }));
    const schema = { type: Type.OBJECT, properties: { glossaryTitle: { type: Type.STRING }, terms: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { term: { type: Type.STRING }, definition: { type: Type.STRING } }, required: ["term", "definition"] } } }, required: ["glossaryTitle", "terms"] };
    const response = await generateWithFallback(contents, schema);
    await user.save(); res.json({ glossary: JSON.parse(response.text), user: await serializeUser(user, req.DocumentModel) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// FASE 4: STORYBOOK EVOLUTIVO
app.post('/api/generate-evo-storybook', async (req, res) => {
  try {
    const user = await req.UserModel.findOne({ username: req.body.username.toLowerCase() });
    await consumeTokens(user, 0.20);
    const docs = await getFullDocumentsForSubject(req.DocumentModel, user.username, req.body.subjectId, req.body.documentId);
    const contents = ["Actúa como un experto en Psicología Evolutiva. Toma los conceptos de desarrollo humano del documento adjunto (gestación, niñez, adolescencia, adultez) y transfórmalos en una narrativa cronológica estilo cuento o novela gráfica."];
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

// FASE 4: SÍNTESIS REALISMO FILOSÓFICO (Tomista)
app.post('/api/realist-synthesis', async (req, res) => {
  try {
    const user = await req.UserModel.findOne({ username: req.body.username.toLowerCase() });
    await consumeTokens(user, 0.15);
    const docs = await getFullDocumentsForSubject(req.DocumentModel, user.username, req.body.subjectId, req.body.documentId);
    const contents = ["Actúa como un filósofo experto en Realismo Aristotélico-Tomista y Humanismo Integral. Analiza el documento adjunto FILTRANDO y omitiendo cualquier sesgo utilitarista, relativista o anglosajón. Sintetiza los conceptos a la luz de la metafísica realista, la ética de la virtud y la naturaleza humana universal. Devuelve un análisis maquetado en HTML (<h1>, <p>)."];
    docs.forEach(doc => contents.push({ inlineData: { data: doc.base64Data, mimeType: doc.mimeType } }));
    const response = await generateWithFallback(contents, null);
    await user.save(); res.json({ result: response.text, user: await serializeUser(user, req.DocumentModel) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ==== ENDPOINTS YA EXISTENTES ====
app.post('/api/audiobook-chapters', async (req, res) => { /* Lógica intacta */ try { const user = await req.UserModel.findOne({ username: req.body.username.toLowerCase() }); await consumeTokens(user, 0.25); const docs = await getFullDocumentsForSubject(req.DocumentModel, user.username, req.body.subjectId, req.body.documentId); if (docs.length === 0) throw new Error("Vacío"); const contents = ["Analiza el documento y extrae la obra completa dividida en capítulos. NO RESÚMENES."]; docs.forEach(doc => contents.push({ inlineData: { data: doc.base64Data, mimeType: doc.mimeType } })); const schema = { type: Type.OBJECT, properties: { audiobookTitle: { type: Type.STRING }, bookSummary: { type: Type.STRING }, chapters: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { chapterTitle: { type: Type.STRING }, chapterContent: { type: Type.STRING } }, required: ["chapterTitle", "chapterContent"] } } }, required: ["audiobookTitle", "bookSummary", "chapters"] }; const response = await generateWithFallback(contents, schema); const newAudiobook = { id: 'ab-' + Date.now(), createdAt: new Date().toLocaleString('es-GT'), ...JSON.parse(response.text) }; const subj = user.subjects.find(s => s.id === req.body.subjectId); subj.audiobooks = subj.audiobooks || []; subj.audiobooks.push(newAudiobook); user.markModified('subjects'); await user.save(); res.json({ audiobook: newAudiobook, user: await serializeUser(user, req.DocumentModel) }); } catch (err) { res.status(500).json({ error: err.message }); } });
app.post('/api/phenomenology-query', async (req, res) => { try { const user = await req.UserModel.findOne({ username: req.body.username.toLowerCase() }); await consumeTokens(user, 0.05); const response = await generateWithFallback([`Actúa como purista de Husserl y Heidegger. Explica profundo: ${req.body.query}`], null); await user.save(); res.json({ answer: response.text, user: await serializeUser(user, req.DocumentModel) }); } catch (err) { res.status(500).json({ error: err.message }); } });
app.post('/api/tutor-explain', async (req, res) => { try { const user = await req.UserModel.findOne({ username: req.body.username.toLowerCase() }); await consumeTokens(user, 0.05); const response = await generateWithFallback([`Tutor Clínico. Explica didácticamente: "${req.body.text}"`], null); await user.save(); res.json({ explanation: response.text }); } catch (err) { res.status(500).json({ error: err.message }); } });
app.post('/api/generate-apa-task', async (req, res) => { try { const user = await req.UserModel.findOne({ username: req.body.username.toLowerCase() }); await consumeTokens(user, 0.30); const docs = await getFullDocumentsForSubject(req.DocumentModel, user.username, req.body.subjectId, 'ALL'); const contents = [`Redactor APA 7ma sobre: "${req.body.topic}". Usa HTML.`]; docs.forEach(doc => contents.push({ inlineData: { data: doc.base64Data, mimeType: doc.mimeType } })); const response = await generateWithFallback(contents, null); await user.save(); res.json({ apaDocument: response.text }); } catch (err) { res.status(500).json({ error: err.message }); } });
app.post('/api/research/outline', async (req, res) => { try { const user = await req.UserModel.findOne({ username: req.body.username.toLowerCase() }); await consumeTokens(user, 0.10); const response = await generateWithFallback([`Director de Tesis. Diseña índice JSON sobre: "${req.body.topic}".`], { type: Type.OBJECT, properties: { chapters: { type: Type.ARRAY, items: { type: Type.STRING } } }, required: ["chapters"] }); await user.save(); res.json({ outline: JSON.parse(response.text).chapters }); } catch (err) { res.status(500).json({ error: err.message }); } });
app.post('/api/research/chapter', async (req, res) => { try { const user = await req.UserModel.findOne({ username: req.body.username.toLowerCase() }); await consumeTokens(user, 0.20); let prompt = `Capítulo "${req.body.chapterTitle}" sobre "${req.body.topic}". Nivel avanzado. APA HTML.`; if (req.body.previousChapterSummary) prompt += ` Resumen anterior: "${req.body.previousChapterSummary}".`; const response = await generateWithFallback([prompt], null); await user.save(); res.json({ chapterContent: response.text }); } catch (err) { res.status(500).json({ error: err.message }); } });
app.post('/api/socratic-debate', async (req, res) => { try { const user = await req.UserModel.findOne({ username: req.body.username.toLowerCase() }); await consumeTokens(user, 0.05); const response = await generateWithFallback([`Experto: "${req.body.philosopher}". Historial: ${req.body.history}. Responde: "${req.body.message}"`], null); await user.save(); res.json({ reply: response.text, user: await serializeUser(user, req.DocumentModel) }); } catch (err) { res.status(500).json({ error: err.message }); } });
app.post('/api/generate-timeline-map', async (req, res) => { try { const user = await req.UserModel.findOne({ username: req.body.username.toLowerCase() }); await consumeTokens(user, 0.15); const docs = await getFullDocumentsForSubject(req.DocumentModel, user.username, req.body.subjectId, req.body.documentId); const contents = [`Genera línea de tiempo.`]; docs.forEach(doc => contents.push({ inlineData: { data: doc.base64Data, mimeType: doc.mimeType } })); const response = await generateWithFallback(contents, { type: Type.OBJECT, properties: { timelineTitle: { type: Type.STRING }, eras: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { eraName: { type: Type.STRING }, mainAuthor: { type: Type.STRING }, coreIdea: { type: Type.STRING }, refutationOrLink: { type: Type.STRING } }, required: ["eraName", "mainAuthor", "coreIdea", "refutationOrLink"] } } }, required: ["timelineTitle", "eras"] }); await user.save(); res.json({ timelineMap: JSON.parse(response.text), user: await serializeUser(user, req.DocumentModel) }); } catch (err) { res.status(500).json({ error: err.message }); } });
app.post('/api/generate-mindmap', async (req, res) => { try { const user = await req.UserModel.findOne({ username: req.body.username.toLowerCase() }); await consumeTokens(user, 0.15); const docs = await getFullDocumentsForSubject(req.DocumentModel, user.username, req.body.subjectId, req.body.documentId); const contents = [`Genera mapa conceptual.`]; docs.forEach(doc => contents.push({ inlineData: { data: doc.base64Data, mimeType: doc.mimeType } })); const response = await generateWithFallback(contents, { type: Type.OBJECT, properties: { centralTopic: { type: Type.STRING }, branches: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { branchName: { type: Type.STRING }, subitems: { type: Type.ARRAY, items: { type: Type.STRING } } }, required: ["branchName", "subitems"] } } }, required: ["centralTopic", "branches"] }); await user.save(); res.json({ mindmap: JSON.parse(response.text), user: await serializeUser(user, req.DocumentModel) }); } catch (err) { res.status(500).json({ error: err.message }); } });
app.post('/api/generate-flashcards', async (req, res) => { try { const user = await req.UserModel.findOne({ username: req.body.username.toLowerCase() }); await consumeTokens(user, 0.15); const docs = await getFullDocumentsForSubject(req.DocumentModel, user.username, req.body.subjectId, req.body.documentId); const contents = [`Genera 6 fichas.`]; docs.forEach(doc => contents.push({ inlineData: { data: doc.base64Data, mimeType: doc.mimeType } })); const response = await generateWithFallback(contents, { type: Type.OBJECT, properties: { flashcards: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { question: { type: Type.STRING }, answer: { type: Type.STRING }, hint: { type: Type.STRING } }, required: ["question", "answer", "hint"] } } }, required: ["flashcards"] }); await user.save(); res.json({ flashcards: JSON.parse(response.text).flashcards, user: await serializeUser(user, req.DocumentModel) }); } catch (err) { res.status(500).json({ error: err.message }); } });
app.post('/api/generate-storybook', async (req, res) => { try { const user = await req.UserModel.findOne({ username: req.body.username.toLowerCase() }); await consumeTokens(user, 0.20); const docs = await getFullDocumentsForSubject(req.DocumentModel, user.username, req.body.subjectId, req.body.documentId); const contents = [`Monografía académica.`]; docs.forEach(doc => contents.push({ inlineData: { data: doc.base64Data, mimeType: doc.mimeType } })); const response = await generateWithFallback(contents, { type: Type.OBJECT, properties: { title: { type: Type.STRING }, summary: { type: Type.STRING }, scenes: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { sceneNumber: { type: Type.INTEGER }, characterName: { type: Type.STRING }, academicConcept: { type: Type.STRING }, storyDialogue: { type: Type.STRING } }, required: ["sceneNumber", "characterName", "academicConcept", "storyDialogue"] } }, timeline: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { step: { type: Type.INTEGER }, title: { type: Type.STRING }, description: { type: Type.STRING } }, required: ["step", "title", "description"] } }, quiz: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { question: { type: Type.STRING }, options: { type: Type.ARRAY, items: { type: Type.STRING } }, correctIndex: { type: Type.INTEGER }, heroExplanation: { type: Type.STRING } }, required: ["question", "options", "correctIndex", "heroExplanation"] } } }, required: ["title", "summary", "scenes", "timeline", "quiz"] }); const newStorybook = { id: 'sb-' + Date.now(), ...JSON.parse(response.text) }; const subj = user.subjects.find(s => s.id === req.body.subjectId); subj.storybooks = subj.storybooks || []; subj.storybooks.push(newStorybook); user.markModified('subjects'); await user.save(); res.json({ storybook: newStorybook, user: await serializeUser(user, req.DocumentModel) }); } catch (err) { res.status(500).json({ error: err.message }); } });

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Servidor Multi-Tenant con Extractor YouTube activo en puerto ${PORT}`));
