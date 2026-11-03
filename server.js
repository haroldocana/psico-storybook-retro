import express from 'express';
import multer from 'multer';
import mongoose from 'mongoose';
import { GoogleGenAI, Type } from '@google/genai';
import path from 'path';
import { fileURLToPath } from 'url';
import Stripe from 'stripe';
import { YoutubeTranscript } from 'youtube-transcript';
import nodemailer from 'nodemailer';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// ================= CONFIGURACIÓN DE CORREO =================
const transporter = nodemailer.createTransport({
  service: 'gmail', 
  auth: {
    user: process.env.SMTP_EMAIL || 'haroldocana@comptech.lat',
    pass: process.env.SMTP_PASSWORD || 'oudccygvhvazuzwg' 
  }
});

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
    const customerEmail = session.customer_details.email;
    const institutionName = session.custom_fields?.[0]?.text?.value || "Nueva Institución";
    
    try {
      const expirationDate = new Date();
      expirationDate.setFullYear(expirationDate.getFullYear() + 1);

      await TenantModel.create({
        companyName: institutionName,
        dbName: dbName,
        stripeCustomerId: session.customer,
        subscriptionStatus: 'active',
        licenseExpiresAt: expirationDate
      });

      const randomPassword = crypto.randomBytes(4).toString('hex');
      const tenantDb = mongoose.connection.useDb(dbName, { useCache: true });
      const TenantUser = tenantDb.model('User', UserSchema);

      await TenantUser.create({
        username: 'master',
        fullName: 'Administrador Maestro',
        email: customerEmail,
        password: randomPassword,
        role: 'admin',
        aiAllowanceUSD: 50.00,
        subjects: []
      });
      
      await transporter.sendMail({
        from: '"AprendePro SaaS" <haroldocana@comptech.lat>',
        to: customerEmail,
        subject: '🚀 Tus accesos a AprendePro',
        html: `
          <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
            <h2 style="color: #0284c7;">¡Bienvenido a AprendePro!</h2>
            <p>Hemos procesado tu pago exitosamente. La base de datos para <strong>${institutionName}</strong> ha sido configurada.</p>
            <div style="background-color: #f1f5f9; padding: 15px; border-radius: 8px; margin: 20px 0;">
              <h3 style="margin-top: 0; color: #0f172a;">Credenciales de Acceso:</h3>
              <p><strong>Código de Institución:</strong> ${dbName}</p>
              <p><strong>Usuario:</strong> master</p>
              <p><strong>Contraseña Temporal:</strong> ${randomPassword}</p>
            </div>
            <p><strong>Licencia válida hasta:</strong> ${expirationDate.toLocaleDateString('es-ES')}</p>
          </div>
        `
      });
    } catch (e) {
      console.error("Error aprovisionando tenant:", e);
    }
  }
  res.json({ received: true });
});

// ================= CONFIGURACIÓN BÁSICA CON LÍMITES AMPLIADOS =================
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Límite de 50MB por archivo para soportar documentos
const upload = multer({ 
  storage: multer.memoryStorage(), 
  limits: { fileSize: 50 * 1024 * 1024 } 
});

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
// Modelo estándar y estable actual
const DEFAULT_GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-1.5-flash';

async function generateWithFallback(contents, responseSchema) {
  // Lista actualizada con modelos oficiales compatibles
  const modelsToTry = [DEFAULT_GEMINI_MODEL, 'gemini-1.5-flash', 'gemini-1.5-pro', 'gemini-2.5-flash'];
  let lastErr = null;
  for (const modelName of modelsToTry) {
    try {
      return await ai.models.generateContent({
        model: modelName, contents,
        config: responseSchema ? { responseMimeType: 'application/json', responseSchema } : {}
      });
    } catch (err) { lastErr = err; }
  }
  throw lastErr;
}

// ================= ESQUEMAS =================
const TenantSchema = new mongoose.Schema({ companyName: String, dbName: { type: String, unique: true }, stripeCustomerId: String, subscriptionStatus: { type: String, default: 'active' }, licenseExpiresAt: Date, createdAt: { type: Date, default: Date.now } });
const TenantModel = mongoose.model('Tenant', TenantSchema);

