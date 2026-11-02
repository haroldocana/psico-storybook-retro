let currentUser = null;
let activeSubjectId = null;
let socraticHistory = '';

window.currentAudiobookSummary = "";
window.currentAudiobookTitle = "";

// ==========================================
// INTERCEPTOR MULTI-TENANT PARA FETCH
// ==========================================
async function apiFetch(endpoint, options = {}) {
  const tenantId = localStorage.getItem('psico_tenant_id');
  if (!options.headers) options.headers = {};
  if (!(options.body instanceof FormData) && !options.headers['Content-Type']) {
    options.headers['Content-Type'] = 'application/json';
  }
  if (tenantId) options.headers['x-tenant-id'] = tenantId;
  return fetch(endpoint, options);
}

// ==========================================
// 1. INICIALIZACIÓN Y SESIÓN
// ==========================================
window.addEventListener('DOMContentLoaded', async () => {
  const savedUsername = localStorage.getItem('psico_active_user');
  const savedTenant = localStorage.getItem('psico_tenant_id');
  if (savedUsername && savedTenant) {
    try {
      const res = await apiFetch(`/api/auth/session/${encodeURIComponent(savedUsername)}`);
      const data = await res.json();
      if (res.ok && data.user) { enterApp(data.user); }
    } catch (e) { console.error("Error cargando sesión:", e); }
  }
});

// ==========================================
// 2. FUNCIÓN DE VOZ SINTÉTICA (TTS)
// ==========================================
function cleanTextForAudio(text) {
  if (!text) return "";
  return text
    .replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu, '')
    .replace(/[*#_\[\]`~]/g, '')
    .replace(/\n+/g, '. ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

window.speakText = function(text) {
  if (!('speechSynthesis' in window)) return alert('Tu navegador no soporta síntesis de voz.');
  window.speechSynthesis.cancel();
  const cleanedText = cleanTextForAudio(text);
  const utterance = new SpeechSynthesisUtterance(cleanedText);
  utterance.lang = 'es-ES';
  window.speechSynthesis.speak(utterance);
};

// ==========================================
// 3. AUTENTICACIÓN Y GESTIÓN DE INSTITUCIÓN (DEV/PROD)
// ==========================================
window.switchAuthTab = function(tab) {
  document.getElementById('authError').classList.add('hidden');
  document.getElementById('loginForm').classList.toggle('hidden', tab !== 'login');
  document.getElementById('registerForm').classList.toggle('hidden', tab !== 'register');
  document.getElementById('tenantForm').classList.toggle('hidden', tab !== 'tenant');
  
  document.getElementById('tabLogin').className = tab === 'login' 
    ? 'flex-1 py-3 rounded-xl text-[10px] font-black bg-indigo-600 text-white shadow transition-all' 
    : 'flex-1 py-3 rounded-xl text-[10px] font-black text-slate-400 hover:text-white transition-all';
    
  document.getElementById('tabRegister').className = tab === 'register' 
    ? 'flex-1 py-3 rounded-xl text-[10px] font-black bg-emerald-600 text-white shadow transition-all' 
    : 'flex-1 py-3 rounded-xl text-[10px] font-black text-slate-400 hover:text-white transition-all';

  document.getElementById('tabTenant').className = tab === 'tenant' 
    ? 'flex-1 py-3 rounded-xl text-[10px] font-black bg-amber-600 text-white shadow transition-all' 
    : 'flex-1 py-3 rounded-xl text-[10px] font-black text-slate-400 hover:text-white transition-all';
};

window.showAuthError = function(msg) { 
  const el = document.getElementById('authError'); 
  el.textContent = msg; 
  el.classList.remove('hidden'); 
};

window.handleCreateTenant = async function(e) {
  e.preventDefault();
  const tenantId = document.getElementById('newTenantId').value.trim().toLowerCase();
  if (!tenantId) return showAuthError("Escribe un código.");
  
  const btn = document.getElementById('btnCreateTenant');
  const originalText = btn.innerHTML; btn.innerHTML = '⏳ Creando...'; btn.disabled = true;

  try {
    const res = await fetch('/dev/crear-institucion', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ codigo_institucion: tenantId })
    });
    const data = await res.json();
    if (!res.ok) { showAuthError(data.error); btn.innerHTML = originalText; btn.disabled = false; return; }

    alert(`✅ Institución "${tenantId}" creada. Usuario maestro: master / master123`);
    document.getElementById('loginTenant').value = tenantId;
    document.getElementById('loginId').value = 'master';
    document.getElementById('loginPass').value = 'master123';
    switchAuthTab('login');
  } catch (err) { showAuthError('Error de red.'); }
  finally { btn.innerHTML = originalText; btn.disabled = false; }
};

