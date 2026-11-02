// ==========================================
// 12. LECTOR INMERSIVO 3D Y TTS (FASE 2)
// ==========================================
window.pageFlipInstance = null;
window.isSpeakingTTS = false;

window.openImmersiveBook = function(docId) {
  const subj = currentUser.subjects.find(s => s.id === activeSubjectId);
  const doc = subj.documents.find(d => d.id === docId);
  
  if (!doc) return alert("Documento no encontrado.");

  const v = document.getElementById('viewerArea');
  v.classList.add('fullscreen-mode');
  v.classList.remove('hidden');

  // UI del Libro y Botón Flotante TTS
  v.innerHTML = `
    <div class="max-w-4xl mx-auto mt-6 relative flex flex-col items-center">
      <button onclick="closeFullScreenViewer()" class="absolute -top-10 right-0 px-5 py-2 bg-slate-800 text-slate-300 rounded-xl font-bold border border-slate-600 hover:bg-slate-700 transition z-50">← Volver a Biblioteca</button>
      
      <div id="book-wrapper" class="relative mt-8 drop-shadow-2xl">
        <div id="flipbook" class="bg-slate-300">
          <!-- Las páginas se inyectan dinámicamente aquí -->
        </div>
      </div>

      <button id="ttsFloatingBtn" onclick="playCurrentPageTTS()" class="fixed bottom-12 right-12 w-16 h-16 rounded-full shadow-[0_10px_40px_rgba(0,0,0,0.6)] bg-cyan-500 border-4 border-cyan-300 text-2xl z-50 transform transition hover:scale-110 flex items-center justify-center">
        🔊
      </button>
    </div>
  `;

  // Simulamos la división de texto en páginas (aprox 1000 caracteres por página para el efecto visual)
  // Nota: En producción, si doc.textContent está vacío, debes extraerlo del base64 primero.
  const rawText = doc.textContent || "Este documento aún no tiene texto extraído para lectura inmersiva. Procesalo con la IA primero.";
  const charsPerPage = 1000; 
  let pagesHtml = '';
  
  for (let i = 0; i < rawText.length; i += charsPerPage) {
    const pageText = rawText.substring(i, i + charsPerPage);
    const pageNumber = (i / charsPerPage) + 1;
    
    pagesHtml += `
      <div class="page p-10 bg-[#fdfbf7] text-slate-900 border border-slate-300 shadow-[inset_0_0_20px_rgba(0,0,0,0.05)] overflow-hidden">
        <h4 class="text-center font-black text-[10px] uppercase text-slate-400 mb-6 border-b border-slate-300 pb-2 tracking-widest">${doc.title} - Pág ${pageNumber}</h4>
        <div class="page-content text-sm text-justify leading-relaxed whitespace-pre-wrap font-medium">${pageText}</div>
      </div>
    `;
  }

  // Inicializar PageFlip (Efecto Libro Físico 3D)
  setTimeout(() => {
    const bookEl = document.getElementById('flipbook');
    bookEl.innerHTML = pagesHtml;

    window.pageFlipInstance = new St.PageFlip(bookEl, {
      width: 400,
      height: 600,
      size: "stretch",
      minWidth: 315,
      maxWidth: 1000,
      minHeight: 400,
      maxHeight: 800,
      maxShadowOpacity: 0.3,
      showCover: false,
      mobileScrollSupport: true
    });

    window.pageFlipInstance.loadFromHTML(document.querySelectorAll('.page'));
    
    // Detener el audio si se cambia de página manualmente
    window.pageFlipInstance.on('flip', (e) => {
      if (window.isSpeakingTTS) stopTTS();
    });
  }, 100);
};

// Función para detener el TTS
function stopTTS() {
  window.speechSynthesis.cancel();
  window.isSpeakingTTS = false;
  const btn = document.getElementById('ttsFloatingBtn');
  if(btn) {
    btn.innerHTML = '🔊';
    btn.className = "fixed bottom-12 right-12 w-16 h-16 rounded-full shadow-[0_10px_40px_rgba(0,0,0,0.6)] bg-cyan-500 border-4 border-cyan-300 text-2xl z-50 transform transition hover:scale-110 flex items-center justify-center";
  }
}

// Sobrescribir cierre de visor para frenar el audio
const originalCloseFullScreenViewer = window.closeFullScreenViewer;
window.closeFullScreenViewer = function() {
  stopTTS();
  if (window.pageFlipInstance) {
    window.pageFlipInstance.destroy();
    window.pageFlipInstance = null;
  }
  originalCloseFullScreenViewer();
};

// Lógica de Limpieza y Reproducción
window.playCurrentPageTTS = async function() {
  if (!('speechSynthesis' in window)) return alert('TTS no soportado en tu navegador.');
  const btn = document.getElementById('ttsFloatingBtn');

  if (window.isSpeakingTTS) {
    stopTTS();
    return;
  }

  // Identificar qué página se está visualizando ahora mismo
  const currentPageIdx = window.pageFlipInstance.getCurrentPageIndex();
  const pages = document.querySelectorAll('.page-content');
  if(!pages[currentPageIdx]) return;
  
  const rawPageText = pages[currentPageIdx].textContent;
  btn.innerHTML = '⏳';

  try {
    // 1. Enviar el texto crudo al backend para limpieza Regex
    const res = await apiFetch('/api/tts-clean', {
      method: 'POST',
      body: JSON.stringify({ rawText: rawPageText })
    });
    const { cleanedText } = await res.json();

    // 2. Ejecutar la Voz Limpia
    const utterance = new SpeechSynthesisUtterance(cleanedText);
    utterance.lang = 'es-ES';
    utterance.rate = 1.0;
    
    utterance.onend = () => stopTTS();

    window.speechSynthesis.speak(utterance);
    window.isSpeakingTTS = true;
    
    // Cambiar botón a estado de "Detener"
    btn.innerHTML = '🛑';
    btn.className = "fixed bottom-12 right-12 w-16 h-16 rounded-full shadow-[0_10px_40px_rgba(0,0,0,0.6)] bg-rose-500 border-4 border-rose-300 text-2xl z-50 transform transition hover:scale-110 flex items-center justify-center animate-pulse";

  } catch (err) {
    alert("Error conectando con el motor de limpieza TTS.");
    stopTTS();
  }
};
