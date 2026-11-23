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
        mustChangePassword: true,
        universityName: institutionName,
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

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }
});

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const DEFAULT_GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3-flash-preview';

// Generador rápido con Gemini 3 Flash por defecto y respaldo estable
async function generateWithFallback(contents, responseSchema) {
  const modelsToTry = [DEFAULT_GEMINI_MODEL, 'gemini-3-flash-preview', 'gemini-2.5-flash', 'gemini-1.5-flash'];
  let lastErr = null;
  for (const modelName of modelsToTry) {
    try {
      return await ai.models.generateContent({
        model: modelName,
        contents,
        config: responseSchema ? {
          responseMimeType: 'application/json',
          responseSchema,
          temperature: 0.4
        } : { temperature: 0.4 }
      });
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr;
}

// ================= UTILIDAD DE LIMPIEZA PARA AUDIOLIBROS DE LECTURA CORRIDA =================
function sanitizeForFluidTTS(rawText) {
  if (!rawText) return "";
  return rawText
    .replace(/\b(CONFIDENCIAL|DRAFT|BORRADOR|PÁGINA|PÁG)\b\.?\s*\d*/gi, ' ')
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/\([^)]*\d{4}[^)]*\)/g, ' ')
    .replace(/https?:\/\/[^\s]+/g, ' ')
    .replace(/[\w.-]+@[\w.-]+\.\w+/g, ' ')
    .replace(/[\r\n•▪◦●\-–—]+/g, ' ')
    .replace(/[,;:()[\]{}"'«»“”‘’*#_~^|<>/\\+=@$%&!?¡¿]/g, ' ')
    .replace(/\./g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// ================= ESQUEMAS MAESTROS Y DE TENANT =================
const TenantSchema = new mongoose.Schema({
  companyName: String,
  dbName: { type: String, unique: true },
  stripeCustomerId: String,
  subscriptionStatus: { type: String, default: 'active' },
  licenseExpiresAt: Date,
  createdAt: { type: Date, default: Date.now }
});
const TenantModel = mongoose.model('Tenant', TenantSchema);

// Catálogo Maestro de Pensums Universitarios
const CareerPensumSchema = new mongoose.Schema({
  careerCode: { type: String, unique: true },
  careerName: String,
  faculty: String,
  philosophicalFramework: String,
  citationStyle: { type: String, default: 'APA7' },
  cycles: [{
    cycleNumber: Number,
    cycleName: String,
    courses: [{
      courseCode: String,
      name: String,
      credits: Number,
      domainTags: [String]
    }]
  }]
});
const CareerPensumModel = mongoose.model('CareerPensum', CareerPensumSchema);

const DocumentSchema = new mongoose.Schema({
  docId: { type: String, unique: true, index: true },
  username: { type: String, lowercase: true, index: true },
  subjectId: { type: String, index: true },
  title: String,
  fileName: String,
  mimeType: String,
  base64Data: String,
  textContent: String,
  isOfficialCurriculum: { type: Boolean, default: false },
  uploadedAt: String
});

const UserSchema = new mongoose.Schema({
  username: { type: String, unique: true, lowercase: true },
  fullName: String,
  email: { type: String, lowercase: true },
  password: String,
  mustChangePassword: { type: Boolean, default: true },
  recoveryWord: String,
  universityName: { type: String, default: 'Universidad Galileo' },
  career: String,
  careerCode: { type: String, default: 'PSIC_CLINICA_GALILEO' },
  citationStyle: { type: String, default: 'APA7' },
  role: { type: String, default: 'student' },
  aiAllowanceUSD: { type: Number, default: 2.00 },
  aiConsumptionUSD: { type: Number, default: 0 },
  pendingTokenRequest: { type: Boolean, default: false },
  storybooksCreated: { type: Number, default: 0 },
  subjects: Array
});

// Base de Conocimiento Acumulativa por Curso (Retroalimentación ML/RAG Local)
const CourseKnowledgeBaseSchema = new mongoose.Schema({
  username: { type: String, lowercase: true, index: true },
  subjectId: { type: String, index: true },
  careerCode: String,
  learnedConcepts: [{
    concept: String,
    category: String,
    summary: String,
    sourceDocTitle: String,
    isOfficialCurriculum: { type: Boolean, default: false },
    updatedAt: { type: Date, default: Date.now }
  }],
  neurochemicalRules: [{
    substance: String,
    condition: String,
    cascadeReaction: String,
    neuropsychologicalImpact: String,
    sourceDocTitle: String
  }]
});

function getKnowledgeModel(tenantDb) {
  return tenantDb.model('CourseKnowledgeBase', CourseKnowledgeBaseSchema);
}

// ================= SEMILLA DE PENSUMS (PSICOLOGÍA CLÍNICA ICF GALILEO Y MEDICINA) =================
async function seedDefaultPensums() {
  const psicGalileo = {
    careerCode: 'PSIC_CLINICA_GALILEO',
    careerName: 'Licenciatura en Psicología Clínica',
    faculty: 'Instituto de Ciencias de la Familia (ICF) - Universidad Galileo',
    philosophicalFramework: 'Humanismo Personalista, Antropología Filosófica y Logoterapia (Viktor Frankl). La persona humana es una unidad bio-psico-espiritual; se evita el reduccionismo conductista anglosajón.',
    citationStyle: 'APA7',
    cycles: [
      {
        cycleNumber: 1, cycleName: '1er Ciclo (Primer Año)',
        courses: [
          { courseCode: 'PSI-101', name: 'Antropología', credits: 3, domainTags: ['HUMANISM_PHILOSOPHY'] },
          { courseCode: 'PSI-102', name: 'Escuelas Psicológicas I', credits: 3, domainTags: ['THEORY'] },
          { courseCode: 'PSI-103', name: 'Psicología Evolutiva I', credits: 3, domainTags: ['DEVELOPMENT'] },
          { courseCode: 'PSI-104', name: 'Filosofía I', credits: 3, domainTags: ['HUMANISM_PHILOSOPHY'] },
          { courseCode: 'PSI-105', name: 'Informática I', credits: 3, domainTags: ['TECH'] },
          { courseCode: 'PSI-106', name: 'Neuroanatomía', credits: 4, domainTags: ['INTERACTIVE_NEURO_ATLAS', 'BIOLOGY'] },
          { courseCode: 'PSI-107', name: 'Psicología General', credits: 3, domainTags: ['THEORY'] }
        ]
      },
      {
        cycleNumber: 2, cycleName: '2do Ciclo (Primer Año)',
        courses: [
          { courseCode: 'PSI-201', name: 'Escuelas Psicológicas II', credits: 3, domainTags: ['THEORY'] },
          { courseCode: 'PSI-202', name: 'Psicología Evolutiva II', credits: 3, domainTags: ['DEVELOPMENT'] },
          { courseCode: 'PSI-203', name: 'Técnicas de Investigación', credits: 3, domainTags: ['RESEARCH'] },
          { courseCode: 'PSI-204', name: 'Filosofía II', credits: 3, domainTags: ['HUMANISM_PHILOSOPHY'] },
          { courseCode: 'PSI-205', name: 'Informática II', credits: 3, domainTags: ['TECH'] },
          { courseCode: 'PSI-206', name: 'Sociología', credits: 3, domainTags: ['HUMANISM_PHILOSOPHY'] },
          { courseCode: 'PSI-207', name: 'Neurociencia Cognitiva', credits: 4, domainTags: ['INTERACTIVE_NEURO_ATLAS', 'SYNAPSE_LAB'] }
        ]
      },
      {
        cycleNumber: 3, cycleName: '3er Ciclo (Segundo Año)',
        courses: [
          { courseCode: 'PSI-301', name: 'Desarrollo de la Personalidad I', credits: 3, domainTags: ['HUMANISM_PHILOSOPHY', 'THEORY'] },
          { courseCode: 'PSI-302', name: 'Estadística Aplicada a la Psicología I', credits: 4, domainTags: ['PSYCHOMETRICS_LAB'] },
          { courseCode: 'PSI-303', name: 'Informática III', credits: 3, domainTags: ['TECH'] },
          { courseCode: 'PSI-304', name: 'Neuroendocrinología', credits: 4, domainTags: ['INTERACTIVE_NEURO_ATLAS', 'SYNAPSE_LAB'] },
          { courseCode: 'PSI-305', name: 'Psicología del Lenguaje', credits: 4, domainTags: ['INTERACTIVE_NEURO_ATLAS'] },
          { courseCode: 'PSI-306', name: 'Personalismo I', credits: 3, domainTags: ['HUMANISM_PHILOSOPHY'] },
          { courseCode: 'PSI-307', name: 'Teoría del Conocimiento', credits: 3, domainTags: ['HUMANISM_PHILOSOPHY'] }
        ]
      },
      {
        cycleNumber: 4, cycleName: '4to Ciclo (Segundo Año)',
        courses: [
          { courseCode: 'PSI-401', name: 'Desarrollo de la Personalidad II', credits: 3, domainTags: ['HUMANISM_PHILOSOPHY', 'THEORY'] },
          { courseCode: 'PSI-402', name: 'Estadística Aplicada a la Psicología II', credits: 3, domainTags: ['PSYCHOMETRICS_LAB'] },
          { courseCode: 'PSI-403', name: 'Filosofía de la Ciencia', credits: 3, domainTags: ['HUMANISM_PHILOSOPHY', 'RESEARCH'] },
          { courseCode: 'PSI-404', name: 'Informática IV', credits: 3, domainTags: ['TECH'] },
          { courseCode: 'PSI-405', name: 'Laboratorio IMRF en Neurociencia Cognitiva', credits: 4, domainTags: ['INTERACTIVE_NEURO_ATLAS', 'SYNAPSE_LAB'] },
          { courseCode: 'PSI-406', name: 'Psicología del Aprendizaje', credits: 4, domainTags: ['THEORY'] },
          { courseCode: 'PSI-407', name: 'Personalismo II', credits: 3, domainTags: ['HUMANISM_PHILOSOPHY'] }
        ]
      },
      {
        cycleNumber: 5, cycleName: '5to Ciclo (Tercer Año)',
        courses: [
          { courseCode: 'PSI-501', name: 'Informática V', credits: 3, domainTags: ['TECH'] },
          { courseCode: 'PSI-502', name: 'Evaluación Psicológica', credits: 3, domainTags: ['CLINICAL_HUMANIST_SIM', 'PSYCHOMETRICS_LAB'] },
          { courseCode: 'PSI-503', name: 'Práctica Clínica Supervisada I', credits: 4, domainTags: ['CLINICAL_HUMANIST_SIM'] },
          { courseCode: 'PSI-504', name: 'Psicopatología en Adultos I', credits: 4, domainTags: ['CLINICAL_HUMANIST_SIM', 'INTERACTIVE_NEURO_ATLAS'] },
          { courseCode: 'PSI-505', name: 'Psicometría I', credits: 4, domainTags: ['PSYCHOMETRICS_LAB'] },
          { courseCode: 'PSI-506', name: 'Psicoterapia I', credits: 3, domainTags: ['CLINICAL_HUMANIST_SIM'] },
          { courseCode: 'PSI-507', name: 'Terapia Sistémica', credits: 3, domainTags: ['CLINICAL_HUMANIST_SIM'] },
          { courseCode: 'PSI-508', name: 'Ética Profesional', credits: 3, domainTags: ['HUMANISM_PHILOSOPHY'] }
        ]
      },
      {
        cycleNumber: 6, cycleName: '6to Ciclo (Tercer Año)',
        courses: [
          { courseCode: 'PSI-601', name: 'Axiología', credits: 3, domainTags: ['HUMANISM_PHILOSOPHY'] },
          { courseCode: 'PSI-602', name: 'Informática VI', credits: 3, domainTags: ['TECH'] },
          { courseCode: 'PSI-603', name: 'Seminario Logoterapéutico', credits: 3, domainTags: ['CLINICAL_HUMANIST_SIM', 'HUMANISM_PHILOSOPHY'] },
          { courseCode: 'PSI-604', name: 'Técnicas de Modificación de Conductas', credits: 3, domainTags: ['CLINICAL_HUMANIST_SIM'] },
          { courseCode: 'PSI-605', name: 'Práctica Clínica Supervisada II', credits: 4, domainTags: ['CLINICAL_HUMANIST_SIM'] },
          { courseCode: 'PSI-606', name: 'Psicopatología en Adultos II', credits: 4, domainTags: ['CLINICAL_HUMANIST_SIM', 'INTERACTIVE_NEURO_ATLAS'] },
          { courseCode: 'PSI-607', name: 'Psicometría II', credits: 4, domainTags: ['PSYCHOMETRICS_LAB'] },
          { courseCode: 'PSI-608', name: 'Psicoterapia II', credits: 3, domainTags: ['CLINICAL_HUMANIST_SIM'] }
        ]
      },
      {
        cycleNumber: 7, cycleName: '7mo Ciclo (Cuarto Año)',
        courses: [
          { courseCode: 'PSI-701', name: 'Informática VII', credits: 3, domainTags: ['TECH'] },
          { courseCode: 'PSI-702', name: 'Psicopatología III', credits: 3, domainTags: ['CLINICAL_HUMANIST_SIM'] },
          { courseCode: 'PSI-703', name: 'Terapia Cognitiva I', credits: 3, domainTags: ['CLINICAL_HUMANIST_SIM'] },
          { courseCode: 'PSI-704', name: 'Práctica Clínica Supervisada III', credits: 4, domainTags: ['CLINICAL_HUMANIST_SIM'] },
          { courseCode: 'PSI-705', name: 'Psicología de la Educación', credits: 3, domainTags: ['THEORY'] },
          { courseCode: 'PSI-706', name: 'Psicopatología Infanto-Juvenil', credits: 4, domainTags: ['CLINICAL_HUMANIST_SIM'] },
          { courseCode: 'PSI-707', name: 'Psicofarmacología I', credits: 4, domainTags: ['SYNAPSE_LAB', 'INTERACTIVE_NEURO_ATLAS'] },
          { courseCode: 'PSI-708', name: 'Psicoterapia en Adicciones', credits: 4, domainTags: ['CLINICAL_HUMANIST_SIM', 'SYNAPSE_LAB'] }
        ]
      },
      {
        cycleNumber: 8, cycleName: '8vo Ciclo (Cuarto Año)',
        courses: [
          { courseCode: 'PSI-801', name: 'Informática VIII', credits: 3, domainTags: ['TECH'] },
          { courseCode: 'PSI-802', name: 'Laboratorio Vivencial', credits: 4, domainTags: ['CLINICAL_HUMANIST_SIM'] },
          { courseCode: 'PSI-803', name: 'Terapia Cognitiva II', credits: 3, domainTags: ['CLINICAL_HUMANIST_SIM'] },
          { courseCode: 'PSI-804', name: 'Seminario de Psicopatología', credits: 4, domainTags: ['CLINICAL_HUMANIST_SIM'] },
          { courseCode: 'PSI-805', name: 'Terapia Basada en la Persona', credits: 4, domainTags: ['CLINICAL_HUMANIST_SIM', 'HUMANISM_PHILOSOPHY'] },
          { courseCode: 'PSI-806', name: 'Psicología Social', credits: 3, domainTags: ['HUMANISM_PHILOSOPHY'] },
          { courseCode: 'PSI-807', name: 'Práctica Clínica Supervisada IV', credits: 4, domainTags: ['CLINICAL_HUMANIST_SIM'] },
          { courseCode: 'PSI-808', name: 'Psicofarmacología II', credits: 4, domainTags: ['SYNAPSE_LAB', 'INTERACTIVE_NEURO_ATLAS'] }
        ]
      },
      {
        cycleNumber: 9, cycleName: '9no Ciclo (Quinto Año)',
        courses: [
          { courseCode: 'PSI-901', name: 'Seminario de Tesis I', credits: 3, domainTags: ['RESEARCH'] },
          { courseCode: 'PSI-902', name: 'Psicología de Grupo', credits: 3, domainTags: ['CLINICAL_HUMANIST_SIM'] },
          { courseCode: 'PSI-903', name: 'Trastornos de la Sexualidad', credits: 3, domainTags: ['CLINICAL_HUMANIST_SIM'] },
          { courseCode: 'PSI-904', name: 'Genética y Embriología', credits: 4, domainTags: ['INTERACTIVE_BODY_ATLAS'] },
          { courseCode: 'PSI-905', name: 'Laboratorio Emergencias y Hospitalización', credits: 4, domainTags: ['CLINICAL_HUMANIST_SIM'] },
          { courseCode: 'PSI-906', name: 'Informática IX', credits: 3, domainTags: ['TECH'] },
          { courseCode: 'PSI-907', name: 'Práctica Clínica Supervisada V', credits: 4, domainTags: ['CLINICAL_HUMANIST_SIM'] },
          { courseCode: 'PSI-908', name: 'Logoterapia', credits: 3, domainTags: ['CLINICAL_HUMANIST_SIM', 'HUMANISM_PHILOSOPHY'] }
        ]
      },
      {
        cycleNumber: 10, cycleName: '10mo Ciclo (Quinto Año)',
        courses: [
          { courseCode: 'PSI-1001', name: 'Bioética', credits: 3, domainTags: ['HUMANISM_PHILOSOPHY'] },
          { courseCode: 'PSI-1002', name: 'Seminario de Tesis II', credits: 3, domainTags: ['RESEARCH'] },
          { courseCode: 'PSI-1003', name: 'Terapia en Disfunciones Sexuales', credits: 3, domainTags: ['CLINICAL_HUMANIST_SIM'] },
          { courseCode: 'PSI-1004', name: 'Psicología de la Religión', credits: 3, domainTags: ['HUMANISM_PHILOSOPHY'] },
          { courseCode: 'PSI-1005', name: 'Psicología Social del Conflicto', credits: 3, domainTags: ['HUMANISM_PHILOSOPHY'] },
          { courseCode: 'PSI-1006', name: 'Informática X', credits: 3, domainTags: ['TECH'] },
          { courseCode: 'PSI-1007', name: 'Práctica Clínica Supervisada VI', credits: 4, domainTags: ['CLINICAL_HUMANIST_SIM'] },
          { courseCode: 'PSI-1008', name: 'Psicología de las Organizaciones', credits: 3, domainTags: ['THEORY'] }
        ]
      }
    ]
  };

  const medicinaGeneral = {
    careerCode: 'MED_CIRUGIA',
    careerName: 'Licenciatura en Medicina y Cirugía',
    faculty: 'Facultad de Ciencias de la Salud',
    philosophicalFramework: 'Medicina Basada en Evidencia, Correlación Anatomo-Fisiopatológica y Ética Hipocrática.',
    citationStyle: 'VANCOUVER',
    cycles: [
      {
        cycleNumber: 1, cycleName: '1er Ciclo (Ciencias Básicas)',
        courses: [
          { courseCode: 'MED-101', name: 'Anatomía Humana I', credits: 5, domainTags: ['INTERACTIVE_BODY_ATLAS'] },
          { courseCode: 'MED-102', name: 'Histología y Embriología', credits: 4, domainTags: ['INTERACTIVE_BODY_ATLAS'] },
          { courseCode: 'MED-103', name: 'Bioquímica Médica', credits: 4, domainTags: ['SYNAPSE_LAB'] }
        ]
      },
      {
        cycleNumber: 2, cycleName: '2do Ciclo (Fisiología y Neuro)',
        courses: [
          { courseCode: 'MED-201', name: 'Fisiología Humana', credits: 5, domainTags: ['INTERACTIVE_BODY_ATLAS', 'SYNAPSE_LAB'] },
          { courseCode: 'MED-202', name: 'Neuroanatomía Funcional', credits: 4, domainTags: ['INTERACTIVE_NEURO_ATLAS', 'SYNAPSE_LAB'] }
        ]
      },
      {
        cycleNumber: 3, cycleName: '3er Ciclo (Clínica y Farmacología)',
        courses: [
          { courseCode: 'MED-301', name: 'Semiología y Propedéutica Clínica', credits: 5, domainTags: ['MEDICAL_SOAP_SIM', 'INTERACTIVE_BODY_ATLAS'] },
          { courseCode: 'MED-302', name: 'Farmacología Clínica', credits: 4, domainTags: ['SYNAPSE_LAB'] }
        ]
      }
    ]
  };

  await CareerPensumModel.findOneAndUpdate({ careerCode: 'PSIC_CLINICA_GALILEO' }, psicGalileo, { upsert: true });
  await CareerPensumModel.findOneAndUpdate({ careerCode: 'MED_CIRUGIA' }, medicinaGeneral, { upsert: true });
}

const MONGO_URI = (process.env.MONGO_URI || '').trim();
async function connectDB() {
  if (!MONGO_URI) throw new Error("MONGO_URI no configurada.");
  if (mongoose.connection.readyState === 1) return;
  await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 5000 });
  await seedDefaultPensums();
}
connectDB().catch(() => console.log("Reintentando conexión..."));

// ================= CREACIÓN CONTROLADA DE INSTITUCIONES / UNIVERSIDADES =================
app.post('/api/admin/create-institution', async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) await connectDB();
    const { adminSecret, codigo_institucion, universityName, adminEmail, adminPassword } = req.body;

    if (adminSecret && adminSecret !== (process.env.MASTER_ADMIN_KEY || 'aprendepro_master_2026')) {
      return res.status(403).json({ error: "Clave maestra inválida." });
    }
    if (!codigo_institucion) return res.status(400).json({ error: "Falta codigo_institucion" });

    const cleanCode = codigo_institucion.trim().toLowerCase();
    const instName = universityName || `Institución ${cleanCode.toUpperCase()}`;

    await TenantModel.findOneAndUpdate(
      { dbName: cleanCode },
      {
        companyName: instName,
        dbName: cleanCode,
        stripeCustomerId: `inst_${Date.now()}`,
        subscriptionStatus: 'active',
        licenseExpiresAt: new Date(new Date().setFullYear(new Date().getFullYear() + 1))
      },
      { upsert: true }
    );

    const tenantDb = mongoose.connection.useDb(cleanCode, { useCache: true });
    const TenantUser = tenantDb.model('User', UserSchema);
    await TenantUser.findOneAndUpdate(
      { username: 'master' },
      {
        fullName: 'Administrador Maestro',
        email: adminEmail || 'master@aprendepro.edu',
        password: adminPassword || 'master123',
        mustChangePassword: false,
        universityName: instName,
        role: 'admin',
        aiAllowanceUSD: 9999
      },
      { upsert: true }
    );
    res.json({ success: true, message: `Institución "${instName}" (${cleanCode}) creada y activada.` });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ================= MIDDLEWARE MULTI-TENANT =================
app.use('/api', async (req, res, next) => {
  try {
    if (mongoose.connection.readyState !== 1) await connectDB();
    const tenantId = req.headers['x-tenant-id'];
    if (!tenantId) return res.status(400).json({ error: "Falta el código de institución." });

    const tenant = await TenantModel.findOne({ dbName: tenantId.trim().toLowerCase() });
    if (!tenant || tenant.subscriptionStatus !== 'active') return res.status(403).json({ error: "Institución inactiva o no encontrada." });

    const tenantDb = mongoose.connection.useDb(tenant.dbName, { useCache: true });
    req.TenantInfo = tenant;
    req.UserModel = tenantDb.model('User', UserSchema);
    req.DocumentModel = tenantDb.model('Document', DocumentSchema);
    req.KnowledgeModel = getKnowledgeModel(tenantDb);
    next();
  } catch (error) { return res.status(500).json({ error: "Sin conexión a BD Tenant." }); }
});

async function serializeUser(user, DocumentModelRef) {
  const obj = user.toObject();
  delete obj.password;
  const savedDocs = await DocumentModelRef.find({ username: obj.username }, { base64Data: 0, textContent: 0 }).lean();
  obj.subjects = (obj.subjects || []).map(s => {
    const embeddedDocs = (s.documents || []).map(d => ({ id: d.id, title: d.title, fileName: d.fileName }));
    const collectionDocs = savedDocs.filter(cd => cd.subjectId === s.id).map(cd => ({
      id: cd.docId,
      title: cd.title,
      fileName: cd.fileName,
      isOfficialCurriculum: cd.isOfficialCurriculum || false
    }));
    const map = new Map();
    [...embeddedDocs, ...collectionDocs].forEach(item => map.set(item.id, item));
    return {
      ...s,
      documents: Array.from(map.values()),
      storybooks: s.storybooks || [],
      audiobooks: s.audiobooks || [],
      presentations: s.presentations || []
    };
  });
  return obj;
}

async function consumeTokens(user, costUSD) {
  if (user.role === 'admin') return true;
  const remaining = user.aiAllowanceUSD - user.aiConsumptionUSD;
  if (remaining <= 0) throw new Error("Saldo de Tokens agotado.");
  user.aiConsumptionUSD += costUSD;
  return true;
}

async function getFullDocumentsForSubject(DocumentModelRef, username, subjectId, documentId) {
  const docs = await DocumentModelRef.find({ username, subjectId }).lean();
  if (!documentId || documentId === 'ALL') return docs;
  return docs.filter(d => d.docId === documentId);
}

// ================= RUTAS AUTENTICACIÓN, PENSUMS Y ADMIN =================
app.get('/api/pensums', async (req, res) => {
  try {
    const pensums = await CareerPensumModel.find({}, {
      careerCode: 1,
      careerName: 1,
      faculty: 1,
      philosophicalFramework: 1,
      citationStyle: 1,
      'cycles.cycleNumber': 1,
      'cycles.cycleName': 1
    }).lean();
    res.json({ pensums });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/user/enroll-pensum', async (req, res) => {
  try {
    const { username, careerCode, cycleNumber } = req.body;
    const user = await req.UserModel.findOne({ username: username.toLowerCase() });
    const pensum = await CareerPensumModel.findOne({ careerCode });
    if (!pensum) return res.status(404).json({ error: "Pensum no encontrado." });

    const cycle = pensum.cycles.find(c => c.cycleNumber === parseInt(cycleNumber));
    if (!cycle) return res.status(404).json({ error: "Ciclo no encontrado." });

    user.career = pensum.careerName;
    user.careerCode = pensum.careerCode;
    user.citationStyle = pensum.citationStyle;

    user.subjects = cycle.courses.map(c => ({
      id: `${c.courseCode}-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      courseCode: c.courseCode,
      name: c.name,
      credits: c.credits,
      schedule: cycle.cycleName,
      domainTags: c.domainTags,
      documents: [],
      storybooks: [],
      audiobooks: [],
      presentations: []
    }));

    user.markModified('subjects');
    await user.save();
    res.json({
      success: true,
      philosophicalFramework: pensum.philosophicalFramework,
      user: await serializeUser(user, req.DocumentModel)
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const id = (req.body.identifier || '').trim().toLowerCase();
    const user = await req.UserModel.findOne({
      $or: [{ username: id }, { email: id }]
    });
    if (!user || (user.password || '').trim() !== (req.body.password || '').trim()) {
      return res.status(401).json({ error: "Usuario o contraseña incorrectos." });
    }
    res.json({ user: await serializeUser(user, req.DocumentModel) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Auto-registro público deshabilitado: solo el administrador crea cuentas tras verificar pago
app.post('/api/auth/register', (req, res) => {
  return res.status(403).json({
    error: "El registro libre está deshabilitado. Tras verificar tu pago, el administrador activará tu cuenta y te enviará tus credenciales por correo."
  });
});

app.get('/api/auth/session/:username', async (req, res) => {
  try {
    const user = await req.UserModel.findOne({ username: req.params.username.toLowerCase() });
    res.json({ user: await serializeUser(user, req.DocumentModel) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Cambio de contraseña tolerante a espacios y mayúsculas
app.post('/api/user/change-password', async (req, res) => {
  try {
    const cleanUser = (req.body.username || '').trim().toLowerCase();
    const oldPass = (req.body.oldPassword || '').trim();
    const newPass = (req.body.newPassword || '').trim();

    const user = await req.UserModel.findOne({
      $or: [{ username: cleanUser }, { fullName: new RegExp(`^${cleanUser}$`, 'i') }]
    });

    if (!user) return res.status(404).json({ error: "Usuario no encontrado." });
    if ((user.password || '').trim() !== oldPass) {
      return res.status(401).json({ error: "La contraseña actual es incorrecta." });
    }
    if (newPass.length < 4) {
      return res.status(400).json({ error: "La nueva contraseña debe tener al menos 4 caracteres." });
    }

    user.password = newPass;
    user.mustChangePassword = false;
    await user.save();
    res.json({ success: true, message: "Contraseña actualizada correctamente.", user: await serializeUser(user, req.DocumentModel) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/admin/users', async (req, res) => {
  try {
    const u = await req.UserModel.findOne({ username: req.headers['x-user'] });
    if (!u || u.role !== 'admin') return res.status(403).json({ error: "Acceso denegado." });
    res.json(await req.UserModel.find({ role: { $ne: 'admin' } }, { password: 0, recoveryWord: 0 }));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Creación de usuario post-pago por el administrador con envío automático de enlace y credenciales por correo
app.post('/api/admin/create-user', async (req, res) => {
  try {
    const adminUser = await req.UserModel.findOne({ username: req.headers['x-user'] });
    if (!adminUser || adminUser.role !== 'admin') return res.status(403).json({ error: "Acceso denegado." });

    const {
      username,
      fullName,
      email,
      password,
      universityName,
      career,
      careerCode,
      cycleNumber,
      initialTokens,
      platformUrl
    } = req.body;

    const tenantCode = req.headers['x-tenant-id'].trim().toLowerCase();
    const instName = universityName || req.TenantInfo?.companyName || 'Institución Educativa';
    const selectedCareerCode = careerCode || 'PSIC_CLINICA_GALILEO';
    const pensum = await CareerPensumModel.findOne({ careerCode: selectedCareerCode });
    const cycle = pensum?.cycles.find(c => c.cycleNumber === parseInt(cycleNumber || 1)) || pensum?.cycles[0];

    const initialSubjects = cycle ? cycle.courses.map(c => ({
      id: `${c.courseCode}-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      courseCode: c.courseCode,
      name: c.name,
      credits: c.credits,
      schedule: cycle.cycleName,
      domainTags: c.domainTags,
      documents: [], storybooks: [], audiobooks: [], presentations: []
    })) : [{ id: 'subj-init', name: 'Materia 1', schedule: 'Semestre 1', domainTags: [], presentations: [] }];

    const cleanUsername = username.trim().toLowerCase();
    const tempPassword = (password || crypto.randomBytes(4).toString('hex')).trim();
    const studentEmail = (email || `${cleanUsername}@edu.com`).trim().toLowerCase();

    const createdUser = await new req.UserModel({
      username: cleanUsername,
      fullName,
      email: studentEmail,
      password: tempPassword,
      mustChangePassword: true,
      recoveryWord: 'admin123',
      universityName: instName,
      career: pensum ? pensum.careerName : (career || 'Programa Universitario'),
      careerCode: selectedCareerCode,
      citationStyle: pensum ? pensum.citationStyle : 'APA7',
      aiAllowanceUSD: parseFloat(initialTokens) || 5.00,
      subjects: initialSubjects
    }).save();

    const accessLink = platformUrl || process.env.APP_URL || `${req.protocol}://${req.get('host')}`;
    if (email) {
      await transporter.sendMail({
        from: `"AprendePro Académico" <${process.env.SMTP_EMAIL || 'haroldocana@comptech.lat'}>`,
        to: studentEmail,
        subject: `🎓 Tus credenciales de acceso - ${instName}`,
        html: `
          <div style="font-family: Arial, sans-serif; padding: 24px; color: #1e293b; max-width: 600px; margin: auto; border: 1px solid #cbd5e1; border-radius: 12px;">
            <h2 style="color: #0284c7; margin-top: 0;">¡Bienvenido a AprendePro, ${fullName}!</h2>
            <p>Hemos verificado tu inscripción para <strong>${instName}</strong>. A continuación encontrarás el enlace directo y tus credenciales de acceso:</p>
            <div style="background-color: #f1f5f9; padding: 16px; border-radius: 8px; margin: 20px 0;">
              <p style="margin: 6px 0;"><strong>Enlace de Acceso:</strong> <a href="${accessLink}" style="color: #0284c7;">${accessLink}</a></p>
              <p style="margin: 6px 0;"><strong>Código de Institución:</strong> ${tenantCode}</p>
              <p style="margin: 6px 0;"><strong>Usuario:</strong> ${cleanUsername}</p>
              <p style="margin: 6px 0;"><strong>Contraseña Temporal:</strong> ${tempPassword}</p>
            </div>
            <p style="font-size: 13px; color: #475569;">Al ingresar por primera vez, el sistema te solicitará cambiar tu contraseña temporal por una clave personal.</p>
          </div>
        `
      });
    }

    res.json({ success: true, user: await serializeUser(createdUser, req.DocumentModel) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/admin/add-tokens', async (req, res) => {
  try {
    const t = await req.UserModel.findOne({ username: req.body.targetUsername });
    t.aiAllowanceUSD += parseFloat(req.body.amount);
    t.pendingTokenRequest = false;
    await t.save();
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/admin/force-reset', async (req, res) => {
  try {
    const t = await req.UserModel.findOne({ username: req.body.targetUsername });
    t.password = (req.body.newPassword || '').trim();
    t.mustChangePassword = true;
    await t.save();
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

// ================= MATERIAS Y DOCUMENTOS =================
app.post('/api/subjects', async (req, res) => {
  try {
    const user = await req.UserModel.findOne({ username: req.body.username.toLowerCase() });
    const newSubj = {
      id: 'subj-' + Date.now(),
      name: req.body.name,
      schedule: req.body.schedule,
      domainTags: req.body.domainTags || ['CLINICAL_HUMANIST_SIM', 'INTERACTIVE_NEURO_ATLAS', 'SYNAPSE_LAB'],
      documents: [], storybooks: [], audiobooks: [], presentations: []
    };
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
    const { username, subjectId, docTitle, youtubeUrl, isOfficialCurriculum } = req.body;
    const user = await req.UserModel.findOne({ username: username.toLowerCase() });
    const dateStr = new Date().toLocaleDateString('es-GT');

    if (youtubeUrl && youtubeUrl.includes('youtu')) {
      let transcriptText = "";
      try {
        const transcript = await YoutubeTranscript.fetchTranscript(youtubeUrl);
        transcriptText = transcript.map(t => t.text).join(' ');
      } catch (e) {
        const ytRes = await generateWithFallback([`Genera un análisis académico detallado y estructurado para: ${youtubeUrl}`], null);
        transcriptText = ytRes.text;
      }
      await new req.DocumentModel({
        docId: `doc-yt-${Date.now()}`,
        username: user.username,
        subjectId,
        title: docTitle || `Transcripción YouTube`,
        fileName: 'YouTube.txt',
        mimeType: 'text/plain',
        base64Data: Buffer.from(transcriptText, 'utf-8').toString('base64'),
        textContent: transcriptText,
        isOfficialCurriculum: isOfficialCurriculum === 'true' || isOfficialCurriculum === true,
        uploadedAt: dateStr
      }).save();
    }

    if (req.files && req.files.length > 0) {
      for (let file of req.files) {
        if (file.buffer.length > 15 * 1024 * 1024) {
          return res.status(400).json({
            error: `El archivo "${file.originalname}" pesa más de 15MB. Divídelo en partes para subirlo correctamente.`
          });
        }

        await new req.DocumentModel({
          docId: `doc-${Date.now()}-${Math.random()}`,
          username: user.username,
          subjectId,
          title: docTitle ? `${docTitle} (${file.originalname})` : file.originalname,
          fileName: file.originalname,
          mimeType: file.mimetype,
          base64Data: file.buffer.toString("base64"),
          textContent: file.mimetype === 'text/plain' ? file.buffer.toString('utf-8') : 'Documento multimodal indexado.',
          isOfficialCurriculum: isOfficialCurriculum === 'true' || isOfficialCurriculum === true,
          uploadedAt: dateStr
        }).save();
      }
    }
    res.json({ user: await serializeUser(user, req.DocumentModel) });
  } catch (err) { res.status(500).json({ error: "Error al procesar el archivo. Es probable que sea demasiado pesado." }); }
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
    user.markModified('subjects');
    await user.save();
    res.json({ user: await serializeUser(user, req.DocumentModel) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/storybooks/:sbId', async (req, res) => {
  try {
    const user = await req.UserModel.findOne({ username: req.body.username.toLowerCase() });
    const subj = user.subjects.find(s => s.id === req.body.subjectId);
    subj.storybooks = subj.storybooks.filter(sb => sb.id !== req.params.sbId);
    user.markModified('subjects');
    await user.save();
    res.json({ user: await serializeUser(user, req.DocumentModel) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/presentations/:presId', async (req, res) => {
  try {
    const user = await req.UserModel.findOne({ username: req.body.username.toLowerCase() });
    const subj = user.subjects.find(s => s.id === req.body.subjectId);
    subj.presentations = subj.presentations.filter(p => p.id !== req.params.presId);
    user.markModified('subjects');
    await user.save();
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

// ================= RETROALIMENTACIÓN DE CONOCIMIENTO LOCAL (ML/RAG ACUMULATIVO) =================
app.post('/api/knowledge/train-from-documents', async (req, res) => {
  try {
    const user = await req.UserModel.findOne({ username: req.body.username.toLowerCase() });
    await consumeTokens(user, 0.10);

    const { subjectId, documentId, isOfficialCurriculum } = req.body;
    const docs = await getFullDocumentsForSubject(req.DocumentModel, user.username, subjectId, documentId || 'ALL');
    if (!docs.length) return res.status(400).json({ error: "No hay documentos en esta materia para retroalimentar." });

    const schema = {
      type: Type.OBJECT,
      properties: {
        extractedConcepts: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              concept: { type: Type.STRING },
              category: { type: Type.STRING },
              summary: { type: Type.STRING }
            },
            required: ["concept", "category", "summary"]
          }
        },
        extractedNeurochemicalReactions: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              substance: { type: Type.STRING },
              condition: { type: Type.STRING },
              cascadeReaction: { type: Type.STRING },
              neuropsychologicalImpact: { type: Type.STRING }
            },
            required: ["substance", "condition", "cascadeReaction", "neuropsychologicalImpact"]
          }
        }
      },
      required: ["extractedConcepts", "extractedNeurochemicalReactions"]
    };

    const prompt = `
      Analiza los documentos académicos adjuntos (pueden ser PDF, imágenes, textos o transcripciones) y extrae:
      1. Conceptos fundamentales de neurología, neuropsicología, fisiología o psicología clínica humanista-personalista.
      2. Reacciones fisiológicas y neuroquímicas ante variaciones (subida/bajada) de neurotransmisores, hormonas o fármacos.
      Esto retroalimentará la memoria de aprendizaje local de la materia.
    `;

    const contents = [prompt];
    docs.forEach(doc => {
      if (doc.base64Data) contents.push({ inlineData: { data: doc.base64Data, mimeType: doc.mimeType } });
      else if (doc.textContent) contents.push(`Documento (${doc.title}): ${doc.textContent}`);
    });

    const response = await generateWithFallback(contents, schema);
    const parsed = JSON.parse(response.text);

    const docTitles = docs.map(d => d.title).join(', ');
    let kb = await req.KnowledgeModel.findOne({ username: user.username, subjectId });
    if (!kb) {
      kb = new req.KnowledgeModel({
        username: user.username,
        subjectId,
        careerCode: user.careerCode,
        learnedConcepts: [],
        neurochemicalRules: []
      });
    }

    parsed.extractedConcepts.forEach(c => {
      kb.learnedConcepts.push({ ...c, sourceDocTitle: docTitles, isOfficialCurriculum: !!isOfficialCurriculum });
    });
    parsed.extractedNeurochemicalReactions.forEach(r => {
      kb.neurochemicalRules.push({ ...r, sourceDocTitle: docTitles });
    });

    await kb.save();
    await user.save();

    res.json({
      success: true,
      message: `Conocimiento local retroalimentado con ${parsed.extractedConcepts.length} conceptos y ${parsed.extractedNeurochemicalReactions.length} reglas neuroquímicas.`,
      knowledgeBase: kb
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ================= AUDIOLIBROS DE LECTURA CORRIDA Y RESÚMENES REALES =================
app.post('/api/tts-clean', async (req, res) => {
  try {
    const { rawText } = req.body;
    const cleanedText = sanitizeForFluidTTS(rawText);
    res.json({ cleanedText });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

app.post('/api/audiobook-chapters', async (req, res) => {
  try {
    const user = await req.UserModel.findOne({ username: req.body.username.toLowerCase() });
    await consumeTokens(user, 0.25);

    const docs = await getFullDocumentsForSubject(req.DocumentModel, user.username, req.body.subjectId, req.body.documentId);
    if (!docs.length) return res.status(400).json({ error: "Selecciona al menos un documento para generar el audiolibro." });

    const schema = {
      type: Type.OBJECT,
      properties: {
        audiobookTitle: { type: Type.STRING },
        executiveSummary: {
          type: Type.STRING,
          description: "Resumen académico real, profundo y fiel al contenido de todos los documentos seleccionados, escrito en prosa natural."
        },
        keyTakeaways: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description: "Puntos clave esenciales extraídos fielmente de los documentos."
        },
        chapters: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              chapterTitle: { type: Type.STRING },
              chapterSummary: { type: Type.STRING, description: "Síntesis fiel de este capítulo." },
              chapterContent: {
                type: Type.STRING,
                description: "Narración completa, extensa y fluida del contenido real del documento para ser escuchada como audiolibro continuo. NO incluyas comas, punto y coma, viñetas, asteriscos, corchetes, paréntesis ni caracteres especiales para que la lectura de voz sea completamente corrida y natural."
              }
            },
            required: ["chapterTitle", "chapterSummary", "chapterContent"]
          }
        }
      },
      required: ["audiobookTitle", "executiveSummary", "keyTakeaways", "chapters"]
    };

    const prompt = `
      Eres un narrador y sintetizador académico universitario de élite.
      Procesa TODOS los documentos adjuntos (PDFs, apuntes, presentaciones, transcripciones o imágenes escaneadas) y genera un Audiolibro de Estudio Completo con Resúmenes Reales basados 100% en el material subido (sin inventar ni omitir temas).
      
      REGLAS ESTRICTAS DE LOCUCIÓN CORRIDA PARA TTS:
      1. Redacta 'chapterContent' en prosa continua, fluida y natural para ser leída en voz alta sin interrupciones robóticas.
      2. PROHIBIDO usar comas, punto y coma, paréntesis, corchetes, viñetas, símbolos matemáticos, URLs o citas entre paréntesis dentro de 'chapterContent'. Usa conectores naturales del lenguaje hablado en español para unir las ideas de corrido.
      3. Asegúrate de que 'executiveSummary' y 'chapterSummary' sean resúmenes académicos fieles y rigurosos del contenido real de los archivos.
    `;

    const contents = [prompt];
    docs.forEach(doc => {
      if (doc.base64Data) contents.push({ inlineData: { data: doc.base64Data, mimeType: doc.mimeType } });
      else if (doc.textContent) contents.push(`Documento (${doc.title}): ${doc.textContent}`);
    });

    const response = await generateWithFallback(contents, schema);
    const parsed = JSON.parse(response.text);

    const sanitizedAudiobook = {
      id: 'ab-' + Date.now(),
      createdAt: new Date().toLocaleString('es-GT'),
      audiobookTitle: parsed.audiobookTitle,
      bookSummary: sanitizeForFluidTTS(parsed.executiveSummary),
      executiveSummaryReadable: parsed.executiveSummary,
      keyTakeaways: parsed.keyTakeaways,
      chapters: parsed.chapters.map(ch => ({
        chapterTitle: sanitizeForFluidTTS(ch.chapterTitle),
        chapterSummary: ch.chapterSummary,
        chapterContent: sanitizeForFluidTTS(ch.chapterContent)
      }))
    };

    const subj = user.subjects.find(s => s.id === req.body.subjectId);
    subj.audiobooks = subj.audiobooks || [];
    subj.audiobooks.push(sanitizedAudiobook);
    user.markModified('subjects');
    await user.save();

    res.json({ audiobook: sanitizedAudiobook, user: await serializeUser(user, req.DocumentModel) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ================= MÓDULOS INTERACTIVOS TIPO ENCARTA (OPTIMIZADOS CON GEMINI 3 FLASH) =================
app.post('/api/encarta/neuro-cascade-lab', async (req, res) => {
  try {
    const user = await req.UserModel.findOne({ username: req.body.username.toLowerCase() });
    await consumeTokens(user, 0.15);

    const { substanceLevels, triggerEvent, subjectId } = req.body;
    const kb = await req.KnowledgeModel.findOne({ username: user.username, subjectId }).lean();
    const learnedContext = kb && kb.neurochemicalRules.length
      ? JSON.stringify(kb.neurochemicalRules.slice(-10))
      : "Fisiología sináptica y neuroquímica estándar.";

    const schema = {
      type: Type.OBJECT,
      properties: {
        interactiveReactionSvg: {
          type: Type.STRING,
          description: "SVG compacto (<svg viewBox='0 0 600 320'>) mostrando terminal presináptica, vesículas de neurotransmisores, hendidura sináptica y receptores postsinápticos."
        },
        physiologicalCascade: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              stageNumber: { type: Type.INTEGER },
              timeWindow: { type: Type.STRING },
              biologicalReaction: { type: Type.STRING },
              affectedBrainCircuits: { type: Type.ARRAY, items: { type: Type.STRING } }
            }
          }
        },
        neuropsychologicalEffects: {
          type: Type.OBJECT,
          properties: {
            cognitiveImpact: { type: Type.STRING },
            emotionalAndBehavioralImpact: { type: Type.STRING },
            somaticSymptoms: { type: Type.ARRAY, items: { type: Type.STRING } }
          }
        },
        clinicalSyndromeAlert: {
          type: Type.OBJECT,
          properties: {
            syndromeName: { type: Type.STRING },
            riskLevel: { type: Type.STRING },
            differentialDiagnosis: { type: Type.ARRAY, items: { type: Type.STRING } }
          }
        },
        humanistAndTherapeuticApproach: { type: Type.STRING }
      },
      required: ["interactiveReactionSvg", "physiologicalCascade", "neuropsychologicalEffects", "clinicalSyndromeAlert", "humanistAndTherapeuticApproach"]
    };

    const prompt = `
      Simulador Interactivo de Neuropsicología y Psicofisiología tipo Encarta (ICF Universidad Galileo - enfoque humanista).
      Niveles configurados: ${JSON.stringify(substanceLevels)}.
      Desencadenante: "${triggerEvent || 'Variación endógena'}".
      Reglas aprendidas del curso: ${learnedContext}.
      Explica la cascada sináptica, circuitos afectados, impacto neuropsicológico e integración humanista-terapéutica de forma concisa y científica.
    `;

    const response = await generateWithFallback([prompt], schema);
    await user.save();
    res.json(JSON.parse(response.text));
  } catch (err) {
    console.error("Error Cascada Sináptica:", err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/encarta/neuropsychology-atlas', async (req, res) => {
  try {
    const user = await req.UserModel.findOne({ username: req.body.username.toLowerCase() });
    await consumeTokens(user, 0.15);

    const { topic, viewMode, subjectId } = req.body;
    const kb = await req.KnowledgeModel.findOne({ username: user.username, subjectId }).lean();
    const learnedContext = kb && kb.learnedConcepts.length
      ? JSON.stringify(kb.learnedConcepts.slice(-10))
      : "Conocimiento universitario estándar de Neurología y Neuropsicología.";

    const schema = {
      type: Type.OBJECT,
      properties: {
        articleTitle: { type: Type.STRING },
        interactiveBrainSvg: {
          type: Type.STRING,
          description: "SVG compacto (<svg viewBox='0 0 600 360'>) con 4 regiones cerebrales estilizadas (paths/circles con colores distintos) y atributos data-area-id='area_1', 'area_2', 'area_3', 'area_4' más etiquetas <text>."
        },
        multimediaCards: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              areaId: { type: Type.STRING },
              title: { type: Type.STRING },
              neuroanatomy: { type: Type.STRING },
              interAreaCommunication: { type: Type.STRING },
              dopamineAndSynapseFunction: { type: Type.STRING },
              neuropsychologyFunction: { type: Type.STRING },
              lesionConsequences: { type: Type.STRING },
              evaluationTests: { type: Type.ARRAY, items: { type: Type.STRING } },
              relatedTopics: { type: Type.ARRAY, items: { type: Type.STRING } }
            },
            required: ["areaId", "title", "neuroanatomy", "interAreaCommunication", "dopamineAndSynapseFunction", "neuropsychologyFunction", "lesionConsequences", "evaluationTests", "relatedTopics"]
          }
        },
        selfAssessmentChallenge: {
          type: Type.OBJECT,
          properties: {
            clinicalCaseQuestion: { type: Type.STRING },
            options: { type: Type.ARRAY, items: { type: Type.STRING } },
            correctIndex: { type: Type.INTEGER },
            detailedExplanation: { type: Type.STRING }
          },
          required: ["clinicalCaseQuestion", "options", "correctIndex", "detailedExplanation"]
        }
      },
      required: ["articleTitle", "interactiveBrainSvg", "multimediaCards", "selfAssessmentChallenge"]
    };

    const prompt = `
      Crea una ficha enciclopédica interactiva estilo Encarta sobre Neurología y Neuropsicología (Universidad Galileo ICF, enfoque humanista-personalista).
      Tema: "${topic || 'Corteza Prefrontal, Sistema Límbico, Vías Dopaminérgicas y Funciones Ejecutivas'}".
      Modo: "${viewMode || 'EXPLORE_REGION'}".
      Contexto aprendido del curso: ${learnedContext}.
      Genera exactamente 4 estructuras en multimediaCards con areaId 'area_1', 'area_2', 'area_3', 'area_4' que coincidan con los atributos data-area-id del SVG. Sé conciso, preciso y académico.
    `;

    const response = await generateWithFallback([prompt], schema);
    await user.save();
    res.json(JSON.parse(response.text));
  } catch (err) {
    console.error("Error Atlas Cerebral:", err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/interactive/human-body-explorer', async (req, res) => {
  try {
    const user = await req.UserModel.findOne({ username: req.body.username.toLowerCase() });
    await consumeTokens(user, 0.15);

    const { bodySystem, specificOrgan, clinicalCorrelation, courseName } = req.body;
    const schema = {
      type: Type.OBJECT,
      properties: {
        interactiveBodySvg: {
          type: Type.STRING,
          description: "SVG anatómico compacto (<svg viewBox='0 0 500 600'>) del sistema del cuerpo humano con 4 órganos marcados con data-organ-id='org_1', 'org_2', 'org_3', 'org_4'."
        },
        anatomicalStructures: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              organId: { type: Type.STRING },
              organName: { type: Type.STRING },
              macroAndMicroAnatomy: { type: Type.STRING },
              normalPhysiology: { type: Type.STRING },
              pathophysiology: { type: Type.STRING },
              psychosomaticOrSystemicLink: { type: Type.STRING }
            }
          }
        }
      },
      required: ["interactiveBodySvg", "anatomicalStructures"]
    };

    const prompt = `
      Actúa como Catedrático de Anatomía y Fisiología Médica.
      Curso: "${courseName || 'Anatomía y Fisiología Humana'}".
      Sistema: "${bodySystem || 'Sistema Nervioso Autónomo, Endocrino y Cardiovascular'}".
      Órgano: "${specificOrgan || 'Vista integral del sistema'}".
      Correlación: "${clinicalCorrelation || 'Fisiología normal y fisiopatología'}".
      Genera el diagrama SVG interactivo con 4 estructuras clave y sus fichas anatómicas y fisiológicas concisas.
    `;

    const response = await generateWithFallback([prompt], schema);
    await user.save();
    res.json(JSON.parse(response.text));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/agents/psychometrics-lab', async (req, res) => {
  try {
    const user = await req.UserModel.findOne({ username: req.body.username.toLowerCase() });
    await consumeTokens(user, 0.15);

    const { testName, rawScores, populationMean, populationSD, clinicalContext } = req.body;
    const schema = {
      type: Type.OBJECT,
      properties: {
        calculations: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              subscale: { type: Type.STRING },
              rawScore: { type: Type.NUMBER },
              zScore: { type: Type.NUMBER },
              tScore: { type: Type.NUMBER },
              percentile: { type: Type.NUMBER },
              clinicalRange: { type: Type.STRING }
            }
          }
        },
        integratedClinicalReport: { type: Type.STRING },
        statisticalRecommendations: { type: Type.ARRAY, items: { type: Type.STRING } }
      },
      required: ["calculations", "integratedClinicalReport"]
    };

    const prompt = `
      Especialista en Psicometría y Estadística Aplicada (Universidad Galileo).
      Prueba: ${testName}. Puntuaciones directas: ${JSON.stringify(rawScores)}.
      Media: ${populationMean || 'Estándar'}, DE: ${populationSD || 'Estándar'}. Contexto: ${clinicalContext}.
      Calcula puntuaciones Z, T (50 + 10Z), percentiles y redacta el informe psicométrico técnico.
    `;

    const response = await generateWithFallback([prompt], schema);
    await user.save();
    res.json(JSON.parse(response.text));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ================= ENDPOINTS BASE EXISTENTES (TUTOR, APA/VANCOUVER, TESIS, CLÍNICA, MAPAS) =================
app.post('/api/tutor-rag', async (req, res) => {
  try {
    const user = await req.UserModel.findOne({ username: req.body.username.toLowerCase() });
    await consumeTokens(user, 0.05);
    const docs = await getFullDocumentsForSubject(req.DocumentModel, user.username, req.body.subjectId, req.body.documentId);
    const prompt = `Actúa como Tutor RAG universitario (${user.career}). REGLA ANTI-ALUCINACIONES: Responde basándote ÚNICAMENTE en los documentos adjuntos. Cita la sección/párrafo/página al final. Duda: "${req.body.query}"`;
    const contents = [prompt];
    docs.forEach(doc => {
      if (doc.base64Data) contents.push({ inlineData: { data: doc.base64Data, mimeType: doc.mimeType } });
    });
    const response = await generateWithFallback(contents, null);
    await user.save();
    res.json({ explanation: response.text });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/generate-apa-advanced', async (req, res) => {
  try {
    const user = await req.UserModel.findOne({ username: req.body.username.toLowerCase() });
    await consumeTokens(user, 0.35);
    const docs = await getFullDocumentsForSubject(req.DocumentModel, user.username, req.body.subjectId, 'ALL');
    const isVancouver = user.citationStyle === 'VANCOUVER';
    const styleInstructions = isVancouver
      ? `REGLAS VANCOUVER (Medicina): Citas numéricas correlativas entre paréntesis (1), (2). Referencias bibliográficas numeradas al final en formato biomédico Vancouver.`
      : `REGLAS APA 7ma Edición (Psicología ICF): Citas intratextuales (Autor, año). Al menos una TABLA en HTML con <table style="border-collapse: collapse; width: 100%; border-top: 2px solid black; border-bottom: 2px solid black;"> y <td style="border-bottom: 1px solid black; padding: 8px;"> (sin bordes verticales). Referencias alfabéticas al final.`;

    const prompt = `Ensayo científico sobre: "${req.body.topic}". ${styleInstructions} Devuelve HTML limpio (<h1>, <p>).`;
    const contents = [prompt];
    docs.forEach(doc => {
      if (doc.base64Data) contents.push({ inlineData: { data: doc.base64Data, mimeType: doc.mimeType } });
    });
    const response = await generateWithFallback(contents, null);
    await user.save();
    res.json({ apaDocument: response.text });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/research/outline', async (req, res) => {
  try {
    const user = await req.UserModel.findOne({ username: req.body.username.toLowerCase() });
    await consumeTokens(user, 0.10);
    const schema = { type: Type.OBJECT, properties: { chapters: { type: Type.ARRAY, items: { type: Type.STRING } } }, required: ["chapters"] };
    const response = await generateWithFallback([`Índice académico para investigar: "${req.body.topic}" (Carrera: ${user.career}). Devuelve JSON de capítulos.`], schema);
    await user.save();
    res.json({ outline: JSON.parse(response.text).chapters });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/research/chapter', async (req, res) => {
  try {
    const user = await req.UserModel.findOne({ username: req.body.username.toLowerCase() });
    await consumeTokens(user, 0.25);
    const { topic, chapterTitle, previousChapterSummary } = req.body;
    let prompt = `Redacta el capítulo "${chapterTitle}" de la investigación "${topic}" (Carrera: ${user.career}). FILTRO ANTI-PLAGIO ACTIVO: Estilo original, 0% similitud Turnitin. Devuelve HTML.`;
    if (previousChapterSummary) prompt += `\nResumen anterior: "${previousChapterSummary}".`;
    const response = await generateWithFallback([prompt], null);
    await user.save();
    res.json({ chapterContent: response.text });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/clinical-simulator', async (req, res) => {
  try {
    const user = await req.UserModel.findOne({ username: req.body.username.toLowerCase() });
    await consumeTokens(user, 0.05);
    const docs = await getFullDocumentsForSubject(req.DocumentModel, user.username, req.body.subjectId, req.body.documentId);
    const isMedicine = user.careerCode === 'MED_CIRUGIA';
    const rolePrompt = isMedicine
      ? `Eres un paciente en consulta médica universitaria. Presenta síntomas coherentes con los documentos sin decir el diagnóstico.`
      : `Eres un paciente en una clínica psicológica bajo el enfoque humanista-personalista y logoterapéutico (Universidad Galileo ICF). Asume un caso basado en los documentos (sin revelar el diagnóstico), expresando tu historia biográfica, emociones y búsqueda de sentido.`;

    const prompt = `${rolePrompt} Historial: ${req.body.history}. Estudiante: "${req.body.message}". Responde de forma realista en máximo 3 oraciones.`;
    const contents = [prompt];
    if (req.body.history === '') {
      docs.forEach(doc => {
        if (doc.base64Data) contents.push({ inlineData: { data: doc.base64Data, mimeType: doc.mimeType } });
      });
    }
    const response = await generateWithFallback(contents, null);
    await user.save();
    res.json({ reply: response.text });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/generate-presentation', async (req, res) => {
  try {
    const user = await req.UserModel.findOne({ username: req.body.username.toLowerCase() });
    await consumeTokens(user, 0.25);
    const docs = await getFullDocumentsForSubject(req.DocumentModel, user.username, req.body.subjectId, req.body.documentId);
    const contents = [`Diseña presentación interactiva universitaria alternando diapositivas 'summary' y 'trivia'.`];
    docs.forEach(doc => {
      if (doc.base64Data) contents.push({ inlineData: { data: doc.base64Data, mimeType: doc.mimeType } });
    });
    const schema = {
      type: Type.OBJECT,
      properties: {
        presentationTitle: { type: Type.STRING },
        slides: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              type: { type: Type.STRING },
              title: { type: Type.STRING },
              content: { type: Type.STRING },
              options: { type: Type.ARRAY, items: { type: Type.STRING } },
              correctIndex: { type: Type.INTEGER },
              explanation: { type: Type.STRING }
            },
            required: ["type", "title", "content"]
          }
        }
      },
      required: ["presentationTitle", "slides"]
    };
    const response = await generateWithFallback(contents, schema);
    const newPresentation = { id: 'pres-' + Date.now(), createdAt: new Date().toLocaleString('es-GT'), ...JSON.parse(response.text) };
    const subj = user.subjects.find(s => s.id === req.body.subjectId);
    subj.presentations = subj.presentations || [];
    subj.presentations.push(newPresentation);
    user.markModified('subjects');
    await user.save();
    res.json({ presentation: newPresentation, user: await serializeUser(user, req.DocumentModel) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/philosophy-realism', async (req, res) => {
  try {
    const user = await req.UserModel.findOne({ username: req.body.username.toLowerCase() });
    await consumeTokens(user, 0.10);
    const response = await generateWithFallback([
      `Analiza bajo la perspectiva Antropológica Personalista, Logoterapéutica y Aristotélico-Tomista (ICF Universidad Galileo): "${req.body.query}". Devuelve HTML.`
    ], null);
    await user.save();
    res.json({ answer: response.text });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/generate-evolutionary-storybook', async (req, res) => {
  try {
    const user = await req.UserModel.findOne({ username: req.body.username.toLowerCase() });
    await consumeTokens(user, 0.20);
    const docs = await getFullDocumentsForSubject(req.DocumentModel, user.username, req.body.subjectId, req.body.documentId);
    const contents = [`Transforma textos académicos en narrativa cronológica estilo novela gráfica.`];
    docs.forEach(doc => {
      if (doc.base64Data) contents.push({ inlineData: { data: doc.base64Data, mimeType: doc.mimeType } });
    });
    const schema = {
      type: Type.OBJECT,
      properties: {
        title: { type: Type.STRING },
        summary: { type: Type.STRING },
        scenes: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              sceneNumber: { type: Type.INTEGER },
              characterName: { type: Type.STRING },
              academicConcept: { type: Type.STRING },
              storyDialogue: { type: Type.STRING }
            },
            required: ["sceneNumber", "characterName", "academicConcept", "storyDialogue"]
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
      required: ["title", "summary", "scenes", "timeline", "quiz"]
    };
    const response = await generateWithFallback(contents, schema);
    const newStorybook = { id: 'sb-' + Date.now(), ...JSON.parse(response.text) };
    const subj = user.subjects.find(s => s.id === req.body.subjectId);
    subj.storybooks = subj.storybooks || [];
    subj.storybooks.push(newStorybook);
    user.markModified('subjects');
    await user.save();
    res.json({ storybook: newStorybook, user: await serializeUser(user, req.DocumentModel) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/generate-glossary', async (req, res) => {
  try {
    const user = await req.UserModel.findOne({ username: req.body.username.toLowerCase() });
    await consumeTokens(user, 0.10);
    const docs = await getFullDocumentsForSubject(req.DocumentModel, user.username, req.body.subjectId, req.body.documentId);
    const contents = [`Genera glosario técnico universitario.`];
    docs.forEach(doc => {
      if (doc.base64Data) contents.push({ inlineData: { data: doc.base64Data, mimeType: doc.mimeType } });
    });
    const schema = {
      type: Type.OBJECT,
      properties: {
        glossaryTitle: { type: Type.STRING },
        terms: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              term: { type: Type.STRING },
              definition: { type: Type.STRING }
            },
            required: ["term", "definition"]
          }
        }
      },
      required: ["glossaryTitle", "terms"]
    };
    const response = await generateWithFallback(contents, schema);
    await user.save();
    res.json({ glossary: JSON.parse(response.text) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/generate-mindmap', async (req, res) => {
  try {
    const user = await req.UserModel.findOne({ username: req.body.username.toLowerCase() });
    await consumeTokens(user, 0.15);
    const docs = await getFullDocumentsForSubject(req.DocumentModel, user.username, req.body.subjectId, req.body.documentId);
    const contents = [`Devuelve ÚNICAMENTE código Mermaid.js (graph TD) limpio. Sin backticks.`];
    docs.forEach(doc => {
      if (doc.base64Data) contents.push({ inlineData: { data: doc.base64Data, mimeType: doc.mimeType } });
    });
    const response = await generateWithFallback(contents, null);
    await user.save();
    res.json({ mermaidCode: response.text.replace(/```mermaid/g, '').replace(/```/g, '').trim() });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 AprendePro activo en puerto ${PORT}`));