window.handleLogin = async function(e) {
  e.preventDefault();
  const tenantId = document.getElementById('loginTenant').value.trim();
  const loginId = document.getElementById('loginId').value.trim();
  const loginPass = document.getElementById('loginPass').value;

  if (!tenantId || !loginId || !loginPass) return showAuthError("Llena todos los campos.");

  const btn = document.getElementById('btnLoginBtn');
  const originalText = btn.innerHTML; btn.innerHTML = '⏳ Conectando...'; btn.disabled = true;

  try {
    localStorage.setItem('psico_tenant_id', tenantId);
    const res = await apiFetch('/api/auth/login', { method: 'POST', body: JSON.stringify({ identifier: loginId, password: loginPass }) });
    let data; try { data = await res.json(); } catch(err) { throw new Error(); }
    if (!res.ok) {
      localStorage.removeItem('psico_tenant_id'); showAuthError(data.error || "Credenciales incorrectas.");
      btn.innerHTML = originalText; btn.disabled = false; return;
    }
    btn.innerHTML = originalText; btn.disabled = false; enterApp(data.user);
  } catch (e) { showAuthError('Error de red.'); btn.innerHTML = originalText; btn.disabled = false; }
};

window.handleRegister = async function(e) {
  e.preventDefault();
  const tenantId = document.getElementById('regTenant').value.trim();
  const regName = document.getElementById('regName').value.trim();
  const regUser = document.getElementById('regUser').value.trim();
  const regCareer = document.getElementById('regCareer').value.trim();
  const regEmail = document.getElementById('regEmail').value.trim();
  const regPass = document.getElementById('regPass').value;
  const regRecovery = document.getElementById('regRecovery').value.trim();

  if (!tenantId || !regName || !regUser || !regCareer || !regEmail || !regPass) return showAuthError("Campos obligatorios.");

  const btn = document.getElementById('btnRegBtn');
  const originalText = btn.innerHTML; btn.innerHTML = '⏳ Creando...'; btn.disabled = true;

  try {
    localStorage.setItem('psico_tenant_id', tenantId);
    const res = await apiFetch('/api/auth/register', {
      method: 'POST', body: JSON.stringify({ fullName: regName, username: regUser, career: regCareer, email: regEmail, password: regPass, recoveryWord: regRecovery })
    });
    let data; try { data = await res.json(); } catch(err) { throw new Error(); }
    if (!res.ok) {
      localStorage.removeItem('psico_tenant_id'); showAuthError(data.error || "Institución inactiva o no encontrada. Créala primero.");
      btn.innerHTML = originalText; btn.disabled = false; return;
    }
    btn.innerHTML = originalText; btn.disabled = false; enterApp(data.user);
  } catch (e) { showAuthError('Error al registrar.'); btn.innerHTML = originalText; btn.disabled = false; }
};

window.recoverPassword = async function() {
  const t = document.getElementById('resetTenant').value.trim();
  const u = document.getElementById('resetUsername').value.trim();
  const w = document.getElementById('resetWord').value.trim();
  const p = document.getElementById('resetNewPass').value;
  if(!t || !u || !w || !p) return alert("Llena todos los campos.");
  
  localStorage.setItem('psico_tenant_id', t);
  try {
    const res = await apiFetch('/api/auth/reset-password', { method: 'POST', body: JSON.stringify({username: u, recoveryWord: w, newPassword: p}) });
    const data = await res.json();
    if(res.ok) { alert(data.message); document.getElementById('modalForgotPass').classList.add('hidden'); } 
    else { alert(data.error); }
  } catch(e) { alert("Error al recuperar."); }
};

window.changeUserPassword = async function() {
  const oldP = document.getElementById('changePassOld').value;
  const newP = document.getElementById('changePassNew').value;
  if(!oldP || !newP) return alert("Llena ambos campos.");
  try {
    const res = await apiFetch('/api/user/change-password', { method: 'POST', body: JSON.stringify({ username: currentUser.username, oldPassword: oldP, newPassword: newP }) });
    const data = await res.json();
    if(res.ok) { alert("Contraseña actualizada."); document.getElementById('modalChangePass').classList.add('hidden'); } 
    else { alert(data.error); }
  } catch(e) { alert("Error de red."); }
};

window.enterApp = function(user) {
  currentUser = user;
  localStorage.setItem('psico_active_user', user.username);
  const lastSubj = localStorage.getItem(`psico_subj_${user.username}`);
  activeSubjectId = (user.subjects.find(s => s.id === lastSubj) ? lastSubj : user.subjects[0]?.id) || null;
  
  document.getElementById('authScreen').classList.add('hidden');
  document.getElementById('appScreen').classList.remove('hidden');
  
  const btnAdmin = document.getElementById('btnAdminPanel');
  if(btnAdmin) { btnAdmin.classList.toggle('hidden', user.role !== 'admin'); }
  renderDashboard();
};

window.logout = function() { 
  currentUser = null; 
  localStorage.removeItem('psico_active_user'); 
  localStorage.removeItem('psico_tenant_id');
  location.reload(); 
};

// ==========================================
// 4. TOKENS Y PANEL ADMIN
// ==========================================
window.requestMoreTokens = async function() {
  if(!confirm("¿Solicitar más Saldo al Master?")) return;
  try {
    const res = await apiFetch('/api/user/request-tokens', { method:'POST', body: JSON.stringify({username: currentUser.username}) });
    if(res.ok) { alert("✅ Solicitud enviada."); currentUser.pendingTokenRequest = true; renderDashboard(); }
  } catch(e) { alert("Error."); }
};

