import express from 'express';
import multer from 'multer';
import { GoogleGenAI, Type } from '@google/genai';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json({ limit: '25mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const upload = multer({ storage: multer.memoryStorage() });
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Tus 6 materias oficiales de Psicología (con Biblioteca de Documentos, Lista de Storybooks y Exámenes)
const getInitialPsychologySubjects = () => [
  { id: "lpc-ep2", name: "Escuelas Psicológicas II", section: "Sección A", schedule: "Semestre 2, 2026", defaultHero: "HE_MAN", documents: [], storybooks: [], exams: [] },
  { id: "lpc-pe2", name: "Psicología Evolutiva II", section: "Sección A", schedule: "Semestre 2, 2026", defaultHero: "CANDY_CANDY", documents: [], storybooks: [], exams: [] },
  { id: "lpc-ti1", name: "Técnicas de Investigación", section: "Sección A", schedule: "Sáb 17 Oct - 08:00 AM", defaultHero: "GI_JOE", documents: [], storybooks: [], exams: [] },
  { id: "lpc-fil2", name: "Filosofía II", section: "Sección A", schedule: "Semestre 2, 2026", defaultHero: "HE_MAN", documents: [], storybooks: [], exams: [] },
  { id: "lpc-soc", name: "Sociología", section: "Sección A", schedule: "Sáb 17 Oct - 10:30 AM", defaultHero: "OSITOS_CARINOSITOS", documents: [], storybooks: [], exams: [] },
  { id: "lpc-nc1", name: "Neurociencia Cognitiva", section: "Sección A", schedule: "Semestre 2, 2026", defaultHero: "TRANSFORMERS", documents: [], storybooks: [], exams: [] }
];

const usersDB = {
  "haroldocana": {
    username: "haroldocana",
    fullName: "Harold Benjamín Ocaña Guillén",
    email: "haroldocana@psicologia.edu",
    password: "admin123",
    career: "Licenciatura en Psicología Clínica (LPC)",
    subscriptionActive: true,
    subscriptionBaseUSD: 6.00,
    aiConsumptionUSD: 0.00,
    totalTokensUsed: 0,
    storybooksCreated: 0,
    examsCreated: 0,
    subjects: getInitialPsychologySubjects()
  }
};

function findUser(identifier) {
  const cleanId = (identifier || '').trim().toLowerCase();
  return Object.values(usersDB).find(
    u => u.username.toLowerCase() === cleanId || u.email.toLowerCase() === cleanId
  );
}

// Sanitizar usuario antes de enviar al frontend (sin enviar los buffers pesados de PDFs)
function serializeUser(user) {
  const { password: _, ...rest } = user;
  return {
    ...rest,
    subjects: user.subjects.map(s => ({
      ...s,
      documents: s.documents.map(d => ({
        id: d.id,
        title: d.title,
        fileName: d.fileName,
        mimeType: d.mimeType,
        uploadedAt: d.uploadedAt,
        hasText: !!d.textContent
      }))
    }))
  };
}

// 1. REGISTRO DE USUARIO
app.post('/api/auth/register', (req, res) => {
  const { fullName, username, email, password, career, loadPsychologyTemplate } = req.body;
  const cleanUsername = (username || '').trim().toLowerCase();

  if (!cleanUsername || !password || !fullName) {
    return res.status(400).json({ error: "Todos los campos son obligatorios." });
  }
  if (findUser(cleanUsername) || findUser(email)) {
    return res.status(400).json({ error: "El usuario o correo ya está registrado." });
  }

  usersDB[cleanUsername] = {
    username: cleanUsername,
    fullName,
    email: (email || `${cleanUsername}@psicologia.edu`).trim().toLowerCase(),
    password,
    career: career || "Licenciatura en Psicología Clínica",
    subscriptionActive: true,
    subscriptionBaseUSD: 6.00,
    aiConsumptionUSD: 0.00,
    totalTokensUsed: 0,
    storybooksCreated: 0,
    examsCreated: 0,
    subjects: loadPsychologyTemplate !== false ? getInitialPsychologySubjects() : []
  };

  res.json({ user: serializeUser(usersDB[cleanUsername]) });
});

// 2. LOGIN
app.post('/api/auth/login', (req, res) => {
  const { identifier, password } = req.body;
  const foundUser = findUser(identifier);
  if (!foundUser || foundUser.password !== password) {
    return res.status(401).json({ error: "Usuario o contraseña incorrectos." });
  }
  res.json({ user: serializeUser(foundUser) });
});

// 3. CREAR NUEVA MATERIA
app.post('/api/subjects', (req, res) => {
  const { username, name, section, schedule, defaultHero } = req.body;
  const user = findUser(username);
  if (!user) return res.status(401).json({ error: "Sesión no válida" });

  const newSubject = {
    id: 'subj-' + Date.now(),
    name,
    section: section || 'Sección A',
    schedule: schedule || 'Semestre 2, 2026',
    defaultHero: defaultHero || 'CANDY_CANDY',
    documents: [],
    storybooks: [],
    exams: []
  };
  user.subjects.push(newSubject);
  res.json({ user: serializeUser(user), newSubjectId: newSubject.id });
});

// 4. SUBIR DOCUMENTO A LA BIBLIOTECA DE UNA MATERIA (Para reutilizarlo cuantas veces quieras)
app.post('/api/documents', upload.single('document'), (req, res) => {
  const { username, subjectId, docTitle, customText } = req.body;
  const user = findUser(username);
  if (!user) return res.status(401).json({ error: "Usuario no autenticado" });

  const subject = user.subjects.find(s => s.id === subjectId);
  if (!subject) return res.status(404).json({ error: "Materia no encontrada" });

  if (!req.file && !customText) {
    return res.status(400).json({ error: "Debes adjuntar un PDF o pegar el contenido del tema." });
  }

  const newDoc = {
    id: 'doc-' + Date.now(),
    title: docTitle || (req.file ? req.file.originalname : 'Apuntes de Clase'),
    fileName: req.file ? req.file.originalname : 'Apuntes_Texto.txt',
    mimeType: req.file ? req.file.mimetype : 'text/plain',
    base64Data: req.file ? req.file.buffer.toString("base64") : null,
    textContent: customText || '',
    uploadedAt: new Date().toLocaleDateString('es-GT')
  };

  subject.documents.push(newDoc);
  res.json({ user: serializeUser(user), documentId: newDoc.id });
});

// 5. GENERAR STORYBOOK DESDE LOS DOCUMENTOS DE LA MATERIA
app.post('/api/generate-storybook', async (req, res) => {
  try {
    const { username, subjectId, documentId, focusTopic, universe } = req.body;
    const user = findUser(username);
    if (!user) return res.status(401).json({ error: "Usuario no autenticado" });

    const subject = user.subjects.find(s => s.id === subjectId);
    if (!subject) return res.status(404).json({ error: "Materia no encontrada" });

    const contents = [];
    let selectedDocs = [];

    if (documentId === 'ALL') {
      selectedDocs = subject.documents;
    } else {
      const foundDoc = subject.documents.find(d => d.id === documentId);
      if (foundDoc) selectedDocs.push(foundDoc);
    }

    for (const doc of selectedDocs) {
      if (doc.base64Data) {
        contents.push({
          inlineData: { data: doc.base64Data, mimeType: doc.mimeType }
        });
      }
      if (doc.textContent) {
        contents.push(`Documento (${doc.title}):\n${doc.textContent}`);
      }
    }

    const prompt = `
      Eres el Motor Pedagógico Retro-Manga del Centro de Estudio Universitario de ${user.fullName}.
      Carrera: "${user.career}". Materia: "${subject.name}".
      Enfoque o tema solicitado: "${focusTopic || 'Explicación completa del documento'}".
      Universo elegido: "${universe}".

      ESTILOS DE ENSEÑANZA:
      - CANDY_CANDY: Manga shōjo clásico dramático y empático (casos clínicos, apego, desarrollo humano).
      - TRANSFORMERS: Cybertron G1 (Optimus Prime, Perceptor, Ratchet). Neurociencia, procesos cognitivos y sistemas como circuitos y matrices.
      - GI_JOE: Comando táctico años 80 (Duke, Scarlett). Metodologías de investigación y protocolos como misiones contra trampas de Cobra ("¡Y saber es la mitad de la batalla!").
      - HE_MAN: Épico de Eternia (He-Man, Sorceress vs Skeletor). Filosofía, historia y escuelas psicológicas como secretos del Castillo Grayskull.
      - OSITOS_CARINOSITOS: Empático y comunitario (Quiéreme Mucho). Sociología, dinámica de grupos y regulación emocional con el Rayo Cariñosito.

      OBJETIVO PEDAGÓGICO:
      Crea un Storybook interactivo de 5 escenas profundas que expliquen el documento paso a paso.
      Por cada escena incluye una MNEMOTECNIA o TRUCO DE MEMORIA para que el estudiante nunca olvide el concepto en el examen.
      Incluye también un mini-quiz rápido de 3 preguntas de verificación de lectura.
    `;

    contents.push(prompt);
    const modelName = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

    const response = await ai.models.generateContent({
      model: modelName,
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
          required: ["title", "universe", "summary", "scenes", "quiz"]
        }
      }
    });

    const sbData = JSON.parse(response.text);
    const totalTokens = (response.usageMetadata?.promptTokenCount || 1500) + (response.usageMetadata?.candidatesTokenCount || 1500);
    const chargeUSD = 0.25;

    user.aiConsumptionUSD += chargeUSD;
    user.totalTokensUsed += totalTokens;
    user.storybooksCreated += 1;

    const newStorybook = {
      id: 'sb-' + Date.now(),
      createdAt: new Date().toLocaleString('es-GT'),
      sourceDocTitle: selectedDocs.map(d => d.title).join(', ') || focusTopic,
      tokensUsed: totalTokens,
      billedUSD: chargeUSD,
      ...sbData
    };

    subject.storybooks.push(newStorybook);
    res.json({ storybook: newStorybook, user: serializeUser(user) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// 6. GENERAR SIMULADOR DE EXAMEN ACUMULATIVO DE LA MATERIA (Parcial / Final)
app.post('/api/generate-exam', async (req, res) => {
  try {
    const { username, subjectId, documentId, difficulty, universe } = req.body;
    const user = findUser(username);
    if (!user) return res.status(401).json({ error: "Usuario no autenticado" });

    const subject = user.subjects.find(s => s.id === subjectId);
    if (!subject) return res.status(404).json({ error: "Materia no encontrada" });

    const contents = [];
    const docsToUse = documentId === 'ALL'
      ? subject.documents
      : subject.documents.filter(d => d.id === documentId);

    for (const doc of docsToUse) {
      if (doc.base64Data) {
        contents.push({ inlineData: { data: doc.base64Data, mimeType: doc.mimeType } });
      }
      if (doc.textContent) {
        contents.push(`Documento (${doc.title}):\n${doc.textContent}`);
      }
    }

    const prompt = `
      Actúa como Evaluador Académico Universitario de la carrera "${user.career}" para la materia "${subject.name}".
      Estilo de retroalimentación: Universo "${universe}".
      Nivel de dificultad: "${difficulty || 'Casos Clínicos y Teoría Universitaria'}".

      Genera un Examen Completo de Entrenamiento de 5 preguntas rigurosas basadas en los documentos de la materia.
      Incluye preguntas teóricas y casos prácticos aplicados.
    `;

    contents.push(prompt);
    const modelName = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

    const response = await ai.models.generateContent({
      model: modelName,
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
    const totalTokens = (response.usageMetadata?.promptTokenCount || 1200) + (response.usageMetadata?.candidatesTokenCount || 1000);
    const chargeUSD = 0.15; // Examen cuesta $0.15 USD

    user.aiConsumptionUSD += chargeUSD;
    user.totalTokensUsed += totalTokens;
    user.examsCreated += 1;

    const newExam = {
      id: 'ex-' + Date.now(),
      createdAt: new Date().toLocaleString('es-GT'),
      tokensUsed: totalTokens,
      ...examData
    };

    subject.exams.push(newExam);
    res.json({ exam: newExam, user: serializeUser(user) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Centro de Estudio activo en puerto ${PORT}`));
