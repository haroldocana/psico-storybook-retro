// 🎧 ENDPOINT PARA OBTENER EL CONTENIDO COMPLETO EN CAPÍTULOS PARA EL AUDIOLIBRO
app.post('/api/audiobook-chapters', async (req, res) => {
  try {
    const { username, subjectId, documentId } = req.body;
    const user = await UserModel.findOne({ username: (username || '').toLowerCase() });
    if (!user) return res.status(401).json({ error: "Usuario no autenticado" });
    const subject = user.subjects.find(s => s.id === subjectId);
    if (!subject) return res.status(404).json({ error: "Materia no encontrada" });

    const docs = await getFullDocumentsForSubject(user.username, subject, documentId);
    let combinedText = '';
    for (const doc of docs) {
      if (doc.textContent) {
        combinedText += `\n\n--- Documento: ${doc.title} ---\n${doc.textContent}`;
      }
    }

    if (!combinedText.trim()) {
      return res.status(400).json({ error: "No hay texto suficiente en los documentos seleccionados para generar el audiolibre." });
    }

    // Usamos la IA para estructurar el texto en capítulos o lecciones limpias y conversacionales para audio
    const contents = [
      `Toma el siguiente material de estudio y divídelo en capítulos o secciones lógicas para un audiolibre educativo con enfoque humanista-existencial. Cada sección debe tener un título claro y un texto optimizado para ser escuchado en voz alta con claridad:`,
      combinedText
    ];

    const schema = {
      type: Type.OBJECT,
      properties: {
        audiobookTitle: { type: Type.STRING },
        chapters: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              chapterTitle: { type: Type.STRING },
              chapterContent: { type: Type.STRING }
            },
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