window.loadAdminUsers = async function() {
  try {
    const res = await apiFetch('/api/admin/users', { headers: {'x-user': currentUser.username} });
    const users = await res.json();
    const tbody = document.getElementById('adminUsersTableBody');
    if(!tbody) return;
    
    tbody.innerHTML = users.map(u => {
      const remaining = (u.aiAllowanceUSD - u.aiConsumptionUSD).toFixed(2);
      const reqBadge = u.pendingTokenRequest ? `<span class="px-2 py-0.5 bg-rose-500 text-white text-[10px] rounded-full font-black animate-pulse ml-2">Pide Saldo</span>` : '';
      return `
      <tr class="hover:bg-slate-800 transition border-b border-slate-800">
        <td class="px-6 py-4 font-bold text-white">${u.username} <br> <span class="text-xs text-slate-400">${u.email}</span> ${reqBadge}</td>
        <td class="px-6 py-4">${u.career}</td>
        <td class="px-6 py-4 font-black ${remaining < 1 ? 'text-red-400' : 'text-emerald-400'}">$${remaining}</td>
        <td class="px-6 py-4 flex gap-2">
          <button onclick="adminAddTokens('${u.username}')" class="px-3 py-2 bg-emerald-600 hover:bg-emerald-500 rounded-lg text-white text-xs font-black">+ $5</button>
          <button onclick="adminResetPass('${u.username}')" class="px-3 py-2 bg-rose-600 hover:bg-rose-500 rounded-lg text-white text-xs font-black">Reset</button>
        </td>
      </tr>`;
    }).join('');
  } catch(e) { console.error(e); }
};

window.adminCreateUser = async function(e) {
  e.preventDefault();
  const n = document.getElementById('adminNewName').value.trim();
  const u = document.getElementById('adminNewUser').value.trim();
  const p = document.getElementById('adminNewPass').value;
  const c = document.getElementById('adminNewCareer').value.trim();
  const t = document.getElementById('adminNewTokens').value;
  try {
    const res = await apiFetch('/api/admin/create-user', { method: 'POST', headers: {'x-user': currentUser.username}, body: JSON.stringify({ fullName: n, username: u, password: p, career: c, initialTokens: t }) });
    if(res.ok) { alert('Creado.'); document.getElementById('adminCreateUserForm').reset(); loadAdminUsers(); } 
    else { alert((await res.json()).error); }
  } catch(err) { alert('Error.'); }
};

window.adminAddTokens = async function(username) {
  try {
    await apiFetch('/api/admin/add-tokens', { method:'POST', headers:{'x-user': currentUser.username}, body: JSON.stringify({targetUsername: username, amount: 5.00}) });
    loadAdminUsers();
  } catch(e) { alert("Error."); }
};

window.adminResetPass = async function(username) {
  const newP = prompt(`Nueva contraseña para ${username}:`);
  if(!newP) return;
  try {
    await apiFetch('/api/admin/force-reset', { method:'POST', headers:{'x-user': currentUser.username}, body: JSON.stringify({targetUsername: username, newPassword: newP}) });
    alert(`Actualizada.`);
  } catch(e) { alert("Error."); }
};