const DocumentSchema = new mongoose.Schema({ docId: { type: String, unique: true, index: true }, username: { type: String, lowercase: true, index: true }, subjectId: { type: String, index: true }, title: String, fileName: String, mimeType: String, base64Data: String, textContent: String, uploadedAt: String });
const UserSchema = new mongoose.Schema({ username: { type: String, unique: true, lowercase: true }, fullName: String, email: { type: String, lowercase: true }, password: String, recoveryWord: String, career: String, role: { type: String, default: 'student' }, aiAllowanceUSD: { type: Number, default: 2.00 }, aiConsumptionUSD: { type: Number, default: 0 }, pendingTokenRequest: { type: Boolean, default: false }, storybooksCreated: { type: Number, default: 0 }, subjects: Array });

const MONGO_URI = (process.env.MONGO_URI || '').trim();
async function connectDB() {
  if (!MONGO_URI) throw new Error("MONGO_URI no configurada.");
  if (mongoose.connection.readyState === 1) return;
  await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 5000 });
}
connectDB().catch(() => console.log("Reintentando conexión..."));

// DEV TENANT
app.post('/dev/crear-institucion', async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) await connectDB();
    const { codigo_institucion } = req.body;
    if (!codigo_institucion) return res.status(400).json({error: "Falta codigo_institucion"});
    
    await TenantModel.findOneAndUpdate(
      { dbName: codigo_institucion.toLowerCase() },
      { companyName: "Institución Dev", dbName: codigo_institucion.toLowerCase(), stripeCustomerId: "dev_123", subscriptionStatus: 'active' },
      { upsert: true }
    );
    const tenantDb = mongoose.connection.useDb(codigo_institucion.toLowerCase(), { useCache: true });
    const TenantUser = tenantDb.model('User', UserSchema);
    await TenantUser.findOneAndUpdate(
      { username: 'master' },
      { fullName: 'Admin Maestro', email: 'master@dev.edu', password: 'master123', role: 'admin', aiAllowanceUSD: 9999 },
      { upsert: true }
    );
    res.json({ success: true, message: `Institución ${codigo_institucion} creada.` });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// MIDDLEWARE MULTI-TENANT
app.use('/api', async (req, res, next) => {
  try {
    if (mongoose.connection.readyState !== 1) await connectDB();
    const tenantId = req.headers['x-tenant-id'];
    if (!tenantId) return res.status(400).json({ error: "Falta el código de institución." });
    
    const tenant = await TenantModel.findOne({ dbName: tenantId.trim().toLowerCase() });
    if (!tenant || tenant.subscriptionStatus !== 'active') return res.status(403).json({ error: "Institución inactiva o no encontrada." });

    const tenantDb = mongoose.connection.useDb(tenant.dbName, { useCache: true });
    req.UserModel = tenantDb.model('User', UserSchema);
    req.DocumentModel = tenantDb.model('Document', DocumentSchema);
    next();
  } catch (error) { return res.status(500).json({ error: "Sin conexión a BD Tenant." }); }
});

async function serializeUser(user, DocumentModelRef) {
  const obj = user.toObject(); delete obj.password;
  const savedDocs = await DocumentModelRef.find({ username: obj.username }, { base64Data: 0, textContent: 0 }).lean();
  obj.subjects = (obj.subjects || []).map(s => {
    const embeddedDocs = (s.documents || []).map(d => ({ id: d.id, title: d.title, fileName: d.fileName }));
    const collectionDocs = savedDocs.filter(cd => cd.subjectId === s.id).map(cd => ({ id: cd.docId, title: cd.title, fileName: cd.fileName }));
    const map = new Map();
    [...embeddedDocs, ...collectionDocs].forEach(item => map.set(item.id, item));
    return { ...s, documents: Array.from(map.values()), storybooks: s.storybooks || [], audiobooks: s.audiobooks || [], presentations: s.presentations || [] };
  });
  return obj;
}

async function consumeTokens(user, costUSD) {
  if (user.role === 'admin') return true; 
  const remaining = user.aiAllowanceUSD - user.aiConsumptionUSD;
  if (remaining <= 0) throw new Error("Saldo de Tokens agotado.");
  user.aiConsumptionUSD += costUSD; return true;
}

async function getFullDocumentsForSubject(DocumentModelRef, username, subjectId, documentId) {
  const docs = await DocumentModelRef.find({ username, subjectId }).lean();
  if (documentId === 'ALL') return docs;
  return docs.filter(d => d.docId === documentId);
}

