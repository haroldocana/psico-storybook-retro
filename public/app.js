let currentUser = null;
let activeSubjectId = null;
let socraticHistory = '';

// Variables globales para el resumen del audiolibro
window.currentAudiobookSummary = "";
window.currentAudiobookTitle = "";

// 1. INICIALIZACIÓN Y SESIÓN
window.addEventListener('DOMContentLoaded', async () => {
  const savedUsername = localStorage.getItem('psico_active_user');
  if (savedUsername) {
    try {
      const res = await fetch(`/api/auth/session/${encodeURIComponent(savedUsername)}`);
      const data = await res.json();
      if (res.ok && data.user) {
        enterApp(data.user);
      }
    } catch (e) {
      console.error("Error cargando sesión:", e);
    }
  }
});

// 2. FUNCIÓN DE VOZ SINTÉTICA (TTS)
window.speakText = function(text) {
  if (!('speechSynthesis' in window)) {
    return alert('Tu navegador no soporta síntesis de voz. Por favor usa Chrome, Edge o Safari.');
  }
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'es-ES';
  window.speechSynthesis.speak(utterance);
}

// 3. FUNCIONES DE AUTENTICACIÓN
window.switchAuthTab = function(tab) {
  document.getElementById('authError').classList.add('hidden');
  document.getElementById('loginForm').classList.toggle('hidden', tab !== 'login');
  document.getElementById('registerForm').classList.toggle('hidden', tab !== 'register');
  
  document.getElementById('tabLogin').className = tab === 'login' 
    ? 'flex-1 py-3 rounded-xl text-xs font-black bg-indigo-600 text-white shadow transition-all' 
    : 'flex-1 py-3 rounded-xl text-xs font-black text-slate-400 hover:text-white transition-all';
    
  document.getElementById('tabRegister').className = tab === 'register' 
    ? 'flex-1 py-3 rounded-xl text-xs font-black bg-emerald-600 text-white shadow transition-all' 
    : 'flex-1 py-3 rounded-xl text-xs font-black text-slate-400 hover:text-white transition-all';
}

function showAuthError(msg) { 
  const el = document.getElementById('authError'); 
  el.textContent = msg; 
  el.classList.remove('hidden'); 
}

window.handleLogin = async function(e) {
  e.preventDefault();
  const btn = document.getElementById('btnLoginBtn');
  const originalText = btn.innerHTML;
  btn.innerHTML = '⏳ Conectando...';
  btn.disabled = true;
  document.getElementById('authError').classList.add('hidden');

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST', 
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        identifier: document.getElementById('loginId').value, 
        password: document.getElementById('loginPass').value 
      })
    });
    
    let data;
    try { data = await res.json(); } catch(err) { throw new Error("El servidor no respondió correctamente."); }
    
    if (!res.ok) {
      showAuthError(data.error || "Error al iniciar sesión.");
      btn.innerHTML = originalText;
      btn.disabled = false;
      return;
    }
    
    btn.innerHTML = originalText;
    btn.disabled = false;
    enterApp(data.user);
    
  } catch (e) { 
    showAuthError(e.message || 'Error de red: El servidor no responde.'); 
    btn.innerHTML = originalText;
    btn.disabled = false;
  }
}

window.handleRegister = async function(e) {
  e.preventDefault();
  const btn = document.getElementById('btnRegBtn');
  const originalText = btn.innerHTML;
  btn.innerHTML = '⏳ Registrando...';
  btn.disabled = true;
  document.getElementById('authError').classList.add('hidden');

  try {
    const res = await fetch('/api/auth/register', {
      method: 'POST', 
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        fullName: document.getElementById('regName').value, 
        username: document.getElementById('regUser').value, 
        career: document.getElementById('regCareer').value, 
        email: document.getElementById('regEmail').value, 
        password: document.getElementById('regPass').value 
      })
    });
    
    let data;
    try { data = await res.json(); } catch(err) { throw new Error("El servidor no respondió."); }

    if (!res.ok) {
      showAuthError(data.error || "Error al registrar la cuenta.");
      btn.innerHTML = originalText;
      btn.disabled = false;
      return;
    }
    
    btn.innerHTML = originalText;
    btn.disabled = false;
    enterApp(data.user);
    
  } catch (e) { 
    showAuthError(e.message || 'Error al registrar: Servidor fuera de línea.'); 
    btn.innerHTML = originalText;
    btn.disabled = false;
  }
}

function enterApp(user) {
  currentUser = user;
  localStorage.setItem('psico_active_user', user.username);
  const lastSubj = localStorage.getItem(`psico_subj_${user.username}`);
  activeSubjectId = (user.subjects.find(s => s.id === lastSubj) ? lastSubj : user.subjects[0]?.id) || null;
  document.getElementById('authScreen').classList.add('hidden');
  document.getElementById('appScreen').classList.remove('hidden');
  renderDashboard();
}

window.logout = function() { 
  currentUser = null; 
  localStorage.removeItem('psico_active_user'); 
  location.reload(); 
}

// 4. RENDERIZADO DEL DASHBOARD Y MATERIAS
window.updateSelectedFilesList = function() {
  const input = document.getElementById('docFiles');
  document.getElementById('selectedFilesPreview').textContent = input.files.length > 0 
    ? `✅ ${input.files.length} archivo(s) listos para subir.` : '';
}