// ==========================================
// 5. RENDERIZADO DEL DASHBOARD
// ==========================================
window.renderDashboard = function() {
  document.getElementById('careerTitleBanner').textContent = `Entorno: ${currentUser.career || 'Universitario'}`;
  document.getElementById('userHeaderInfo').innerHTML = `👤 <b>${currentUser.fullName}</b> | Inst: ${localStorage.getItem('psico_tenant_id')}`;
  
  const balance = (currentUser.aiAllowanceUSD - currentUser.aiConsumptionUSD).toFixed(2);
  const billingEl = document.getElementById('aiBilling');
  if(billingEl) {
    billingEl.textContent = `$${balance} USD`;
    billingEl.className = balance < 1.00 ? "text-red-400 text-sm font-black animate-pulse" : "text-emerald-400 text-sm font-black";
  }

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
  
  document.getElementById('savedDocsList').innerHTML = docs.length === 0 
    ? `<p class="text-xs text-slate-500 italic p-3 border border-dashed border-slate-700 rounded-xl text-center">Repositorio vacío.</p>` 
    : docs.map(d => `
      <div class="flex items-center justify-between px-4 py-3 rounded-xl bg-slate-900 border border-indigo-500/30 text-sm gap-3 shadow-sm hover:border-indigo-400 transition">
        <div class="truncate text-slate-200 font-bold flex-1">📄 ${d.title}</div>
        <div class="flex gap-2">
          <button onclick="openImmersiveBook('${d.id}')" class="text-cyan-400 font-black hover:text-cyan-300 bg-cyan-950/50 px-3 py-1 rounded-lg transition">📖 Leer 3D</button>
          <button onclick="deleteSavedDoc('${d.id}')" class="text-red-400 font-black hover:text-red-300 bg-red-950/50 px-2 py-1 rounded-lg">🗑️</button>
        </div>
      </div>
    `).join('');

  document.getElementById('selectDocForAI').innerHTML = `<option value="ALL">📚 USAR TODOS (${docs.length})</option>` + docs.map(d => `<option value="${d.id}">📄 ${d.title}</option>`).join('');
  document.getElementById('audiobookDocSelect').innerHTML = `<option value="">-- Elige Libro --</option>` + docs.map(d => `<option value="${d.id}">📖 ${d.title}</option>`).join('');

  document.getElementById('savedHistoryList').innerHTML = (subj.storybooks || []).slice().reverse().map(sb => `
    <div class="p-3.5 rounded-xl bg-slate-900 border border-indigo-500/30 flex justify-between items-center text-sm shadow-sm hover:border-cyan-500 transition">
      <div onclick='openStorybook(${JSON.stringify(sb).replace(/'/g, "&#39;")})' class="cursor-pointer truncate flex-1 text-slate-200 font-black hover:text-cyan-300">📖 ${sb.title}</div>
      <button onclick="deleteSavedStorybook('${sb.id}')" class="text-red-400 ml-3 font-black bg-red-950/50 px-2 py-1 rounded-lg">🗑️</button>
    </div>
  `).join('') || '<p class="text-xs text-slate-500 italic p-3 border border-dashed border-slate-700 rounded-xl text-center">Sin monografías.</p>';

  document.getElementById('savedAudiobooksList').innerHTML = (subj.audiobooks || []).slice().reverse().map(ab => `
    <div class="p-3.5 rounded-xl bg-slate-900 border border-rose-500/30 flex justify-between items-center text-sm shadow-sm hover:border-rose-500 transition">
      <div onclick='openSavedAudiobook(${JSON.stringify(ab).replace(/'/g, "&#39;")})' class="cursor-pointer truncate flex-1 text-slate-200 font-black hover:text-rose-300">🎧 ${ab.audiobookTitle}</div>
      <button onclick="deleteSavedAudiobook('${ab.id}')" class="text-red-400 ml-3 font-black bg-red-950/50 px-2 py-1 rounded-lg">🗑️</button>
    </div>
  `).join('') || '<p class="text-xs text-slate-500 italic p-3 border border-dashed border-slate-700 rounded-xl text-center">Sin audiolibros.</p>';

  if (document.getElementById('savedPresentationsList')) {
    document.getElementById('savedPresentationsList').innerHTML = (subj.presentations || []).slice().reverse().map(p => `
      <div class="p-3.5 rounded-xl bg-slate-900 border border-orange-500/30 flex justify-between items-center text-sm shadow-sm hover:border-orange-500 transition">
        <div onclick='openPresentation(${JSON.stringify(p).replace(/'/g, "&#39;")})' class="cursor-pointer truncate flex-1 text-slate-200 font-black hover:text-orange-300">📊 ${p.presentationTitle}</div>
        <button onclick="deleteSavedPresentation('${p.id}')" class="text-red-400 ml-3 font-black bg-red-950/50 px-2 py-1 rounded-lg">🗑️</button>
      </div>
    `).join('') || '<p class="text-xs text-slate-500 italic p-3 border border-dashed border-slate-700 rounded-xl text-center">Sin presentaciones.</p>';
  }
};

window.selectSubject = function(id) { activeSubjectId = id; localStorage.setItem(`psico_subj_${currentUser.username}`, id); document.getElementById('viewerArea').classList.add('hidden'); renderDashboard(); };
window.createNewSubject = async function() {
  const name = document.getElementById('newSubjName').value.trim();
  if (!name) return alert("Nombre obligatorio.");
  try {
    const res = await apiFetch('/api/subjects', { method: 'POST', body: JSON.stringify({ username: currentUser.username, name: name, schedule: document.getElementById('newSubjSchedule').value }) });
    const data = await res.json();
    if (res.ok) { currentUser = data.user; activeSubjectId = data.newSubjectId; document.getElementById('modalSubject').classList.add('hidden'); renderDashboard(); }
  } catch(e) { alert("Error."); }
};
window.deleteActiveSubject = async function() {
  if (!activeSubjectId || !confirm('¿Borrar materia y documentos?')) return;
  try {
    const res = await apiFetch(`/api/subjects/${activeSubjectId}`, { method: 'DELETE', body: JSON.stringify({ username: currentUser.username }) });
    const data = await res.json();
    if (res.ok) { currentUser = data.user; activeSubjectId = currentUser.subjects[0]?.id || null; document.getElementById('viewerArea').classList.add('hidden'); renderDashboard(); }
  } catch(e) { alert("Error."); }
};