// ================= RUTAS AUTENTICACIÓN Y ADMIN =================
app.post('/api/auth/login', async (req, res) => { try { const user = await req.UserModel.findOne({ $or: [{ username: req.body.identifier.toLowerCase() }, { email: req.body.identifier.toLowerCase() }] }); if (!user || user.password !== req.body.password) return res.status(401).json({ error: "Incorrecto." }); res.json({ user: await serializeUser(user, req.DocumentModel) }); } catch (err) { res.status(500).json({ error: err.message }); } });
app.post('/api/auth/register', async (req, res) => { try { const newUser = new req.UserModel({ username: req.body.username.toLowerCase(), fullName: req.body.fullName, email: req.body.email.toLowerCase(), password: req.body.password, recoveryWord: req.body.recoveryWord, career: req.body.career, subjects: [{ id: 'subj-init', name: 'Mi Primera Materia', schedule: 'Semestre 1', documents: [], storybooks: [], audiobooks: [], presentations: [] }] }); await newUser.save(); res.json({ user: await serializeUser(newUser, req.DocumentModel) }); } catch (err) { res.status(500).json({ error: err.message }); } });
app.get('/api/auth/session/:username', async (req, res) => { try { const user = await req.UserModel.findOne({ username: req.params.username.toLowerCase() }); res.json({ user: await serializeUser(user, req.DocumentModel) }); } catch (err) { res.status(500).json({ error: err.message }); } });
app.post('/api/auth/reset-password', async (req, res) => { try { const user = await req.UserModel.findOne({ username: req.body.username.toLowerCase() }); if (!user || user.recoveryWord !== req.body.recoveryWord) return res.status(401).json({ error: "Datos incorrectos." }); user.password = req.body.newPassword; await user.save(); res.json({ success: true, message: "Contraseña actualizada." }); } catch (err) { res.status(500).json({ error: err.message }); } });
app.post('/api/user/change-password', async (req, res) => { try { const user = await req.UserModel.findOne({ username: req.body.username.toLowerCase() }); if (!user || user.password !== req.body.oldPassword) return res.status(401).json({ error: "Actual incorrecta." }); user.password = req.body.newPassword; await user.save(); res.json({ success: true }); } catch (err) { res.status(500).json({ error: err.message }); } });

app.get('/api/admin/users', async (req, res) => { try { const u = await req.UserModel.findOne({ username: req.headers['x-user'] }); if (!u || u.role !== 'admin') return res.status(403).json({ error: "Acceso denegado." }); res.json(await req.UserModel.find({ role: { $ne: 'admin' } }, { password: 0, recoveryWord: 0 })); } catch (err) { res.status(500).json({ error: err.message }); } });
app.post('/api/admin/create-user', async (req, res) => { try { const u = await req.UserModel.findOne({ username: req.headers['x-user'] }); if (!u || u.role !== 'admin') return res.status(403).json({ error: "Acceso denegado." }); await new req.UserModel({ username: req.body.username.toLowerCase(), fullName: req.body.fullName, email: `${req.body.username.toLowerCase()}@edu.com`, password: req.body.password, recoveryWord: 'admin123', career: req.body.career, aiAllowanceUSD: parseFloat(req.body.initialTokens) || 2.00, subjects: [{ id: 'subj-init', name: 'Materia 1', schedule: 'Semestre 1', presentations: [] }] }).save(); res.json({ success: true }); } catch (err) { res.status(500).json({ error: err.message }); } });
app.post('/api/admin/add-tokens', async (req, res) => { try { const t = await req.UserModel.findOne({ username: req.body.targetUsername }); t.aiAllowanceUSD += parseFloat(req.body.amount); t.pendingTokenRequest = false; await t.save(); res.json({ success: true }); } catch (err) { res.status(500).json({ error: err.message }); } });
app.post('/api/admin/force-reset', async (req, res) => { try { const t = await req.UserModel.findOne({ username: req.body.targetUsername }); t.password = req.body.newPassword; await t.save(); res.json({ success: true }); } catch (err) { res.status(500).json({ error: err.message }); } });
app.post('/api/user/request-tokens', async (req, res) => { try { const user = await req.UserModel.findOne({ username: req.body.username }); user.pendingTokenRequest = true; await user.save(); res.json({ success: true, user: await serializeUser(user, req.DocumentModel) }); } catch (err) { res.status(500).json({ error: err.message }); } });