function renderDashboard() {
  document.getElementById('careerTitleBanner').textContent = `Entorno: ${currentUser.career || 'Universitario'}`;
  document.getElementById('userHeaderInfo').innerHTML = `👤 <b>${currentUser.fullName}</b>`;
  document.getElementById('aiBilling').textContent = `$${(currentUser.aiConsumptionUSD || 0).toFixed(2)} USD`;

  const list = document.getElementById('subjectsList');
  list.innerHTML = currentUser.subjects.map(s => `
    <button onclick="selectSubject('${s.id}')" class="w-full text-left p-4 rounded-2xl border-2 transition-all ${s.id === activeSubjectId ? 'bg-cyan-950/80 border-cyan-400 shadow-lg text-white transform scale-[1.02]' : 'bg-slate-900/70 border-indigo-500/30 text-slate-300 hover:border-indigo-400'}">
      <div class="font-black text-sm">${s.name}</div>
      <div class="text-xs text-cyan-300/80 mt-1 font-bold">${s.schedule || ''}</div>
    </button>
  `).join('');

  const subj = currentUser.subjects.find(s => s.id === activeSubjectId);
  if (!subj) return;

  document.getElementById('activeSubjMeta').textContent = `${currentUser.career} · ${subj.schedule || ''}`;
  document.getElementById('activeSubjTitle').textContent = subj.name;
  
  const docs = subj.documents || [];
  const sbCount = (subj.storybooks || []).length;
  
  const domainScore = Math.min(100, (docs.length * 25) + (sbCount * 20));
  document.getElementById('progressBar').style.width = domainScore + '%';
  document.getElementById('progressText').textContent = domainScore + '%';

  document.getElementById('savedLibraryBadge').textContent = docs.length;
  document.getElementById('btnClearAllDocs').classList.toggle('hidden', docs.length === 0);

  // Render Archivos
  document.getElementById('savedDocsList').innerHTML = docs.length === 0 
    ? `<p class="text-xs text-slate-500 italic p-3 border border-dashed border-slate-700 rounded-xl text-center">Repositorio vacío.</p>` 
    : docs.map(d => `
      <div class="flex items-center justify-between px-4 py-3 rounded-xl bg-slate-900 border border-indigo-500/30 text-sm gap-3 shadow-sm hover:border-indigo-400 transition">
        <div class="truncate text-slate-200 font-bold">📄 ${d.title}</div>
        <button onclick="deleteSavedDoc('${d.id}')" class="text-red-400 font-black hover:text-red-300 bg-red-950/50 px-2 py-1 rounded-lg">🗑️</button>
      </div>
    `).join('');

  // Selectores
  const optionsHTML = `<option value="ALL">📚 USAR TODOS LOS ARCHIVOS (${docs.length})</option>` + docs.map(d => `<option value="${d.id}">📄 ${d.title}</option>`).join('');
  document.getElementById('selectDocForAI').innerHTML = optionsHTML;
  document.getElementById('audiobookDocSelect').innerHTML = `<option value="">-- Elige el Libro Completo --</option>` + docs.map(d => `<option value="${d.id}">📖 ${d.title}</option>`).join('');

  // Render Historial Monografías
  const hist = document.getElementById('savedHistoryList');
  hist.innerHTML = (subj.storybooks || []).slice().reverse().map(sb => `
    <div class="p-3.5 rounded-xl bg-slate-900 border border-indigo-500/30 flex justify-between items-center text-sm shadow-sm hover:border-cyan-500 transition">
      <div onclick='openStorybook(${JSON.stringify(sb).replace(/'/g, "&#39;")})' class="cursor-pointer truncate flex-1 text-slate-200 font-black hover:text-cyan-300">📖 ${sb.title}</div>
      <button onclick="deleteSavedStorybook('${sb.id}')" class="text-red-400 ml-3 font-black bg-red-950/50 px-2 py-1 rounded-lg">🗑️</button>
    </div>
  `).join('') || '<p class="text-xs text-slate-500 italic p-3 border border-dashed border-slate-700 rounded-xl text-center">No hay monografías generadas aún.</p>';

  // Render Bitácora Audiolibros
  const abHist = document.getElementById('savedAudiobooksList');
  abHist.innerHTML = (subj.audiobooks || []).slice().reverse().map(ab => `
    <div class="p-3.5 rounded-xl bg-slate-900 border border-rose-500/30 flex justify-between items-center text-sm shadow-sm hover:border-rose-500 transition">
      <div onclick='openSavedAudiobook(${JSON.stringify(ab).replace(/'/g, "&#39;")})' class="cursor-pointer truncate flex-1 text-slate-200 font-black hover:text-rose-300">🎧 ${ab.audiobookTitle}</div>
      <button onclick="deleteSavedAudiobook('${ab.id}')" class="text-red-400 ml-3 font-black bg-red-950/50 px-2 py-1 rounded-lg">🗑️</button>
    </div>
  `).join('') || '<p class="text-xs text-slate-500 italic p-3 border border-dashed border-slate-700 rounded-xl text-center">No hay audiolibros en la bitácora.</p>';
}