// ==========================================
// 6. GESTIÓN DE ARCHIVOS Y DOCUMENTOS
// ==========================================
window.handleUploadDoc = async function(e) {
  e.preventDefault();
  const btn = document.getElementById('btnUploadDoc');
  const originalText = btn.innerHTML; btn.innerHTML = '⏳ Subiendo...'; btn.disabled = true;
  const fd = new FormData();
  fd.append('username', currentUser.username); fd.append('subjectId', activeSubjectId);
  fd.append('docTitle', document.getElementById('docTitle').value); fd.append('youtubeUrl', document.getElementById('youtubeUrlInput').value);
  const files = document.getElementById('docFiles').files;
  for (let i = 0; i < files.length; i++) { fd.append('documents', files[i]); }
  try {
    const res = await apiFetch('/api/documents', { method: 'POST', body: fd });
    const data = await res.json();
    if (res.ok) { currentUser = data.user; document.getElementById('docTitle').value = ''; document.getElementById('docFiles').value = ''; document.getElementById('selectedFilesPreview').textContent = ''; document.getElementById('youtubeUrlInput').value = ''; renderDashboard(); alert('¡Material guardado!'); } 
    else { alert(data.error); }
  } catch (err) { alert('Error.'); } finally { btn.innerHTML = originalText; btn.disabled = false; }
};
window.deleteSavedDoc = async function(id) {
  if (!confirm('¿Borrar documento?')) return;
  try { const res = await apiFetch(`/api/documents/${id}`, { method: 'DELETE', body: JSON.stringify({ username: currentUser.username, subjectId: activeSubjectId }) }); if (res.ok) { currentUser = (await res.json()).user; renderDashboard(); } } catch(e) {}
};
window.clearAllSubjectDocs = async function() {
  if (!confirm('¿Vaciar repositorio?')) return;
  try { const res = await apiFetch(`/api/subjects/${activeSubjectId}/documents`, { method: 'DELETE', body: JSON.stringify({ username: currentUser.username }) }); if (res.ok) { currentUser = (await res.json()).user; renderDashboard(); } } catch(e) {}
};
window.deleteSavedStorybook = async function(sbId) {
  if (!confirm('¿Borrar monografía?')) return;
  try { const res = await apiFetch(`/api/storybooks/${sbId}`, { method: 'DELETE', body: JSON.stringify({ username: currentUser.username, subjectId: activeSubjectId }) }); if (res.ok) { currentUser = (await res.json()).user; renderDashboard(); } } catch(e) {}
};
window.deleteSavedAudiobook = async function(abId) {
  if (!confirm('¿Borrar audiolibro?')) return;
  try { const res = await apiFetch(`/api/audiobooks/${abId}`, { method: 'DELETE', body: JSON.stringify({ username: currentUser.username, subjectId: activeSubjectId }) }); if (res.ok) { currentUser = (await res.json()).user; renderDashboard(); } } catch(e) {}
};
window.deleteSavedPresentation = async function(id) {
  if (!confirm('¿Borrar presentación?')) return;
  try { const res = await apiFetch(`/api/presentations/${id}`, { method: 'DELETE', body: JSON.stringify({ username: currentUser.username, subjectId: activeSubjectId }) }); if (res.ok) { currentUser = (await res.json()).user; renderDashboard(); } } catch(e) {}
};

