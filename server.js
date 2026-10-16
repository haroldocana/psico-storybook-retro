// server.js
import express from 'express';
import multer from 'multer';
import { GoogleGenAI, Type } from '@google/genai';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Configuración para recibir los PDFs de las clases en memoria
const upload = multer({ storage: multer.memoryStorage() });

// Conexión con Google AI Studio (Usa la variable configurada en Render)
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Base de datos inicial en memoria (Lista para conectar tu MongoDB URI en Render)
let usersDB = {
  "estudiante@psicologia.edu": {
    name: "Estudiante LPC",
    subscriptionBaseUSD: 6.00,
    aiConsumptionUSD: 0.00,
    storybooksCreated: 0
  }
};

// Tus 6 materias iniciales de Psicología + Opción de agregar todas las que quieras
let subjectsDB = [
  { id: "lpc-ep2", name: "Escuelas Psicológicas II", section: "Sección A", schedule: "Asincrónico", defaultHero: "HE_MAN", storybooks: [] },
  { id: "lpc-pe2", name: "Psicología Evolutiva II", section: "Sección A", schedule: "Asincrónico", defaultHero: "CANDY_CANDY", storybooks: [] },
  { id: "lpc-ti1", name: "Técnicas de Investigación", section: "Sección A", schedule: "Sáb 17 Oct - 08:00 AM", defaultHero: "GI_JOE", storybooks: [] },
  { id: "lpc-fil2", name: "Filosofía II", section: "Sección A", schedule: "Asincrónico", defaultHero: "HE_MAN", storybooks: [] },
  { id: "lpc-soc", name: "Sociología", section: "Sección A", schedule: "Sáb 17 Oct - 10:30 AM", defaultHero: "OSITOS_CARINOSITOS", storybooks: [] },
  { id: "lpc-nc1", name: "Neurociencia Cognitiva", section: "Sección A", schedule: "Asincrónico", defaultHero: "TRANSFORMERS", storybooks: [] }
];

// 1. Obtener catálogo de materias y estado de cuenta ($6.00 + consumo IA)
app.get('/api/dashboard', (req, res) => {
  res.json({
    user: usersDB["estudiante@psicologia.edu"],
    subjects: subjectsDB
  });
});

// 2. Crear una NUEVA materia dinámicamente
app.post('/api/subjects', (req, res) => {
  const { name, section, schedule, defaultHero } = req.body;
  const newSubject = {
    id: 'subj-' + Date.now(),
    name,
    section: section || 'Sección A',
    schedule: schedule || 'Por definir',
    defaultHero: defaultHero || 'CANDY_CANDY',
    storybooks: []
  };
  subjectsDB.push(newSubject);
  res.json(newSubject);
});

// 3. Subir PDF o Texto de la clase y Generar Storybook + Quiz con Google AI Studio
app.post('/api/generate-storybook', upload.single('document'), async (req, res) => {
  try {
    const { subjectId, topicTitle, universe, customText } = req.body;
    const subject = subjectsDB.find(s => s.id === subjectId);
    if (!subject) return res.status(404).json({ error: 'Materia no encontrada' });

    const contents = [];

    // Si el estudiante subió un archivo PDF de la universidad, lo enviamos directo a Gemini
    if (req.file) {
      contents.push({
        inlineData: {
          data: req.file.buffer.toString("base64"),
          mimeType: req.file.mimetype
        }
      });
    }

    const systemPrompt = `
      Eres el Motor Pedagógico Retro-Manga para la carrera de Psicología Clínica.
      Materia actual: "${subject.name}". Tema: "${topicTitle}".
      Universo elegido por el estudiante: "${universe}".

      PERSONALIDADES DISPONIBLES:
      - CANDY_CANDY: Estilo manga shōjo clásico dramático y empático. Explica mediante casos clínicos emotivos, apego y desarrollo humano.
      - TRANSFORMERS: Estilo Cybertron G1 (Optimus Prime, Perceptor, Ratchet). Explica procesos neurocognitivos, biológicos o lógicos como circuitos, matrices y sistemas que se transforman.
      - GI_JOE: Estilo táctico años 80 (Duke, Scarlett). Explica metodologías, terapias o protocolos de investigación como misiones estratégicas contra los sesgos y trampas de Cobra. Termina con "¡Y saber es la mitad de la batalla!".
      - HE_MAN: Estilo épico de Eternia (He-Man, Sorceress vs Skeletor). Explica filosofía, psicoanálisis y escuelas psicológicas como secretos del Castillo Grayskull y fuerzas de la mente.
      - OSITOS_CARINOSITOS: Estilo tierno y comunitario (Quiéreme Mucho). Explica sociología, empatía y regulación emocional usando el Rayo Cariñosito para iluminar conceptos complejos.

      INSTRUCCIÓN:
      Analiza el material proporcionado y transfórmalo en un Storybook animado de 4 escenas rigurosamente académicas + un segmento de prueba (Quiz) de 3 preguntas de nivel universitario.
      ${customText ? `Material de clase adicional: ${customText}` : ''}
    `;

    contents.push(systemPrompt);

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: contents,
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
                  visualPromptRetro: { type: Type.STRING },
                  animationEffect: { type: Type.STRING }
                },
                required: ["sceneNumber", "characterName", "academicConcept", "storyDialogue", "visualPromptRetro", "animationEffect"]
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

    const storybookData = JSON.parse(response.text);

    // Cálculo del consumo de IA (Tokens reales + tarifa de generación por Storybook de $0.25 USD)
    const promptTokens = response.usageMetadata?.promptTokenCount || 1500;
    const outputTokens = response.usageMetadata?.candidatesTokenCount || 1200;
    const rawCloudCost = (promptTokens * 0.00000015) + (outputTokens * 0.00000125);
    const billedToStudentUSD = 0.25; // Cobro por Storybook generado al estudiante

    usersDB["estudiante@psicologia.edu"].aiConsumptionUSD += billedToStudentUSD;
    usersDB["estudiante@psicologia.edu"].storybooksCreated += 1;

    const savedStorybook = {
      id: 'sb-' + Date.now(),
      createdAt: new Date().toISOString(),
      tokensUsed: promptTokens + outputTokens,
      rawCloudCost: rawCloudCost.toFixed(5),
      billedUSD: billedToStudentUSD,
      ...storybookData
    };

    subject.storybooks.push(savedStorybook);

    res.json({
      storybook: savedStorybook,
      billingUpdate: usersDB["estudiante@psicologia.edu"]
    });

  } catch (error) {
    console.error('Error generando Storybook:', error);
    res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor corriendo en puerto ${PORT}`));