window.selectSubject = function(id) { 
  activeSubjectId = id; 
  localStorage.setItem(`psico_subj_${currentUser.username}`, id); 
  document.getElementById('viewerArea').classList.add('hidden'); 
  renderDashboard(); 
}

window.toggleNewSubjectModal = function() { 
  document.getElementById('modalSubject').classList.toggle('hidden'); 
}

window.createNewSubject = async function() {
  const name = document.getElementById('newSubjName').value.trim();
  if (!name) return;
  const res = await fetch('/api/subjects', {
    method: 'POST', 
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: currentUser.username, name, schedule: document.getElementById('newSubjSchedule').value })
  });
  const data = await res.json();
  if (res.ok) { 
    currentUser = data.user; activeSubjectId = data.newSubjectId; toggleNewSubjectModal(); 
    document.getElementById('newSubjName').value = ''; document.getElementById('newSubjSchedule').value = '';
    renderDashboard(); 
  }
}

window.deleteActiveSubject = async function() {
  if (!activeSubjectId || !confirm('¿Estás seguro de querer borrar esta materia y todos sus documentos?')) return;
  const res = await fetch(`/api/subjects/${activeSubjectId}`, {
    method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: currentUser.username })
  });
  const data = await res.json();
  if (res.ok) { 
    currentUser = data.user; activeSubjectId = currentUser.subjects[0]?.id || null; 
    document.getElementById('viewerArea').classList.add('hidden'); renderDashboard(); 
  }
}

window.handleUploadDoc = async function(e) {
  e.preventDefault();
  const btn = document.getElementById('btnUploadDoc');
  const originalText = btn.innerHTML;
  btn.innerHTML = '⏳ Subiendo...';
  btn.disabled = true;
  
  const fd = new FormData();
  fd.append('username', currentUser.username); 
  fd.append('subjectId', activeSubjectId);
  fd.append('docTitle', document.getElementById('docTitle').value);
  fd.append('youtubeUrl', document.getElementById('youtubeUrlInput').value);
  
  const files = document.getElementById('docFiles').files;
  for (let i = 0; i < files.length; i++) { fd.append('documents', files[i]); }

  try {
    const res = await fetch('/api/documents', { method: 'POST', body: fd });
    const data = await res.json();
    if (res.ok) { 
      currentUser = data.user; 
      document.getElementById('docTitle').value = ''; document.getElementById('docFiles').value = ''; 
      document.getElementById('selectedFilesPreview').textContent = ''; document.getElementById('youtubeUrlInput').value = '';
      renderDashboard(); alert('¡Material guardado!'); 
    } else { alert(data.error); }
  } catch (err) { alert('Error de conexión.'); } finally { btn.innerHTML = originalText; btn.disabled = false; }
}

window.deleteSavedDoc = async function(id) {
  if (!confirm('¿Borrar documento?')) return;
  const res = await fetch(`/api/documents/${id}`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: currentUser.username, subjectId: activeSubjectId }) });
  const data = await res.json();
  if (res.ok) { currentUser = data.user; renderDashboard(); }
}

window.clearAllSubjectDocs = async function() {
  if (!confirm('¿Vaciar TODO el repositorio?')) return;
  const res = await fetch(`/api/subjects/${activeSubjectId}/documents`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: currentUser.username }) });
  const data = await res.json();
  if (res.ok) { currentUser = data.user; renderDashboard(); }
}

window.deleteSavedStorybook = async function(sbId) {
  if (!confirm('¿Borrar monografía?')) return;
  const res = await fetch(`/api/storybooks/${sbId}`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: currentUser.username, subjectId: activeSubjectId }) });
  const data = await res.json();
  if (res.ok) { currentUser = data.user; renderDashboard(); }
}

window.deleteSavedAudiobook = async function(abId) {
  if (!confirm('¿Borrar audiolibro de la bitácora?')) return;
  const res = await fetch(`/api/audiobooks/${abId}`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: currentUser.username, subjectId: activeSubjectId }) });
  const data = await res.json();
  if (res.ok) { currentUser = data.user; renderDashboard(); }
}