// ==========================================
// 7. EXPORTACIÓN APA OFICIAL A WORD
// ==========================================
window.exportToWord = function(title, contentHtml) {
  const htmlContent = `
    <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
    <head>
      <meta charset='utf-8'>
      <title>${title}</title>
      <style>
        body { font-family: 'Times New Roman', serif; line-height: 2.0; color: #000; font-size: 12pt; text-align: justify; }
        p { text-indent: 0.5in; margin-bottom: 0; }
        h1, h2 { text-align: center; font-weight: bold; }
        table { border-collapse: collapse; width: 100%; margin: 20px 0; font-size: 10pt; }
        th, td { border-left: none; border-right: none; padding: 8px; text-align: left; }
        th { border-top: 2px solid #000; border-bottom: 1px solid #000; }
        tr:last-child td { border-bottom: 2px solid #000; }
      </style>
    </head>
    <body>${contentHtml}</body>
    </html>`;
  const blob = new Blob(['\ufeff' + htmlContent], { type: 'application/msword' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${title}.doc`; 
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
};

window.closeFullScreenViewer = function() {
  document.getElementById('viewerArea').classList.add('hidden');
  document.getElementById('viewerArea').innerHTML = '';
};

// ==========================================
// 8. CEREBRO DE IA (FASE 6: RAG, APA, INVESTIGACIÓN, SIMULADOR)
// ==========================================

// 1. TUTOR RAG (ANTI-ALUCINACIONES)
window.askTutor = async function() {
  const query = document.getElementById('tutorInput').value.trim();
  const docId = document.getElementById('selectDocForAI').value;
  if (!query) return alert("Escribe tu duda.");
  
  const box = document.getElementById('tutorResponse');
  box.innerHTML = `<span class="animate-pulse text-cyan-400 font-bold">🔍 Buscando en literatura y citando fuente...</span>`;
  try {
    const res = await apiFetch('/api/tutor-rag', { method: 'POST', body: JSON.stringify({ username: currentUser.username, subjectId: activeSubjectId, documentId: docId, query }) });
    const data = await res.json();
    if (res.ok) { box.innerHTML = `<b class="text-cyan-300">Tutor RAG:</b><br><br>${data.explanation}`; renderDashboard(); } 
    else box.innerHTML = `<span class="text-red-400">${data.error}</span>`;
  } catch (e) { box.innerHTML = "Error de red."; }
};

// 2. CREADOR APA CON TABLAS
window.generateAPATask = async function() {
  const topic = document.getElementById('apaTopic').value.trim();
  if (!topic) return alert("Escribe el tema.");
  const btn = document.getElementById('btnAPA'); btn.innerText = "Redactando APA..."; btn.disabled = true;
  try {
    const res = await apiFetch('/api/generate-apa-advanced', { method: 'POST', body: JSON.stringify({ username: currentUser.username, subjectId: activeSubjectId, topic }) });
    const data = await res.json();
    if (res.ok) {
      document.getElementById('modalAPA').classList.add('hidden');
      exportToWord(`Ensayo_APA_${topic.substring(0,10)}`, data.apaDocument); renderDashboard();
    } else alert(data.error);
  } catch (e) { alert("Error al generar."); }
  finally { btn.innerText = "Redactar"; btn.disabled = false; }
};

// 3. INVESTIGACIÓN ILIMITADA (AGENTE ITERATIVO CON PRE-AUDITORÍA)
window.startUnlimitedResearch = async function() {
  const topic = document.getElementById('researchTopic').value.trim();
  if (!topic) return alert("Define el tema.");
  
  const btn = document.getElementById('btnResearch');
  const statusEl = document.getElementById('researchStatus');
  const barEl = document.getElementById('researchBar');
  
  btn.classList.add('hidden'); document.getElementById('researchProgress').classList.remove('hidden');
  
  try {
    statusEl.innerText = "1/2: Diseñando Índice...";
    let res = await apiFetch('/api/research/outline', { method: 'POST', body: JSON.stringify({ username: currentUser.username, topic }) });
    let data = await res.json();
    if (!res.ok) throw new Error(data.error);
    
    const chapters = data.outline;
    let fullDocumentHTML = `<div style="text-align:center;"><h1>Tesis: ${topic}</h1><br><p>Agente IA Anti-Plagio</p></div><br><hr><br>`;
    let previousSummary = "";

    for (let i = 0; i < chapters.length; i++) {
      statusEl.innerText = `2/2: Escribiendo Cap ${i + 1} de ${chapters.length}...`;
      barEl.style.width = `${((i + 1) / chapters.length) * 100}%`;
      res = await apiFetch('/api/research/chapter', { method: 'POST', body: JSON.stringify({ username: currentUser.username, topic, chapterTitle: chapters[i], previousChapterSummary: previousSummary }) });
      data = await res.json();
      if (!res.ok) throw new Error(data.error);
      fullDocumentHTML += `<h1>Capítulo ${i + 1}: ${chapters[i]}</h1>\n${data.chapterContent}\n<br><br>`;
      previousSummary = `El capítulo anterior trató sobre ${chapters[i]}.`;
    }
    exportToWord(`Investigacion_${topic.substring(0,15)}`, fullDocumentHTML);
    alert("¡Investigación generada con éxito!");
    document.getElementById('modalResearch').classList.add('hidden'); renderDashboard();
  } catch (e) { alert("Error: " + e.message); } 
  finally {
    btn.classList.remove('hidden'); document.getElementById('researchProgress').classList.add('hidden');
    barEl.style.width = "0%"; btn.innerText = "Iniciar Agente";
  }
};

// 4. SIMULADOR DE CASOS CLÍNICOS (ROLEPLAY)
let clinicalSimulatorHistory = '';
window.sendSimulatorMessage = async function() {
  const input = document.getElementById('simulatorInput'); 
  const msg = input.value.trim(); if (!msg) return;
  const box = document.getElementById('simulatorChatBox'); 
  const docId = document.getElementById('selectDocForAI').value;
  
  box.innerHTML += `<div class="p-4 rounded-2xl bg-slate-800 text-right text-slate-200 font-medium ml-12 shadow-sm border border-slate-700"><b>Psicólogo:</b> ${msg}</div>`;
  input.value = ''; clinicalSimulatorHistory += `\nPsicólogo: ${msg}`;
  try {
    const res = await apiFetch('/api/clinical-simulator', { method: 'POST', body: JSON.stringify({ username: currentUser.username, subjectId: activeSubjectId, documentId: docId, message: msg, history: clinicalSimulatorHistory }) });
    const data = await res.json();
    if (res.ok) {
      clinicalSimulatorHistory += `\nPaciente: ${data.reply}`;
      box.innerHTML += `<div class="p-4 rounded-2xl bg-rose-950/90 border border-rose-800 text-rose-100 font-medium mr-12 shadow-md"><b>Paciente:</b> ${data.reply}</div>`;
      box.scrollTop = box.scrollHeight;
    }
  } catch (e) { alert('Error.'); }
};

// ==========================================
// 9. FASE 4 Y 5: VISUALES, MERMAID Y SLIDES
// ==========================================
window.askRealistPhilosophy = async function() {
  const query = document.getElementById('filosofiaInput').value.trim();
  if (!query) return alert("Ingresa un tema.");
  const v = document.getElementById('viewerArea'); v.classList.add('fullscreen-mode'); v.classList.remove('hidden');
  document.getElementById('modalFilosofia').classList.add('hidden');
  v.innerHTML = `<div class="text-center pt-32 animate-pulse"><span class="text-6xl">🏛️</span><p class="text-amber-300 font-black text-2xl uppercase mt-4">Analizando bajo Tomismo...</p></div>`;
  try {
    const res = await apiFetch('/api/philosophy-realism', { method: 'POST', body: JSON.stringify({ username: currentUser.username, query }) });
    const data = await res.json();
    v.innerHTML = `<div class="max-w-5xl mx-auto glass-edu rounded-3xl p-10 space-y-6 border-2 border-amber-500 mt-10 relative shadow-2xl"><button onclick="closeFullScreenViewer()" class="absolute top-6 right-6 px-5 py-3 rounded-2xl bg-slate-800 text-white font-bold">✕ Cerrar</button><h2 class="text-3xl font-black text-amber-300 border-b border-amber-500/30 pb-4">Síntesis Filosófica</h2><div class="bg-slate-900 p-8 rounded-2xl text-slate-100 whitespace-pre-wrap">${data.answer}</div></div>`;
  } catch (err) { alert('Error.'); closeFullScreenViewer(); }
};

window.generateGlossary = async function() {
  const docId = document.getElementById('selectDocForAI').value;
  const v = document.getElementById('viewerArea'); v.classList.add('fullscreen-mode'); v.classList.remove('hidden');
  v.innerHTML = `<div class="text-center pt-32 animate-pulse"><span class="text-6xl">📕</span><p class="text-indigo-300 font-black text-2xl uppercase mt-4">Extrayendo Glosario...</p></div>`;
  try {
    const res = await apiFetch('/api/generate-glossary', { method: 'POST', body: JSON.stringify({ username: currentUser.username, subjectId: activeSubjectId, documentId: docId }) });
    const data = await res.json();
    const g = data.glossary;
    v.innerHTML = `<div class="max-w-5xl mx-auto glass-edu rounded-3xl p-10 border-2 border-indigo-500 mt-10 relative"><button onclick="closeFullScreenViewer()" class="absolute top-6 right-6 px-5 py-3 rounded-2xl bg-slate-800 text-white font-bold">✕ Cerrar</button><h2 class="text-3xl font-black text-indigo-300 mb-8 border-b border-indigo-500/30 pb-4">📕 ${g.glossaryTitle || 'Glosario'}</h2><div class="grid grid-cols-1 md:grid-cols-2 gap-4">${g.terms.map(t => `<div class="p-4 bg-slate-900 border border-indigo-500/40 rounded-xl"><b class="text-indigo-300 text-lg">${t.term}</b><p class="text-slate-300 text-sm mt-2">${t.definition}</p></div>`).join('')}</div></div>`;
  } catch (err) { alert('Error.'); closeFullScreenViewer(); }
};

window.generateMindMap = async function() {
  const docId = document.getElementById('selectDocForAI').value;
  const v = document.getElementById('viewerArea'); v.classList.add('fullscreen-mode'); v.classList.remove('hidden');
  v.innerHTML = `<div class="text-center pt-32 animate-pulse"><span class="text-6xl">🧠</span><p class="text-teal-300 font-black text-2xl uppercase mt-4">Construyendo Mapa Mermaid...</p></div>`;
  try {
    const res = await apiFetch('/api/generate-mindmap', { method: 'POST', body: JSON.stringify({ username: currentUser.username, subjectId: activeSubjectId, documentId: docId }) });
    const data = await res.json();
    v.innerHTML = `<div class="max-w-6xl mx-auto glass-edu rounded-3xl p-10 border-2 border-teal-500 mt-10 relative"><button onclick="closeFullScreenViewer()" class="absolute top-6 right-6 px-5 py-3 rounded-2xl bg-slate-800 text-white font-bold z-50">✕ Cerrar</button><h2 class="text-3xl font-black text-teal-300 mb-8 border-b border-teal-500/30 pb-4">🧠 Mapa Conceptual</h2><div class="bg-slate-900 p-4 rounded-xl overflow-auto flex justify-center"><div class="mermaid">${data.mermaidCode}</div></div></div>`;
    setTimeout(() => { mermaid.init(undefined, document.querySelectorAll('.mermaid')); }, 100);
  } catch (err) { alert('Error.'); closeFullScreenViewer(); }
};

window.generatePresentation = async function() {
  const docId = document.getElementById('selectDocForAI').value;
  const v = document.getElementById('viewerArea'); v.classList.add('fullscreen-mode'); v.classList.remove('hidden');
  v.innerHTML = `<div class="text-center pt-32 animate-pulse"><span class="text-6xl">📊</span><p class="text-orange-300 font-black text-2xl uppercase mt-4">Construyendo Diapositivas...</p></div>`;
  try {
    const res = await apiFetch('/api/generate-presentation', { method: 'POST', body: JSON.stringify({ username: currentUser.username, subjectId: activeSubjectId, documentId: docId }) });
    const data = await res.json();
    if (res.ok) { currentUser = data.user; renderDashboard(); openPresentation(data.presentation); }
    else { alert(data.error); closeFullScreenViewer(); }
  } catch (err) { alert('Error.'); closeFullScreenViewer(); }
};

window.openPresentation = function(pres) {
  const v = document.getElementById('viewerArea'); v.classList.add('fullscreen-mode'); v.classList.remove('hidden');
  let currentSlide = 0;
  window.renderSlide = function() {
    const slide = pres.slides[currentSlide];
    let contentHtml = slide.type === 'trivia' ? `
      <div class="space-y-4"><h3 class="text-2xl font-black text-amber-400 text-center mb-6">🤔 ${slide.content}</h3>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        ${(slide.options || []).map((opt, i) => `<button onclick="alert('${i === slide.correctIndex ? '✅ CORRECTO!' : '❌ INCORRECTO.'} \\n\\n${slide.explanation}')" class="p-4 bg-slate-800 border border-indigo-500/40 rounded-xl text-slate-200 font-bold hover:bg-indigo-900 transition">${opt}</button>`).join('')}
      </div></div>` : `<p class="text-lg text-slate-200 leading-relaxed font-medium text-justify whitespace-pre-wrap">${slide.content}</p>`;

    v.innerHTML = `
      <div class="max-w-5xl mx-auto glass-edu rounded-3xl p-10 space-y-6 border-2 border-orange-500 mt-10 relative shadow-2xl min-h-[500px] flex flex-col justify-between">
        <button onclick="closeFullScreenViewer()" class="absolute top-6 right-6 px-5 py-3 rounded-2xl bg-slate-800 text-white font-bold z-50">✕ Cerrar</button>
        <div>
          <div class="flex justify-between items-center border-b border-orange-500/30 pb-4 mb-6"><h2 class="text-2xl font-black text-orange-300">📊 ${pres.presentationTitle}</h2><span class="px-3 py-1 rounded-full bg-slate-800 text-slate-300 text-xs font-black">Slide ${currentSlide + 1} / ${pres.slides.length}</span></div>
          <h1 class="text-3xl font-black text-white mb-6 text-center">${slide.title}</h1>
          ${contentHtml}
        </div>
        <div class="flex justify-between items-center pt-6 border-t border-slate-700/50">
          <button onclick="prevSlide()" class="px-6 py-3 rounded-xl bg-slate-800 text-white font-black ${currentSlide === 0 ? 'opacity-50' : ''}">⬅ Anterior</button>
          <button onclick="nextSlide()" class="px-6 py-3 rounded-xl bg-orange-600 text-white font-black ${currentSlide === pres.slides.length - 1 ? 'opacity-50' : ''}">Siguiente ➡</button>
        </div>
      </div>`;
  };
  window.prevSlide = () => { if (currentSlide > 0) { currentSlide--; renderSlide(); } };
  window.nextSlide = () => { if (currentSlide < pres.slides.length - 1) { currentSlide++; renderSlide(); } };
  renderSlide();
};

window.generateAudiobook = async function() {
  const selectedDocId = document.getElementById('audiobookDocSelect').value;
  if(!selectedDocId) return alert('Elige libro.');
  const v = document.getElementById('viewerArea'); v.classList.add('fullscreen-mode'); v.classList.remove('hidden');
  v.innerHTML = `<div class="text-center pt-32 animate-pulse"><span class="text-6xl">🎧</span><p class="text-rose-400 font-black text-2xl uppercase mt-4">Extrayendo Audiolibro...</p></div>`;
  try {
    const res = await apiFetch('/api/audiobook-chapters', { method: 'POST', body: JSON.stringify({ username: currentUser.username, subjectId: activeSubjectId, documentId: selectedDocId }) });
    const data = await res.json();
    currentUser = data.user; renderDashboard(); openSavedAudiobook(data.audiobook);
  } catch (err) { alert('Error.'); closeFullScreenViewer(); }
};

window.openSavedAudiobook = function(ab) {
  const v = document.getElementById('viewerArea'); v.classList.add('fullscreen-mode'); v.classList.remove('hidden');
  window.currentAudiobookSummary = ab.bookSummary || ''; window.currentAudiobookTitle = ab.audiobookTitle || 'Libro';
  let currentChapterIdx = 0;
  function playCurrentChapter() {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const rawText = `${ab.chapters[currentChapterIdx].chapterTitle}. ${ab.chapters[currentChapterIdx].chapterContent}`;
    const utterance = new SpeechSynthesisUtterance(cleanTextForAudio(rawText));
    utterance.lang = 'es-ES';
    utterance.onend = () => { if (currentChapterIdx < ab.chapters.length - 1) { currentChapterIdx++; renderAudiobookUI(); playCurrentChapter(); } };
    window.speechSynthesis.speak(utterance);
  }
  window.jumpToChapter = (idx) => { currentChapterIdx = idx; renderAudiobookUI(); playCurrentChapter(); };
  function renderAudiobookUI() {
    v.innerHTML = `<div class="max-w-6xl mx-auto glass-edu rounded-3xl p-8 space-y-6 border-2 border-rose-500 relative shadow-2xl mt-4"><button onclick="closeFullScreenViewer(); window.speechSynthesis.cancel();" class="absolute top-6 right-6 px-5 py-3 rounded-2xl bg-red-950 text-red-300 font-bold z-10">✕ Cerrar</button><h2 class="text-3xl font-black text-rose-300">${ab.audiobookTitle}</h2><div class="grid grid-cols-1 lg:grid-cols-3 gap-8 pt-4"><div class="space-y-3 max-h-[500px] overflow-y-auto pr-3">${ab.chapters.map((ch, idx) => `<button onclick="jumpToChapter(${idx})" class="w-full text-left p-4 rounded-xl text-sm font-bold ${idx === currentChapterIdx ? 'bg-rose-900 text-white' : 'bg-slate-900 text-slate-400'}">${ch.chapterTitle}</button>`).join('')}</div><div class="lg:col-span-2 bg-slate-900 p-8 rounded-3xl max-h-[500px] overflow-y-auto text-slate-200 whitespace-pre-wrap">${ab.chapters[currentChapterIdx].chapterContent}</div></div></div>`;
  }
  renderAudiobookUI(); playCurrentChapter();
};