// ================= MATERIAS Y DOCUMENTOS =================
app.post('/api/subjects', async (req, res) => { try { const user = await req.UserModel.findOne({ username: req.body.username.toLowerCase() }); const newSubj = { id: 'subj-' + Date.now(), name: req.body.name, schedule: req.body.schedule, documents: [], storybooks: [], audiobooks: [], presentations: [] }; user.subjects.push(newSubj); user.markModified('subjects'); await user.save(); res.json({ user: await serializeUser(user, req.DocumentModel), newSubjectId: newSubj.id }); } catch (err) { res.status(500).json({ error: err.message }); } });
app.delete('/api/subjects/:subjectId', async (req, res) => { try { const user = await req.UserModel.findOne({ username: req.body.username.toLowerCase() }); await req.DocumentModel.deleteMany({ username: user.username, subjectId: req.params.subjectId }); user.subjects = user.subjects.filter(s => s.id !== req.params.subjectId); user.markModified('subjects'); await user.save(); res.json({ user: await serializeUser(user, req.DocumentModel) }); } catch (err) { res.status(500).json({ error: err.message }); } });

app.post('/api/documents', upload.any(), async (req, res) => {
  try {
    const { username, subjectId, docTitle, youtubeUrl } = req.body;
    const user = await req.UserModel.findOne({ username: username.toLowerCase() });
    const dateStr = new Date().toLocaleDateString('es-GT');
    
    if (youtubeUrl && youtubeUrl.includes('youtu')) {
      let transcriptText = "";
      try {
        const transcript = await YoutubeTranscript.fetchTranscript(youtubeUrl);
        transcriptText = transcript.map(t => t.text).join(' ');
      } catch (e) {
        const ytRes = await generateWithFallback([`Genera un resumen analítico completo para: ${youtubeUrl}`], null);
        transcriptText = ytRes.text;
      }
      await new req.DocumentModel({
        docId: `doc-yt-${Date.now()}`, username: user.username, subjectId,
        title: docTitle || `Transcripción YouTube`, fileName: 'YouTube.txt', mimeType: 'text/plain',
        base64Data: null, textContent: transcriptText, uploadedAt: dateStr
      }).save();
    }

    if (req.files && req.files.length > 0) {
      for (let file of req.files) {
        // Control de límite estricto de 15MB para evitar el error de rango/offset en MongoDB
        if (file.buffer.length > 15 * 1024 * 1024) {
          return res.status(400).json({ 
            error: `El archivo "${file.originalname}" pesa más de 15MB. Divídelo en partes para subirlo correctamente.` 
          });
        }

        await new req.DocumentModel({
          docId: `doc-${Date.now()}-${Math.random()}`, username: user.username, subjectId,
          title: docTitle ? `${docTitle} (${file.originalname})` : file.originalname,
          fileName: file.originalname, mimeType: file.mimetype,
          base64Data: file.buffer.toString("base64"), textContent: 'Texto extraído de archivo.', uploadedAt: dateStr
        }).save();
      }
    }
    res.json({ user: await serializeUser(user, req.DocumentModel) });
  } catch (err) { res.status(500).json({ error: "Error al procesar el archivo. Es probable que sea demasiado pesado." }); }
});