window.exportToWord = function(title, contentHtml) {
  const htmlContent = `<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'><head><meta charset='utf-8'><title>${title}</title><style>body { font-family: 'Arial', sans-serif; line-height: 1.6; color: #000; padding: 20px; } h1, h2, h3, h4 { color: #1a365d; } p { margin-bottom: 15px; } .chapter-box { border: 1px solid #ccc; padding: 15px; margin-bottom: 20px; background-color: #f9f9f9; }</style></head><body><div style="text-align: center; margin-bottom: 30px;"><h1 style="color: #0284c7;">DOCUMENTO ACADÉMICO</h1><p><strong>Generado desde la Plataforma Universitaria</strong></p></div>${contentHtml}</body></html>`;
  const blob = new Blob(['\ufeff' + htmlContent], { type: 'application/msword' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = `${title}.doc`; document.body.appendChild(a); a.click(); document.body.removeChild(a);
}

window.closeFullScreenViewer = function() {
  const v = document.getElementById('viewerArea');
  v.classList.remove('fullscreen-mode'); v.classList.add('hidden');
  window.speechSynthesis.cancel();
}

window.togglePhenomenologyDocs = function() { document.getElementById('phenomenologyDocs').classList.toggle('hidden'); }

window.askPhenomenology = async function() {
  const query = document.getElementById('phenoQueryInput').value.trim();
  if (!query) return alert('Escribe tu duda existencial.');
  const v = document.getElementById('viewerArea'); v.classList.add('fullscreen-mode'); v.classList.remove('hidden');
  v.innerHTML = `<div class="text-center animate-pulse pt-32"><span class="text-6xl mb-4">🏛️</span><p class="text-amber-300 font-black text-2xl mt-4">Consultando al Oráculo...</p></div>`;
  try {
    const res = await fetch('/api/phenomenology-query', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: currentUser.username, query }) });
    const data = await res.json();
    if (!res.ok) return alert(data.error); currentUser = data.user; renderDashboard();
    v.innerHTML = `<div class="max-w-4xl mx-auto glass-edu rounded-3xl p-10 space-y-6 border-2 border-amber-500 relative shadow-2xl bg-gradient-to-b from-amber-950/40 to-slate-900 mt-10"><button onclick="closeFullScreenViewer()" class="absolute top-6 right-6 px-5 py-3 rounded-2xl bg-red-950 text-red-300 font-bold text-sm">✕ Cerrar</button><div class="flex justify-between items-center border-b-2 border-amber-500/30 pb-5"><div><span class="text-amber-500 font-black text-xs uppercase">Módulo Continental Puro</span><h2 class="text-3xl font-black text-amber-300 mt-1">🏛️ Respuesta</h2></div><button onclick="speakText(document.getElementById('phenoResultText').textContent)" class="px-5 py-3 rounded-2xl bg-amber-600 font-black text-sm text-white">🔊 Escuchar</button></div><div class="bg-slate-900/80 p-8 rounded-2xl border border-amber-500/30 shadow-inner"><div id="phenoResultText" class="text-base whitespace-pre-wrap leading-relaxed text-slate-100 font-medium">${data.answer}</div></div></div>`;
  } catch (err) { alert('Error: ' + err.message); closeFullScreenViewer(); }
}

window.submitUniversityHomework = async function() {
  const promptTask = document.getElementById('homeworkPromptInput').value.trim();
  if (!promptTask) return alert('Escribe qué tarea necesitas.');
  const v = document.getElementById('viewerArea'); v.classList.add('fullscreen-mode'); v.classList.remove('hidden');
  v.innerHTML = `<div class="text-center animate-pulse pt-32"><span class="text-6xl mb-4">📝</span><p class="text-emerald-300 font-black text-2xl mt-4">Redactando Resolución...</p></div>`;
  try {
    const res = await fetch('/api/university-homework', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: currentUser.username, subjectId: activeSubjectId, promptTask }) });
    const data = await res.json();
    if (!res.ok) { closeFullScreenViewer(); return alert(data.error); }
    currentUser = data.user; renderDashboard();
    v.innerHTML = `<div class="max-w-5xl mx-auto glass-edu rounded-3xl p-10 space-y-6 border-2 border-emerald-500 relative shadow-2xl mt-10"><button onclick="closeFullScreenViewer()" class="absolute top-6 right-6 px-5 py-3 rounded-2xl bg-red-950 text-red-300 font-bold text-sm">✕ Cerrar</button><div class="flex justify-between items-center border-b-2 border-indigo-500/30 pb-5"><div><h2 class="text-3xl font-black mt-3 text-emerald-300">Resolución de Tarea</h2></div><div class="flex gap-3"><button onclick="speakText(document.getElementById('homeworkResultText').textContent)" class="px-5 py-3 rounded-2xl bg-cyan-600 font-black text-sm text-white">🔊 Audio</button><button onclick="exportToWord('Resolucion', document.getElementById('exportableHomework').innerHTML)" class="px-5 py-3 rounded-2xl bg-indigo-600 font-black text-sm text-white">📥 .doc</button></div></div><div id="exportableHomework" class="bg-slate-900 p-8 rounded-2xl border border-indigo-500/30 shadow-inner"><div id="homeworkResultText" class="text-base whitespace-pre-wrap leading-relaxed text-slate-100 font-medium">${data.result}</div></div></div>`;
  } catch (err) { alert('Error: ' + err.message); closeFullScreenViewer(); }
}

window.downloadAudiobookSummary = function() {
  const safeTitle = window.currentAudiobookTitle.replace(/[^a-z0-9]/gi, '_').toLowerCase();
  const content = `<div class="chapter-box"><h2>Resumen Ejecutivo</h2><p>${window.currentAudiobookSummary.replace(/\n/g, '<br>')}</p></div>`;
  exportToWord('Resumen_Libro_' + safeTitle, content);
};

