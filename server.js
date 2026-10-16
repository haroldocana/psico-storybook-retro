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

const upload = multer({ storage: multer.memoryStorage() });
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Tus 6 materias oficiales de Psicología (Semestre 2, 2026)
const getInitialPsychologySubjects = () => [
  { id: "lpc-ep2", name: "Escuelas Psicológicas II", section: "Sección A", schedule: "Semestre 2, 2026", defaultHero: "HE_MAN", storybooks: [] },
  { id: "lpc-pe2", name: "Psicología Evolutiva II", section: "Sección A", schedule: "Semestre 2, 2026", defaultHero: "CANDY_CANDY", storybooks: [] },
  { id: "lpc-ti1", name: "Técnicas de Investigación", section: "Sección A", schedule: "Sáb 17 Oct - 08:00 AM", defaultHero: "GI_JOE", storybooks: [] },
  { id: "lpc-fil2", name: "Filosofía II", section: "Sección A", schedule: "Semestre 2, 2026", defaultHero: "HE_MAN", storybooks: [] },
  { id: "lpc-soc", name: "Sociología", section: "Sección A", schedule: "Sáb 17 Oct - 10:30 AM", defaultHero: "OSITOS_CARINOSITOS", storybooks: [] },
  { id: "lpc-nc1", name: "Neurociencia Cognitiva", section: "Sección A", schedule: "Semestre 2, 2026", defaultHero: "TRANSFORMERS", storybooks: [] }
];

// Base de Datos Multi-Usuario con tu usuario haroldocana configurado
const usersDB = {
  "haroldocana": {
    username: "haroldocana",
    fullName: "Harold Benjamín Ocaña Guillén",
    email: "haroldocana@psicologia.edu",
    githubRepo: "https://github.com/haroldocana/psico-storybook-retro",
    password: "admin123",
    career: "Licenciatura en Psicología Clínica (LPC)",
    subscriptionActive: true,
    subscriptionBaseUSD: 6.00,
    aiConsumptionUSD: 0.00,
    totalTokensUsed: 0,
    storybooksCreated: 0,
    subjects: getInitialPsychologySubjects()
  }
};

function findUser(identifier) {
  const cleanId = (identifier || '').trim().toLowerCase();
  return Object.values(usersDB).find(
    u => u.username.toLowerCase() === cleanId || u.email.toLowerCase() === cleanId
  );
}

// 1. Registro de nuevos usuarios ($6.00 USD/mes + consumo IA)
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
    subjects: loadPsychologyTemplate !== false ? getInitialPsychologySubjects() : []
  };

  const { password: _, ...safeUser } = usersDB[cleanUsername];
  res.json({ user: safeUser });
});

// 2. Login con usuario (haroldocana) o correo
app.post('/api/auth/login', (req, res) => {
  const { identifier, password } = req.body;
  const foundUser = findUser(identifier);

  if (!foundUser || foundUser.password !== password) {
    return res.status(401).json({ error: "Usuario o contraseña incorrectos." });
  }

  const { password: _, ...safeUser } = foundUser;
  res.json({ user: safeUser });
});

// 3. Crear más materias dinámicamente en el catálogo del usuario
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
    storybooks: []
  };
  user.subjects.push(newSubject);
  res.json({ subject: newSubject });
});

// 4. Generar Storybook Animado + Quiz con Gemini API
app.post('/api/generate-storybook', upload.single('document'), async (req, res) => {
  try {
    const { username, subjectId, topicTitle, universe, customText } = req.body;
    const user = findUser(username);
    if (!user) return res.status(401).json({ error: "Usuario no autenticado" });

    const subject = user.subjects.find(s => s.id === subjectId);
    if (!subject) return res.status(404).json({ error: "Materia no encontrada" });

    const contents = [];
    if (req.file) {
      contents.push({
        inlineData: {
          data: req.file.buffer.toString("base64"),
          mimeType: req.file.mimetype
        }
      });
    }

    const prompt = `
      Eres el Motor Pedagógico Retro-Manga del Centro de Estudio Universitario de ${user.fullName}.
      Carrera: "${user.career}". Materia: "${subject.name}". Tema: "${topicTitle}".
      Universo elegido: "${universe}".

      PERSONALIDADES:
      - CANDY_CANDY: Manga shōjo clásico dramático y empático (casos clínicos, apego, desarrollo humano).
      - TRANSFORMERS: Cybertron G1 (Optimus Prime, Perceptor, Ratchet). Procesos neurocognitivos, biológicos y lógicos como circuitos y sistemas que se transforman.
      - GI_JOE: Comando táctico años 80 (Duke, Scarlett). Metodologías de investigación, psicometría y terapias como misiones contra trampas de Cobra. Termina con "¡Y saber es la mitad de la batalla!".
      - HE_MAN: Épico de Eternia (He-Man, Sorceress vs Skeletor). Filosofía, historia y escuelas psicológicas como secretos del Castillo Grayskull.
      - OSITOS_CARINOSITOS: Cálido y comunitario (Quiéreme Mucho). Sociología, empatía y regulación emocional iluminando con el Rayo Cariñosito.

      INSTRUCCIÓN:
      Transforma el documento o apuntes en un Storybook animado de 4 escenas con alto rigor universitario + 1 Segmento de Prueba (Quiz) de 3 preguntas de opción múltiple con retroalimentación del héroe.
      ${customText ? `Contenido de estudio adicional: ${customText}` : ''}
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
    const totalTokens = (response.usageMetadata?.promptTokenCount || 1500) + (response.usageMetadata?.candidatesTokenCount || 1200);
    const chargeUSD = 0.25;

    user.aiConsumptionUSD += chargeUSD;
    user.totalTokensUsed += totalTokens;
    user.storybooksCreated += 1;

    const newStorybook = {
      id: 'sb-' + Date.now(),
      createdAt: new Date().toISOString(),
      tokensUsed: totalTokens,
      billedUSD: chargeUSD,
      ...storybookData
    };

    subject.storybooks.push(newStorybook);

    const { password: _, ...safeUser } = user;
    res.json({ storybook: newStorybook, user: safeUser });
  } catch (err) {
    console.error('Error generando Storybook:', err);
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor activo en puerto ${PORT}`));