app.delete('/api/documents/:docId', async (req, res) => { try { await req.DocumentModel.deleteOne({ docId: req.params.docId, username: req.body.username.toLowerCase() }); const user = await req.UserModel.findOne({ username: req.body.username.toLowerCase() }); res.json({ user: await serializeUser(user, req.DocumentModel) }); } catch (err) { res.status(500).json({ error: err.message }); } });
app.delete('/api/audiobooks/:abId', async (req, res) => { try { const user = await req.UserModel.findOne({ username: req.body.username.toLowerCase() }); const subj = user.subjects.find(s => s.id === req.body.subjectId); subj.audiobooks = subj.audiobooks.filter(ab => ab.id !== req.params.abId); user.markModified('subjects'); await user.save(); res.json({ user: await serializeUser(user, req.DocumentModel) }); } catch (err) { res.status(500).json({ error: err.message }); } });
app.delete('/api/storybooks/:sbId', async (req, res) => { try { const user = await req.UserModel.findOne({ username: req.body.username.toLowerCase() }); const subj = user.subjects.find(s => s.id === req.body.subjectId); subj.storybooks = subj.storybooks.filter(sb => sb.id !== req.params.sbId); user.markModified('subjects'); await user.save(); res.json({ user: await serializeUser(user, req.DocumentModel) }); } catch (err) { res.status(500).json({ error: err.message }); } });
app.delete('/api/presentations/:presId', async (req, res) => { try { const user = await req.UserModel.findOne({ username: req.body.username.toLowerCase() }); const subj = user.subjects.find(s => s.id === req.body.subjectId); subj.presentations = subj.presentations.filter(p => p.id !== req.params.presId); user.markModified('subjects'); await user.save(); res.json({ user: await serializeUser(user, req.DocumentModel) }); } catch (err) { res.status(500).json({ error: err.message }); } });
app.delete('/api/subjects/:subjectId/documents', async (req, res) => { try { const user = await req.UserModel.findOne({ username: req.body.username.toLowerCase() }); await req.DocumentModel.deleteMany({ username: user.username, subjectId: req.params.subjectId }); res.json({ user: await serializeUser(user, req.DocumentModel) }); } catch (err) { res.status(500).json({ error: err.message }); } });