window.openSavedAudiobook = function(ab) {
  const v = document.getElementById('viewerArea');
  v.classList.add('fullscreen-mode'); v.classList.remove('hidden');
  window.currentAudiobookSummary = ab.bookSummary || 'Resumen no disponible.';
  window.currentAudiobookTitle = ab.audiobookTitle || 'Libro_Educativo';
  let currentChapterIdx = 0;

  function playCurrentChapter() {
    if (!('speechSynthesis' in window)) return alert('Tu navegador no soporta síntesis de voz.');
    window.speechSynthesis.cancel();
    const textToSpeak = `${ab.chapters[currentChapterIdx].chapterTitle}. ${ab.chapters[currentChapterIdx].chapterContent}`;
    const utterance = new SpeechSynthesisUtterance(textToSpeak); utterance.lang = 'es-ES'; utterance.rate = 1.0;
    utterance.onend = () => { if (currentChapterIdx < ab.chapters.length - 1) { currentChapterIdx++; renderAudiobookUI(); playCurrentChapter(); } };
    window.speechSynthesis.speak(utterance);
  }

  window.jumpToChapter = (idx) => { currentChapterIdx = idx; renderAudiobookUI(); playCurrentChapter(); };
  window.pauseAudiobook = () => { window.speechSynthesis.pause(); };
  window.resumeAudiobook = () => { window.speechSynthesis.resume(); };
  window.stopAudiobook = () => { window.speechSynthesis.cancel(); };

  function renderAudiobookUI() {
    v.innerHTML = `
      <div class="max-w-6xl mx-auto glass-edu rounded-3xl p-8 space-y-6 border-2 border-rose-500 relative shadow-2xl mt-4">
        <button onclick="closeFullScreenViewer(); window.speechSynthesis.cancel();" class="absolute top-6 right-6 px-5 py-3 rounded-2xl bg-red-950 text-red-300 font-bold text-sm z-10">✕ Cerrar Audio</button>
        <div class="border-b-2 border-rose-500/30 pb-5 flex justify-between items-end gap-4">
          <div><h2 class="text-3xl font-black mt-3 text-rose-300">${ab.audiobookTitle}</h2></div>
          <button onclick="downloadAudiobookSummary()" class="px-5 py-4 rounded-2xl bg-emerald-600 text-white font-black text-sm">📥 Descargar Puntos Clave</button>
        </div>
        <div class="bg-slate-900/90 p-6 rounded-3xl border-2 border-rose-500/50 flex justify-between items-center gap-6 shadow-xl relative overflow-hidden">
          <div class="pl-2"><p class="text-xs text-rose-400 font-black uppercase">Reproduciendo Ahora:</p><p class="text-xl font-black text-white mt-1">${ab.chapters[currentChapterIdx].chapterTitle}</p></div>
          <div class="flex items-center gap-3">
            <button onclick="playCurrentChapter()" class="px-5 py-3 rounded-xl bg-emerald-600 text-white font-black text-sm">▶️ Reiniciar</button>
            <button onclick="pauseAudiobook()" class="px-5 py-3 rounded-xl bg-amber-600 text-white font-black text-sm">⏸️ Pausar</button>
            <button onclick="resumeAudiobook()" class="px-5 py-3 rounded-xl bg-cyan-600 text-white font-black text-sm">⏯️ Seguir</button>
            <button onclick="stopAudiobook()" class="px-5 py-3 rounded-xl bg-red-900 text-white font-black text-sm">⏹️ Parar</button>
          </div>
        </div>
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-8 pt-4">
          <div class="space-y-3 max-h-[500px] overflow-y-auto pr-3 bg-slate-950/50 p-4 rounded-3xl border border-slate-800">
            <p class="text-xs font-black text-slate-400 mb-4 text-center border-b border-slate-800 pb-2">ÍNDICE DE CAPÍTULOS</p>
            ${ab.chapters.map((ch, idx) => `
              <button onclick="jumpToChapter(${idx})" class="w-full text-left p-4 rounded-2xl border-2 transition-all text-sm font-bold flex items-center gap-3 ${idx === currentChapterIdx ? 'bg-rose-900/60 border-rose-400 text-white' : 'bg-slate-900 border-slate-800 text-slate-400'}">
                <span class="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${idx === currentChapterIdx ? 'bg-rose-500 text-white' : 'bg-slate-800 text-slate-500'}">${idx === currentChapterIdx ? '🔊' : idx + 1}</span>
                <span class="line-clamp-2">${ch.chapterTitle}</span>
              </button>
            `).join('')}
          </div>
          <div class="lg:col-span-2 bg-slate-900 p-8 rounded-3xl border-2 border-indigo-500/20 max-h-[500px] overflow-y-auto space-y-4">
            <p class="text-xs font-black text-rose-300 uppercase sticky top-0 bg-slate-900/90 py-2 border-b border-indigo-500/30">Transcripción del Texto:</p>
            <p class="text-base text-slate-200 leading-relaxed font-medium whitespace-pre-wrap mt-4">${ab.chapters[currentChapterIdx].chapterContent}</p>
          </div>
        </div>
      </div>
    `;
  }
  renderAudiobookUI();
  playCurrentChapter();
};

window.generateAudiobook = async function() {
  const selectedDocId = document.getElementById('audiobookDocSelect').value;
  if(!selectedDocId) return alert('Por favor, selecciona un libro del menú rojo.');
  const v = document.getElementById('viewerArea');
  v.classList.add('fullscreen-mode'); v.classList.remove('hidden');
  v.innerHTML = `<div class="text-center animate-pulse pt-32"><span class="text-6xl mb-4">🎧</span><p class="text-rose-400 font-black text-2xl mt-4 uppercase">Extrayendo Obra Completa...</p></div>`;
  try {
    const res = await fetch('/api/audiobook-chapters', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: currentUser.username, subjectId: activeSubjectId, documentId: selectedDocId }) });
    const data = await res.json();
    if (!res.ok) { closeFullScreenViewer(); return alert(data.error); }
    currentUser = data.user; renderDashboard(); window.openSavedAudiobook(data.audiobook);
  } catch (err) { alert('Error: ' + err.message); closeFullScreenViewer(); }
}

window.generateTimelineMap = async function() {
  const v = document.getElementById('viewerArea'); v.classList.add('fullscreen-mode'); v.classList.remove('hidden'); 
  v.innerHTML = `<div class="text-center animate-pulse pt-32"><p class="text-amber-300 font-black text-3xl">🗺️</p><p class="text-amber-300 font-black text-xl mt-4 uppercase">Mapeando Evolución Teórica...</p></div>`;
  try { 
    const res = await fetch('/api/generate-timeline-map', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: currentUser.username, subjectId: activeSubjectId, documentId: document.getElementById('selectDocForAI').value }) }); 
    const data = await res.json(); 
    if (!res.ok) { closeFullScreenViewer(); return alert(data.error); }
    currentUser = data.user; renderDashboard(); const tm = data.timelineMap; 
    v.innerHTML = `<div class="max-w-6xl mx-auto glass-edu rounded-3xl p-10 space-y-8 border-2 border-amber-500 relative mt-10"><button onclick="closeFullScreenViewer()" class="absolute top-6 right-6 px-5 py-3 rounded-2xl bg-red-950 text-red-300 font-bold text-sm">✕ Cerrar Mapa</button><div class="border-b-2 border-amber-500/30 pb-6 text-center"><h2 class="text-4xl font-black text-amber-300 mt-4">${tm.timelineTitle}</h2></div><div class="space-y-6 pt-4">${tm.eras.map((e, idx) => `<div class="p-6 rounded-3xl bg-slate-900 border-2 border-cyan-500/40 shadow-xl"><span class="text-[10px] font-black px-3 py-1 bg-cyan-500/20 text-cyan-300 rounded-full">Fase ${idx + 1}:${e.eraName}</span><h4 class="font-black text-lg text-teal-300 mt-3">👤 ${e.mainAuthor}</h4><p class="text-sm text-slate-200 mt-3"><b>Idea Central:</b> ${e.coreIdea}</p><p class="text-xs text-amber-400 mt-3 font-bold"><b>Conexión:</b> ${e.refutationOrLink}</p></div>`).join('')}</div></div>`; 
  } catch (err) { alert('Error: ' + err.message); closeFullScreenViewer(); }
}

window.generateFlashcards = async function() {
  const v = document.getElementById('viewerArea'); v.classList.add('fullscreen-mode'); v.classList.remove('hidden'); 
  v.innerHTML = `<div class="text-center animate-pulse pt-32"><p class="text-purple-300 font-black text-3xl">🃏</p><p class="text-purple-300 font-black text-xl mt-4 uppercase">Generando Fichas Teóricas...</p></div>`;
  try { 
    const res = await fetch('/api/generate-flashcards', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: currentUser.username, subjectId: activeSubjectId, documentId: document.getElementById('selectDocForAI').value }) }); 
    const data = await res.json(); 
    if (!res.ok) { closeFullScreenViewer(); return alert(data.error); }
    currentUser = data.user; renderDashboard(); 
    v.innerHTML = `<div class="max-w-5xl mx-auto glass-edu rounded-3xl p-10 space-y-8 border-2 border-purple-500 relative mt-10"><button onclick="closeFullScreenViewer()" class="absolute top-6 right-6 px-5 py-3 rounded-2xl bg-red-950 text-red-300 font-bold text-sm">✕ Cerrar Fichas</button><div class="text-center border-b-2 border-purple-500/30 pb-6"><h2 class="text-4xl font-black text-purple-300 mt-4">🃏 Fichas Académicas Interactivas</h2></div><div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 pt-4">${data.flashcards.map((fc, i) => `<div onclick="this.classList.toggle('flipped')" class="flashcard h-80 cursor-pointer relative group"><div class="flashcard-inner w-full h-full relative rounded-3xl"><div class="flashcard-front bg-slate-900 border-2 border-purple-500/60 p-6 rounded-3xl flex flex-col justify-between items-center text-center"><span class="text-xs font-black px-4 py-1.5 rounded-full bg-purple-950/80 text-purple-300">Ficha #${i+1}</span><p class="text-lg font-black text-slate-100 mt-4">${fc.question}</p><div class="mt-auto pt-4 w-full border-t border-slate-800"><span class="text-xs text-purple-400/80 font-bold">Haz clic para girar 🔄</span></div></div><div class="flashcard-back bg-gradient-to-br from-indigo-950 to-purple-950 border-2 border-indigo-400 p-6 rounded-3xl flex flex-col justify-between overflow-y-auto text-center"><span class="text-xs font-black px-4 py-1.5 rounded-full bg-emerald-950/80 text-emerald-400">Respuesta Oficial</span><p class="text-base text-slate-100 font-medium mt-4">${fc.answer}</p><div class="mt-4 p-3 rounded-xl bg-amber-950/40"><span class="text-xs text-amber-300 font-black block mb-1">💡 Tip / Conexión</span><span class="text-[11px] text-amber-200/80">${fc.hint}</span></div></div></div></div>`).join('')}</div></div>`; 
  } catch (err) { alert('Error: ' + err.message); closeFullScreenViewer(); }
}