// ================= ENDPOINTS IA (FASES 2 A 6) =================
app.post('/api/tts-clean', async (req, res) => {
  try {
    const { rawText } = req.body;
    if (!rawText) return res.json({ cleanedText: "" });
    const cleanedText = rawText.replace(/\b(CONFIDENCIAL|DRAFT)\b/gmi, '').replace(/(?:\bPágina\s+\d+\b|^\s*-\s*\d+\s*-\s*$|\b\d+\/\d+\b)/gmi, '').replace(/\[\d+(-\d+)?\]|\([A-Za-z]+,\s*\d{4}\)/g, '').replace(/https?:\/\/[^\s]+/g, ' enlace omitido ').replace(/[*_~^|<>{}\\]/g, '').replace(/\n+/g, '. ').replace(/\s{2,}/g, ' ').trim();
    res.json({ cleanedText });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

app.post('/api/tutor-rag', async (req, res) => {
  try {
    const user = await req.UserModel.findOne({ username: req.body.username.toLowerCase() });
    await consumeTokens(user, 0.05);
    const docs = await getFullDocumentsForSubject(req.DocumentModel, user.username, req.body.subjectId, req.body.documentId);
    const prompt = `Actúa como Tutor RAG estricto. REGLA ANTI-ALUCINACIONES: Responde basándote ÚNICAMENTE en el contexto. Cita la sección/párrafo/página al final. Duda: "${req.body.query}"`;
    const contents = [prompt];
    docs.forEach(doc => contents.push({ inlineData: { data: doc.base64Data, mimeType: doc.mimeType } }));
    const response = await generateWithFallback(contents, null);
    await user.save(); res.json({ explanation: response.text });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/generate-apa-advanced', async (req, res) => {
  try {
    const user = await req.UserModel.findOne({ username: req.body.username.toLowerCase() });
    await consumeTokens(user, 0.35);
    const docs = await getFullDocumentsForSubject(req.DocumentModel, user.username, req.body.subjectId, 'ALL');
    const prompt = `Ensayo científico sobre: "${req.body.topic}". REGLAS APA 7ma: HTML (<h1>, <p>). Citas intratextuales. Al menos una TABLA en HTML con <table style="border-collapse: collapse; width: 100%; border-top: 2px solid black; border-bottom: 2px solid black;"> y <td style="border-bottom: 1px solid black; padding: 8px;"> (sin bordes verticales). Referencias finales.`;
    const contents = [prompt];
    docs.forEach(doc => contents.push({ inlineData: { data: doc.base64Data, mimeType: doc.mimeType } }));
    const response = await generateWithFallback(contents, null);
    await user.save(); res.json({ apaDocument: response.text });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/research/outline', async (req, res) => {
  try {
    const user = await req.UserModel.findOne({ username: req.body.username.toLowerCase() });
    await consumeTokens(user, 0.10);
    const schema = { type: Type.OBJECT, properties: { chapters: { type: Type.ARRAY, items: { type: Type.STRING } } }, required: ["chapters"] };
    const response = await generateWithFallback([`Índice para investigar: "${req.body.topic}". Devuelve JSON de capítulos.`], schema);
    await user.save(); res.json({ outline: JSON.parse(response.text).chapters });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/research/chapter', async (req, res) => {
  try {
    const user = await req.UserModel.findOne({ username: req.body.username.toLowerCase() });
    await consumeTokens(user, 0.25); 
    const { topic, chapterTitle, previousChapterSummary } = req.body;
    let prompt = `Redacta el capítulo "${chapterTitle}" de la investigación "${topic}". FILTRO ANTI-PLAGIO ACTIVO: Estilo original, 0% similitud Turnitin. Devuelve HTML.`;
    if (previousChapterSummary) prompt += `\nResumen anterior: "${previousChapterSummary}".`;
    const response = await generateWithFallback([prompt], null);
    await user.save(); res.json({ chapterContent: response.text });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/clinical-simulator', async (req, res) => {
  try {
    const user = await req.UserModel.findOne({ username: req.body.username.toLowerCase() });
    await consumeTokens(user, 0.05);
    const docs = await getFullDocumentsForSubject(req.DocumentModel, user.username, req.body.subjectId, req.body.documentId);
    const prompt = `Eres un paciente en una clínica psicológica. Asume un trastorno basado en los documentos (sin revelar el nombre). Historial: ${req.body.history}. Psicólogo: "${req.body.message}". Responde evasivo y emotivo. Máximo 3 oraciones.`;
    const contents = [prompt];
    if (req.body.history === '') { docs.forEach(doc => contents.push({ inlineData: { data: doc.base64Data, mimeType: doc.mimeType } })); }
    const response = await generateWithFallback(contents, null);
    await user.save(); res.json({ reply: response.text });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/generate-presentation', async (req, res) => {
  try {
    const user = await req.UserModel.findOne({ username: req.body.username.toLowerCase() });
    await consumeTokens(user, 0.25);
    const docs = await getFullDocumentsForSubject(req.DocumentModel, user.username, req.body.subjectId, req.body.documentId);
    const contents = [`Diseña presentación interactiva alternando diapositivas 'summary' y 'trivia'.`];
    docs.forEach(doc => contents.push({ inlineData: { data: doc.base64Data, mimeType: doc.mimeType } }));
    const schema = { type: Type.OBJECT, properties: { presentationTitle: { type: Type.STRING }, slides: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { type: { type: Type.STRING }, title: { type: Type.STRING }, content: { type: Type.STRING }, options: { type: Type.ARRAY, items: { type: Type.STRING } }, correctIndex: { type: Type.INTEGER }, explanation: { type: Type.STRING } }, required: ["type", "title", "content"] } } }, required: ["presentationTitle", "slides"] };
    const response = await generateWithFallback(contents, schema);
    const newPresentation = { id: 'pres-' + Date.now(), createdAt: new Date().toLocaleString('es-GT'), ...JSON.parse(response.text) };
    const subj = user.subjects.find(s => s.id === req.body.subjectId);
    subj.presentations = subj.presentations || []; subj.presentations.push(newPresentation); user.markModified('subjects'); await user.save();
    res.json({ presentation: newPresentation, user: await serializeUser(user, req.DocumentModel) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/philosophy-realism', async (req, res) => {
  try {
    const user = await req.UserModel.findOne({ username: req.body.username.toLowerCase() });
    await consumeTokens(user, 0.10);
    const response = await generateWithFallback([`Analiza bajo la perspectiva Aristotélico-Tomista: "${req.body.query}". Devuelve HTML.`], null);
    await user.save(); res.json({ answer: response.text });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/generate-evolutionary-storybook', async (req, res) => {
  try {
    const user = await req.UserModel.findOne({ username: req.body.username.toLowerCase() });
    await consumeTokens(user, 0.20);
    const docs = await getFullDocumentsForSubject(req.DocumentModel, user.username, req.body.subjectId, req.body.documentId);
    const contents = [`Transforma textos en narrativa cronológica estilo novela gráfica.`];
    docs.forEach(doc => contents.push({ inlineData: { data: doc.base64Data, mimeType: doc.mimeType } }));
    const schema = { type: Type.OBJECT, properties: { title: { type: Type.STRING }, summary: { type: Type.STRING }, scenes: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { sceneNumber: { type: Type.INTEGER }, characterName: { type: Type.STRING }, academicConcept: { type: Type.STRING }, storyDialogue: { type: Type.STRING } }, required: ["sceneNumber", "characterName", "academicConcept", "storyDialogue"] } }, timeline: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { step: { type: Type.INTEGER }, title: { type: Type.STRING }, description: { type: Type.STRING } }, required: ["step", "title", "description"] } }, quiz: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { question: { type: Type.STRING }, options: { type: Type.ARRAY, items: { type: Type.STRING } }, correctIndex: { type: Type.INTEGER }, heroExplanation: { type: Type.STRING } }, required: ["question", "options", "correctIndex", "heroExplanation"] } } }, required: ["title", "summary", "scenes", "timeline", "quiz"] };
    const response = await generateWithFallback(contents, schema);
    const newStorybook = { id: 'sb-' + Date.now(), ...JSON.parse(response.text) };
    const subj = user.subjects.find(s => s.id === req.body.subjectId);
    subj.storybooks = subj.storybooks || []; subj.storybooks.push(newStorybook); user.markModified('subjects'); await user.save();
    res.json({ storybook: newStorybook, user: await serializeUser(user, req.DocumentModel) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/generate-glossary', async (req, res) => {
  try {
    const user = await req.UserModel.findOne({ username: req.body.username.toLowerCase() });
    await consumeTokens(user, 0.10);
    const docs = await getFullDocumentsForSubject(req.DocumentModel, user.username, req.body.subjectId, req.body.documentId);
    const contents = [`Genera glosario técnico.`];
    docs.forEach(doc => contents.push({ inlineData: { data: doc.base64Data, mimeType: doc.mimeType } }));
    const schema = { type: Type.OBJECT, properties: { glossaryTitle: { type: Type.STRING }, terms: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { term: { type: Type.STRING }, definition: { type: Type.STRING } }, required: ["term", "definition"] } } }, required: ["glossaryTitle", "terms"] };
    const response = await generateWithFallback(contents, schema);
    await user.save(); res.json({ glossary: JSON.parse(response.text) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/generate-mindmap', async (req, res) => {
  try {
    const user = await req.UserModel.findOne({ username: req.body.username.toLowerCase() });
    await consumeTokens(user, 0.15);
    const docs = await getFullDocumentsForSubject(req.DocumentModel, user.username, req.body.subjectId, req.body.documentId);
    const contents = [`Devuelve ÚNICAMENTE código Mermaid.js (graph TD) limpio. Sin backticks.`];
    docs.forEach(doc => contents.push({ inlineData: { data: doc.base64Data, mimeType: doc.mimeType } }));
    const response = await generateWithFallback(contents, null);
    await user.save(); res.json({ mermaidCode: response.text.replace(/```mermaid/g, '').replace(/```/g, '').trim() });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/audiobook-chapters', async (req, res) => {
  try {
    const user = await req.UserModel.findOne({ username: req.body.username.toLowerCase() });
    await consumeTokens(user, 0.25);
    const docs = await getFullDocumentsForSubject(req.DocumentModel, user.username, req.body.subjectId, req.body.documentId);
    const contents = ["Extrae obra completa en capítulos y resumen (bookSummary)."];
    docs.forEach(doc => contents.push({ inlineData: { data: doc.base64Data, mimeType: doc.mimeType } }));
    const schema = { type: Type.OBJECT, properties: { audiobookTitle: { type: Type.STRING }, bookSummary: { type: Type.STRING }, chapters: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { chapterTitle: { type: Type.STRING }, chapterContent: { type: Type.STRING } }, required: ["chapterTitle", "chapterContent"] } } }, required: ["audiobookTitle", "bookSummary", "chapters"] };
    const response = await generateWithFallback(contents, schema);
    const newAudiobook = { id: 'ab-' + Date.now(), ...JSON.parse(response.text) };
    const subj = user.subjects.find(s => s.id === req.body.subjectId);
    subj.audiobooks = subj.audiobooks || []; subj.audiobooks.push(newAudiobook); user.markModified('subjects'); await user.save();
    res.json({ audiobook: newAudiobook, user: await serializeUser(user, req.DocumentModel) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 AprendePro activo en puerto ${PORT}`));