window.generateMindMap = async function() {
  const v = document.getElementById('viewerArea'); v.classList.add('fullscreen-mode'); v.classList.remove('hidden'); 
  v.innerHTML = `<div class="text-center animate-pulse pt-32"><p class="text-teal-300 font-black text-3xl">🧠</p><p class="text-teal-300 font-black text-xl mt-4 uppercase">Construyendo Mapa Conceptual...</p></div>`;
  try { 
    const res = await fetch('/api/generate-mindmap', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: currentUser.username, subjectId: activeSubjectId, documentId: document.getElementById('selectDocForAI').value }) }); 
    const data = await res.json(); 
    if (!res.ok) { closeFullScreenViewer(); return alert(data.error); }
    currentUser = data.user; renderDashboard(); const mm = data.mindmap; 
    v.innerHTML = `<div class="max-w-6xl mx-auto glass-edu rounded-3xl p-10 space-y-8 border-2 border-teal-500 relative mt-10"><button onclick="closeFullScreenViewer()" class="absolute top-6 right-6 px-5 py-3 rounded-2xl bg-red-950 text-red-300 font-bold text-sm">✕ Cerrar Mapa</button><div class="text-center border-b-2 border-teal-500/30 pb-6"><h2 class="text-3xl font-black text-teal-300 mt-4">${mm.centralTopic}</h2></div><div class="flex flex-col items-center space-y-8 pt-6"><div class="px-8 py-5 rounded-3xl bg-teal-600 font-black text-white text-xl">🌟 ${mm.centralTopic}</div><div class="text-teal-400 text-3xl font-black">↓</div><div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 w-full">${mm.branches.map(b => `<div class="p-6 rounded-3xl bg-slate-900 border-2 border-teal-500/40"><h4 class="font-black text-base text-amber-300 border-b-2 border-indigo-500/30 pb-3">📌 ${b.branchName}</h4><ul class="space-y-3 text-sm text-slate-300 font-medium mt-4">${b.subitems.map(sub => `<li class="bg-slate-950/80 p-3.5 rounded-xl border border-slate-800">• ${sub}</li>`).join('')}</ul></div>`).join('')}</div></div></div>`; 
  } catch (err) { alert('Error: ' + err.message); closeFullScreenViewer(); }
}

window.generateStorybook = async function() {
  const v = document.getElementById('viewerArea'); v.classList.add('fullscreen-mode'); v.classList.remove('hidden'); 
  v.innerHTML = `<div class="text-center animate-pulse pt-32"><p class="text-cyan-300 font-black text-3xl">📖</p><p class="text-cyan-300 font-black text-xl mt-4 uppercase">Redactando Monografía Educativa Gamificada...</p></div>`;
  try { 
    const res = await fetch('/api/generate-storybook', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: currentUser.username, subjectId: activeSubjectId, documentId: document.getElementById('selectDocForAI').value, focusTopic: document.getElementById('focusTopic').value }) }); 
    const data = await res.json(); 
    if (res.ok) { currentUser = data.user; renderDashboard(); openStorybook(data.storybook); } 
    else { closeFullScreenViewer(); alert(data.error); }
  } catch (e) { alert('Error al conectar con el servidor.'); closeFullScreenViewer(); }
}

window.openStorybook = function(sb) {
  const v = document.getElementById('viewerArea'); v.classList.add('fullscreen-mode'); v.classList.remove('hidden');
  v.innerHTML = `
    <div id="exportableStorybook" class="max-w-6xl mx-auto glass-edu rounded-[2.5rem] p-8 md:p-12 space-y-10 cartoon-card relative mt-8 mb-8">
      <button onclick="closeFullScreenViewer()" class="absolute top-8 right-8 px-5 py-3 rounded-2xl bg-red-950 text-red-300 font-black text-sm z-20">✕ Cerrar Monografía</button>
      <div class="flex flex-wrap justify-between items-end gap-6 border-b-4 border-cyan-400 pb-6 pr-40">
        <div><h2 class="text-4xl font-black mt-4 text-cyan-300">${sb.title}</h2></div>
        <div class="flex gap-3">
          <button onclick="speakText('${sb.summary.replace(/'/g, "")}')" class="px-5 py-3 rounded-2xl bg-cyan-600 font-black text-sm text-white">🔊 Escuchar Todo</button>
          <button onclick="exportToWord('${sb.title.replace(/ /g, '_')}', document.getElementById('exportableStorybook').innerHTML)" class="px-5 py-3 rounded-2xl bg-indigo-600 font-black text-sm text-white">📥 Guardar .doc</button>
        </div>
      </div>
      <div class="speech-bubble p-8 text-sm font-bold shadow-2xl flex items-start gap-6">
        <div><p class="text-emerald-900 font-black mb-3 text-xl uppercase">Resumen Conceptual y Clínico:</p><p class="text-emerald-950 font-semibold leading-loose text-base">${sb.summary}</p></div>
      </div>
      <div class="bg-slate-950/90 rounded-3xl p-8 border-4 border-cyan-400 shadow-2xl space-y-6">
        <h3 class="font-black text-xl text-cyan-300 uppercase">⏳ Línea de Evolución Teórica</h3>
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          ${(sb.timeline || []).map(t => `<div class="p-6 rounded-3xl bg-slate-900 border-2 border-cyan-400/60"><span class="text-[10px] font-black px-3 py-1 bg-cyan-400 text-slate-950 rounded-full">Fase ${t.step}</span><h4 class="font-black text-base mt-4 text-amber-300">${t.title}</h4><p class="text-sm text-slate-300 mt-3 font-medium">${t.description}</p></div>`).join('')}
        </div>
      </div>
      <div class="space-y-6 pt-4">
        <h3 class="font-black text-xl text-teal-300 uppercase">📚 Exposición Analítica por Autores</h3>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
          ${(sb.scenes || []).map(sc => `<div class="cartoon-card rounded-3xl p-8 space-y-6 bg-slate-900"><div class="flex justify-between items-start border-b-2 border-indigo-500/30 pb-4"><div><span class="text-xs font-black px-3 py-1 bg-cyan-500/20 text-cyan-300 rounded-full">Módulo #${sc.sceneNumber}</span><h4 class="font-black text-xl text-white mt-3">${sc.characterName}</h4></div><button onclick="speakText('${sc.storyDialogue.replace(/'/g, "")}')" class="text-xs px-4 py-2 bg-cyan-700 text-white rounded-xl font-black">🔊 Narrar</button></div><div class="speech-bubble p-6 text-sm font-bold"><p class="text-emerald-950 font-black mb-3 text-base">📘 Concepto Clave: <span class="text-emerald-800">${sc.academicConcept}</span></p><div class="bg-white/50 p-4 rounded-2xl"><p class="text-emerald-900 italic font-bold text-sm">"${sc.storyDialogue}"</p></div></div></div>`).join('')}
        </div>
      </div>
      <div class="bg-slate-950/90 rounded-3xl p-8 border-4 border-amber-400 space-y-8 mt-10">
        <div class="flex items-center gap-4 border-b-2 border-amber-500/30 pb-4"><h3 class="font-black text-xl text-amber-300 uppercase">🏆 Trivia Gamificada</h3></div>
        <div class="space-y-6">
          ${(sb.quiz || []).map((q, idx) => `<div class="p-6 rounded-3xl bg-slate-900 border-2 border-indigo-500/40 space-y-4"><p class="text-base font-black text-slate-100"><span class="text-amber-400">Pregunta ${idx + 1}:</span>${q.question}</p><div class="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">${(q.options || []).map((opt, oIdx) => `<button onclick="alert('${oIdx === q.correctIndex ? '🏆 ¡RESPUESTA CORRECTA!\\n\\n' : '❌ Respuesta Incorrecta.\\n\\nEXPLICACIÓN:\\n'} ${JSON.stringify(q.heroExplanation).replace(/'/g, "\\'").replace(/^"|"$/g, '')}')" class="text-left text-sm font-bold p-4 rounded-2xl bg-slate-950 hover:bg-indigo-950 border-2 border-indigo-500/30 text-slate-200"><span class="text-indigo-400 mr-2">${String.fromCharCode(65 + oIdx)})</span> ${opt}</button>`).join('')}</div></div>`).join('')}
        </div>
      </div>
    </div>
  `;
  v.scrollIntoView({ behavior: 'smooth' });
}

window.openSocraticModal = function() { 
  document.getElementById('modalSocratic').classList.toggle('hidden'); 
}

window.sendSocraticMessage = async function() {
  const input = document.getElementById('socraticInput');
  const msg = input.value.trim();
  if (!msg) return;
  const box = document.getElementById('socraticChatBox');
  const philosopher = document.getElementById('socraticPhilosopher').value;

  box.innerHTML += `<div class="p-4 rounded-2xl bg-slate-800 text-right text-slate-200 font-medium ml-12 shadow-sm border border-slate-700"><b>Tú:</b> ${msg}</div>`;
  input.value = '';
  socraticHistory += `\nEstudiante: ${msg}`;

  try {
    const res = await fetch('/api/socratic-debate', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: currentUser.username, subjectId: activeSubjectId, philosopher, message: msg, history: socraticHistory })
    });
    const data = await res.json();
    if (res.ok) {
      socraticHistory += `\n${philosopher}: ${data.reply}`;
      box.innerHTML += `<div class="p-4 rounded-2xl bg-indigo-950/90 border border-indigo-800 text-indigo-100 font-medium mr-12 shadow-md"><b>${philosopher}:</b> ${data.reply}</div>`;
      box.scrollTop = box.scrollHeight;
    }
  } catch (e) { alert('Error en el debate.'); }
}
