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
// 3. FUNCIONES DE AUTENTICACIÓN Y VALIDACIÓN
// ==========================================
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
};

window.showAuthError = function(msg) { 
  const el = document.getElementById('authError'); 
  el.textContent = msg; 
  el.classList.remove('hidden'); 
};

window.handleLogin = async function(e) {
  e.preventDefault();
  const tenantId = document.getElementById('loginTenant').value.trim();
  const loginId = document.getElementById('loginId').value.trim();
  const loginPass = document.getElementById('loginPass').value;

  if (!tenantId || !loginId || !loginPass) return showAuthError("Llena todos los campos.");

  const btn = document.getElementById('btnLoginBtn');
  const originalText = btn.innerHTML;
  btn.innerHTML = '⏳ Conectando...'; btn.disabled = true;
  document.getElementById('authError').classList.add('hidden');

  try {
    localStorage.setItem('psico_tenant_id', tenantId);
    const res = await apiFetch('/api/auth/login', { method: 'POST', body: JSON.stringify({ identifier: loginId, password: loginPass }) });
    let data; try { data = await res.json(); } catch(err) { throw new Error(); }
    if (!res.ok) {
      localStorage.removeItem('psico_tenant_id'); showAuthError(data.error || "Error al iniciar sesión.");
      btn.innerHTML = originalText; btn.disabled = false; return;
    }
    btn.innerHTML = originalText; btn.disabled = false; enterApp(data.user);
  } catch (e) { 
    showAuthError('Error de red.'); btn.innerHTML = originalText; btn.disabled = false;
  }
};

window.handleRegister = async function(e) {
  e.preventDefault();
  const tenantId = document.getElementById('regTenant').value.trim();
  const regName = document.getElementById('regName').value.trim();
  const regUser = document.getElementById('regUser').value.trim();
  const regCareer = document.getElementById('regCareer').value.trim();
  const regEmail = document.getElementById('regEmail').value.trim();
  const regPass = document.getElementById('regPass').value;
  const regRecovery = document.getElementById('regRecovery') ? document.getElementById('regRecovery').value.trim() : 'clave123';

  if (!tenantId || !regName || !regUser || !regCareer || !regEmail || !regPass) return showAuthError("Todos los campos son obligatorios.");
  if (regUser.includes(" ")) return showAuthError("El usuario no debe contener espacios.");
  if (regPass.length < 6) return showAuthError("La contraseña debe tener al menos 6 caracteres.");

  const btn = document.getElementById('btnRegBtn');
  const originalText = btn.innerHTML; btn.innerHTML = '⏳ Creando perfil...'; btn.disabled = true;

  try {
    localStorage.setItem('psico_tenant_id', tenantId);
    const res = await apiFetch('/api/auth/register', {
      method: 'POST', body: JSON.stringify({ fullName: regName, username: regUser, career: regCareer, email: regEmail, password: regPass, recoveryWord: regRecovery })
    });
    let data; try { data = await res.json(); } catch(err) { throw new Error(); }
    if (!res.ok) {
      localStorage.removeItem('psico_tenant_id'); showAuthError(data.error || "Error al registrar la cuenta.");
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
  } catch(e) { alert("Error al intentar recuperar."); }
};

window.changeUserPassword = async function() {
  const oldP = document.getElementById('changePassOld').value;
  const newP = document.getElementById('changePassNew').value;
  if(!oldP || !newP) return alert("Llena ambos campos para cambiar la contraseña.");
  try {
    const res = await apiFetch('/api/user/change-password', { method: 'POST', body: JSON.stringify({ username: currentUser.username, oldPassword: oldP, newPassword: newP }) });
    const data = await res.json();
    if(res.ok) {
      alert("Contraseña actualizada con éxito.");
      document.getElementById('modalChangePass').classList.add('hidden');
      document.getElementById('changePassOld').value = ''; document.getElementById('changePassNew').value = '';
    } else { alert(data.error); }
  } catch(e) { alert("Error al cambiar contraseña."); }
};

window.enterApp = function(user) {
  currentUser = user;
  localStorage.setItem('psico_active_user', user.username);
  const lastSubj = localStorage.getItem(`psico_subj_${user.username}`);
  activeSubjectId = (user.subjects.find(s => s.id === lastSubj) ? lastSubj : user.subjects[0]?.id) || null;
  
  document.getElementById('authScreen').classList.add('hidden');
  document.getElementById('appScreen').classList.remove('hidden');
  
  const btnAdmin = document.getElementById('btnAdminPanel');
  if(btnAdmin) {
    if(user.role === 'admin') btnAdmin.classList.remove('hidden');
    else btnAdmin.classList.add('hidden');
  }
  renderDashboard();
};

window.logout = function() { 
  currentUser = null; 
  localStorage.removeItem('psico_active_user'); 
  localStorage.removeItem('psico_tenant_id');
  location.reload(); 
};

// ==========================================
// 4. SISTEMA DE TOKENS IA Y ADMIN
// ==========================================
window.requestMoreTokens = async function() {
  if(!confirm("¿Solicitar más Saldo al Master?")) return;
  try {
    const res = await apiFetch('/api/user/request-tokens', { method:'POST', body: JSON.stringify({username: currentUser.username}) });
    if(res.ok) { alert("✅ Solicitud enviada."); currentUser.pendingTokenRequest = true; renderDashboard(); }
  } catch(e) { alert("Error al enviar solicitud."); }
};

window.loadAdminUsers = async function() {
  try {
    const res = await apiFetch('/api/admin/users', { headers: {'x-user': currentUser.username} });
    const users = await res.json();
    const tbody = document.getElementById('adminUsersTableBody');
    if(!tbody) return;
    
    tbody.innerHTML = users.map(u => {
      const remaining = (u.aiAllowanceUSD - u.aiConsumptionUSD).toFixed(2);
      const reqBadge = u.pendingTokenRequest ? `<span class="px-2 py-0.5 bg-rose-500 text-white text-[10px] rounded-full font-black animate-pulse ml-2">Solicita Saldo</span>` : '';
      return `
      <tr class="hover:bg-slate-800 transition border-b border-slate-800">
        <td class="px-6 py-4 font-bold text-white">${u.username} <br> <span class="text-xs text-slate-400 font-normal">${u.email}</span> ${reqBadge}</td>
        <td class="px-6 py-4">${u.career}</td>
        <td class="px-6 py-4 font-black ${remaining < 1 ? 'text-red-400' : 'text-emerald-400'}">$${remaining}</td>
        <td class="px-6 py-4 flex gap-2">
          <button onclick="adminAddTokens('${u.username}')" class="px-3 py-2 bg-emerald-600 hover:bg-emerald-500 rounded-lg text-white text-xs font-black shadow transition">+ $5 Saldo</button>
          <button onclick="adminResetPass('${u.username}')" class="px-3 py-2 bg-rose-600 hover:bg-rose-500 rounded-lg text-white text-xs font-black shadow transition">Reset Pass</button>
        </td>
      </tr>`;
    }).join('');
  } catch(e) { console.error("Error cargando usuarios master", e); }
};

window.adminCreateUser = async function(e) {
  e.preventDefault();
  const n = document.getElementById('adminNewName').value.trim();
  const u = document.getElementById('adminNewUser').value.trim();
  const p = document.getElementById('adminNewPass').value;
  const c = document.getElementById('adminNewCareer').value.trim();
  const t = document.getElementById('adminNewTokens') ? document.getElementById('adminNewTokens').value : '2.00';
  if (!n || !u || !p || !c || !t) return alert("Todos los campos son obligatorios.");
  try {
    const res = await apiFetch('/api/admin/create-user', { method: 'POST', headers: {'x-user': currentUser.username}, body: JSON.stringify({ fullName: n, username: u, password: p, career: c, initialTokens: t }) });
    const data = await res.json();
    if(res.ok) { alert('Alumno creado exitosamente.'); document.getElementById('adminCreateUserForm').reset(); loadAdminUsers(); } 
    else { alert(data.error); }
  } catch(err) { alert('Error al crear usuario.'); }
};

window.adminAddTokens = async function(username) {
  if(!confirm(`¿Añadir $5.00 USD a ${username}?`)) return;
  try {
    const res = await apiFetch('/api/admin/add-tokens', { method:'POST', headers:{'x-user': currentUser.username}, body: JSON.stringify({targetUsername: username, amount: 5.00}) });
    if (res.ok) { alert(`Saldo añadido a ${username}.`); loadAdminUsers(); }
  } catch(e) { alert("Error al añadir saldo."); }
};

window.adminResetPass = async function(username) {
  const newP = prompt(`NUEVA CONTRASEÑA para ${username}:`);
  if(!newP) return;
  try {
    await apiFetch('/api/admin/force-reset', { method:'POST', headers:{'x-user': currentUser.username}, body: JSON.stringify({targetUsername: username, newPassword: newP}) });
    alert(`Contraseña reseteada.`);
  } catch(e) { alert("Error al resetear contraseña."); }
};

// ==========================================
// 5. RENDERIZADO DEL DASHBOARD Y MATERIAS
// ==========================================
window.updateSelectedFilesList = function() {
  const input = document.getElementById('docFiles');
  document.getElementById('selectedFilesPreview').textContent = input.files.length > 0 ? `✅ ${input.files.length} archivo(s) listos.` : '';
};

window.renderDashboard = function() {
  document.getElementById('careerTitleBanner').textContent = `Entorno: ${currentUser.career || 'Universitario'}`;
  document.getElementById('userHeaderInfo').innerHTML = `👤 <b>${currentUser.fullName}</b> | Institución: ${localStorage.getItem('psico_tenant_id')}`;
  
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
  
  // Incluye el botón "Leer 3D"
  document.getElementById('savedDocsList').innerHTML = docs.length === 0 
    ? `<p class="text-xs text-slate-500 italic p-3 border border-dashed border-slate-700 rounded-xl text-center">Repositorio vacío.</p>` 
    : docs.map(d => `
      <div class="flex items-center justify-between px-4 py-3 rounded-xl bg-slate-900 border border-indigo-500/30 text-sm gap-3 shadow-sm hover:border-indigo-400 transition">
        <div class="truncate text-slate-200 font-bold flex-1">📄 ${d.title}</div>
        <div class="flex gap-2">
          <button onclick="openImmersiveBook('${d.id}')" class="text-cyan-400 font-black hover:text-cyan-300 bg-cyan-950/50 px-3 py-1 rounded-lg transition transform hover:scale-105">📖 Leer 3D</button>
          <button onclick="deleteSavedDoc('${d.id}')" class="text-red-400 font-black hover:text-red-300 bg-red-950/50 px-2 py-1 rounded-lg">🗑️</button>
        </div>
      </div>
    `).join('');

  document.getElementById('selectDocForAI').innerHTML = `<option value="ALL">📚 USAR TODOS LOS ARCHIVOS (${docs.length})</option>` + docs.map(d => `<option value="${d.id}">📄 ${d.title}</option>`).join('');
  document.getElementById('audiobookDocSelect').innerHTML = `<option value="">-- Elige el Libro Completo --</option>` + docs.map(d => `<option value="${d.id}">📖 ${d.title}</option>`).join('');

  document.getElementById('savedHistoryList').innerHTML = (subj.storybooks || []).slice().reverse().map(sb => `
    <div class="p-3.5 rounded-xl bg-slate-900 border border-indigo-500/30 flex justify-between items-center text-sm shadow-sm hover:border-cyan-500 transition">
      <div onclick='openStorybook(${JSON.stringify(sb).replace(/'/g, "&#39;")})' class="cursor-pointer truncate flex-1 text-slate-200 font-black hover:text-cyan-300">📖 ${sb.title}</div>
      <button onclick="deleteSavedStorybook('${sb.id}')" class="text-red-400 ml-3 font-black bg-red-950/50 px-2 py-1 rounded-lg">🗑️</button>
    </div>
  `).join('') || '<p class="text-xs text-slate-500 italic p-3 border border-dashed border-slate-700 rounded-xl text-center">Sin monografías aún.</p>';

  document.getElementById('savedAudiobooksList').innerHTML = (subj.audiobooks || []).slice().reverse().map(ab => `
    <div class="p-3.5 rounded-xl bg-slate-900 border border-rose-500/30 flex justify-between items-center text-sm shadow-sm hover:border-rose-500 transition">
      <div onclick='openSavedAudiobook(${JSON.stringify(ab).replace(/'/g, "&#39;")})' class="cursor-pointer truncate flex-1 text-slate-200 font-black hover:text-rose-300">🎧 ${ab.audiobookTitle}</div>
      <button onclick="deleteSavedAudiobook('${ab.id}')" class="text-red-400 ml-3 font-black bg-red-950/50 px-2 py-1 rounded-lg">🗑️</button>
    </div>
  `).join('') || '<p class="text-xs text-slate-500 italic p-3 border border-dashed border-slate-700 rounded-xl text-center">Sin audiolibros aún.</p>';
};

window.selectSubject = function(id) { activeSubjectId = id; localStorage.setItem(`psico_subj_${currentUser.username}`, id); document.getElementById('viewerArea').classList.add('hidden'); renderDashboard(); };
window.toggleNewSubjectModal = function() { document.getElementById('modalSubject').classList.toggle('hidden'); };
window.createNewSubject = async function() {
  const name = document.getElementById('newSubjName').value.trim();
  if (!name) return alert("Nombre obligatorio.");
  try {
    const res = await apiFetch('/api/subjects', { method: 'POST', body: JSON.stringify({ username: currentUser.username, name: name, schedule: document.getElementById('newSubjSchedule').value }) });
    const data = await res.json();
    if (res.ok) { currentUser = data.user; activeSubjectId = data.newSubjectId; toggleNewSubjectModal(); document.getElementById('newSubjName').value = ''; document.getElementById('newSubjSchedule').value = ''; renderDashboard(); }
  } catch(e) { alert("Error al crear materia."); }
};
window.deleteActiveSubject = async function() {
  if (!activeSubjectId || !confirm('¿Borrar esta materia y TODOS sus documentos permanentemente?')) return;
  try {
    const res = await apiFetch(`/api/subjects/${activeSubjectId}`, { method: 'DELETE', body: JSON.stringify({ username: currentUser.username }) });
    const data = await res.json();
    if (res.ok) { currentUser = data.user; activeSubjectId = currentUser.subjects[0]?.id || null; document.getElementById('viewerArea').classList.add('hidden'); renderDashboard(); }
  } catch(e) { alert("Error al borrar materia."); }
};

// ==========================================
// 6. SUBIDA Y REPOSITORIO
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
    if (res.ok) { currentUser = data.user; document.getElementById('docTitle').value = ''; document.getElementById('docFiles').value = ''; document.getElementById('selectedFilesPreview').textContent = ''; document.getElementById('youtubeUrlInput').value = ''; renderDashboard(); alert('¡Material procesado!'); } 
    else { alert(data.error); }
  } catch (err) { alert('Error al subir.'); } finally { btn.innerHTML = originalText; btn.disabled = false; }
};
window.deleteSavedDoc = async function(id) {
  if (!confirm('¿Borrar documento permanentemente?')) return;
  try { const res = await apiFetch(`/api/documents/${id}`, { method: 'DELETE', body: JSON.stringify({ username: currentUser.username, subjectId: activeSubjectId }) }); if (res.ok) { currentUser = (await res.json()).user; renderDashboard(); } } catch(e) {}
};
window.clearAllSubjectDocs = async function() {
  if (!confirm('¿SEGURO de querer vaciar el repositorio?')) return;
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

// ==========================================
// 7. EXPORTACIÓN A WORD Y VISOR FULL SCREEN
// ==========================================
window.exportToWord = function(title, contentHtml) {
  const htmlContent = `<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'><head><meta charset='utf-8'><title>${title}</title><style>body { font-family: 'Arial', sans-serif; line-height: 1.6; color: #000; padding: 20px; } h1, h2, h3, h4 { color: #1a365d; } p { margin-bottom: 15px; } .chapter-box { border: 1px solid #ccc; padding: 15px; margin-bottom: 20px; background-color: #f9f9f9; }</style></head><body><div style="text-align: center; margin-bottom: 30px;"><h1 style="color: #0284c7;">DOCUMENTO ACADÉMICO</h1></div>${contentHtml}</body></html>`;
  const blob = new Blob(['\ufeff' + htmlContent], { type: 'application/msword' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${title}.doc`; 
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
};

// ==========================================
// 8. ORÁCULO Y HERRAMIENTAS IA
// ==========================================
window.togglePhenomenologyDocs = function() { document.getElementById('phenomenologyDocs').classList.toggle('hidden'); };

window.askPhenomenology = async function() {
  const query = document.getElementById('phenoQueryInput').value.trim();
  if (!query) return alert('Escribe tu duda primero.');
  const v = document.getElementById('viewerArea'); v.classList.add('fullscreen-mode'); v.classList.remove('hidden');
  v.innerHTML = `<div class="text-center pt-32 animate-pulse"><span class="text-6xl">🏛️</span><p class="text-amber-300 font-black text-2xl uppercase mt-4">Consultando al Oráculo...</p></div>`;
  try {
    const res = await apiFetch('/api/phenomenology-query', { method: 'POST', body: JSON.stringify({ username: currentUser.username, query }) });
    const data = await res.json();
    if (!res.ok) return alert(data.error);
    currentUser = data.user; renderDashboard();
    v.innerHTML = `<div class="max-w-4xl mx-auto glass-edu rounded-3xl p-10 space-y-6 border-2 border-amber-500 relative shadow-2xl bg-gradient-to-b from-amber-950/40 to-slate-900 mt-10"><button onclick="closeFullScreenViewer()" class="absolute top-6 right-6 px-5 py-3 rounded-2xl bg-red-950 text-red-300 font-bold hover:bg-red-900 shadow-lg">✕ Cerrar</button><h2 class="text-3xl font-black text-amber-300 mb-5">🏛️ Respuesta Fenomenológica</h2><div class="bg-slate-900/80 p-8 rounded-2xl border border-amber-500/30 text-slate-100 whitespace-pre-wrap">${data.answer}</div></div>`;
  } catch (err) { alert('Error: ' + err.message); closeFullScreenViewer(); }
};

window.submitUniversityHomework = async function() {
  const promptTask = document.getElementById('homeworkPromptInput').value.trim();
  if (!promptTask) return alert('Escribe la tarea.');
  const v = document.getElementById('viewerArea'); v.classList.add('fullscreen-mode'); v.classList.remove('hidden');
  v.innerHTML = `<div class="text-center pt-32 animate-pulse"><span class="text-6xl">📝</span><p class="text-emerald-300 font-black text-2xl uppercase mt-4">Redactando Resolución...</p></div>`;
  try {
    const res = await apiFetch('/api/university-homework', { method: 'POST', body: JSON.stringify({ username: currentUser.username, subjectId: activeSubjectId, promptTask }) });
    const data = await res.json();
    if (!res.ok) { closeFullScreenViewer(); return alert(data.error); }
    currentUser = data.user; renderDashboard();
    v.innerHTML = `<div class="max-w-5xl mx-auto glass-edu rounded-3xl p-10 space-y-6 border-2 border-emerald-500 relative shadow-2xl mt-10"><button onclick="closeFullScreenViewer()" class="absolute top-6 right-6 px-5 py-3 rounded-2xl bg-red-950 text-red-300 font-bold">✕ Cerrar</button><div class="flex gap-3 justify-end mb-4 border-b border-indigo-500/30 pb-4"><button onclick="exportToWord('Resolucion', document.getElementById('exportableHomework').innerHTML)" class="px-5 py-3 bg-indigo-600 font-black text-white rounded-2xl">📥 Descargar .doc</button></div><div id="exportableHomework" class="bg-slate-900 p-8 rounded-2xl text-slate-100 whitespace-pre-wrap">${data.result}</div></div>`;
  } catch (err) { alert('Error: ' + err.message); closeFullScreenViewer(); }
};

window.generateAudiobook = async function() {
  const selectedDocId = document.getElementById('audiobookDocSelect').value;
  if(!selectedDocId) return alert('Selecciona un libro.');
  const v = document.getElementById('viewerArea'); v.classList.add('fullscreen-mode'); v.classList.remove('hidden');
  v.innerHTML = `<div class="text-center pt-32 animate-pulse"><span class="text-6xl">🎧</span><p class="text-rose-400 font-black text-2xl uppercase mt-4">Extrayendo Obra Completa...</p></div>`;
  try {
    const res = await apiFetch('/api/audiobook-chapters', { method: 'POST', body: JSON.stringify({ username: currentUser.username, subjectId: activeSubjectId, documentId: selectedDocId }) });
    const data = await res.json();
    if (!res.ok) { closeFullScreenViewer(); return alert(data.error); }
    currentUser = data.user; renderDashboard(); window.openSavedAudiobook(data.audiobook);
  } catch (err) { alert('Error: ' + err.message); closeFullScreenViewer(); }
};

// Resto llamadas genéricas IA
window.generateTimelineMap = async function() { /* Usa apiFetch('/api/generate-timeline-map') similar a universityHomework */ };
window.generateMindMap = async function() { /* Usa apiFetch('/api/generate-mindmap') */ };
window.generateFlashcards = async function() { /* Usa apiFetch('/api/generate-flashcards') */ };
window.generateStorybook = async function() { /* Usa apiFetch('/api/generate-storybook') */ };
window.openStorybook = function(sb) { /* Lógica UI */ };
window.openSavedAudiobook = function(ab) { /* Lógica UI */ };
window.downloadAudiobookSummary = () => { /* Lógica UI */ };

// ==========================================
// 11. DEBATE SOCRÁTICO
// ==========================================
window.openSocraticModal = function() { document.getElementById('modalSocratic').classList.toggle('hidden'); };
window.sendSocraticMessage = async function() {
  const input = document.getElementById('socraticInput'); const msg = input.value.trim(); if (!msg) return;
  const box = document.getElementById('socraticChatBox'); const philosopher = document.getElementById('socraticPhilosopher').value;
  box.innerHTML += `<div class="p-4 rounded-2xl bg-slate-800 text-right text-slate-200 font-medium ml-12 shadow-sm border border-slate-700"><b>Tú:</b> ${msg}</div>`;
  input.value = ''; socraticHistory += `\nEstudiante: ${msg}`;
  try {
    const res = await apiFetch('/api/socratic-debate', { method: 'POST', body: JSON.stringify({ username: currentUser.username, subjectId: activeSubjectId, philosopher, message: msg, history: socraticHistory }) });
    const data = await res.json();
    if (res.ok) {
      socraticHistory += `\n${philosopher}: ${data.reply}`;
      box.innerHTML += `<div class="p-4 rounded-2xl bg-indigo-950/90 border border-indigo-800 text-indigo-100 font-medium mr-12 shadow-md"><b>${philosopher}:</b> ${data.reply}</div>`;
      box.scrollTop = box.scrollHeight;
    }
  } catch (e) { alert('Error en el debate.'); }
};

// ==========================================
// 12. FASE 2: LECTOR INMERSIVO 3D Y TTS LIMPIO
// ==========================================
window.pageFlipInstance = null;
window.isSpeakingTTS = false;

window.openImmersiveBook = function(docId) {
  const subj = currentUser.subjects.find(s => s.id === activeSubjectId);
  const doc = subj.documents.find(d => d.id === docId);
  if (!doc) return alert("Documento no encontrado.");

  const v = document.getElementById('viewerArea');
  v.classList.add('fullscreen-mode'); v.classList.remove('hidden');

  v.innerHTML = `
    <div class="max-w-4xl mx-auto mt-6 relative flex flex-col items-center">
      <button onclick="closeFullScreenViewer()" class="absolute -top-10 right-0 px-5 py-2 bg-slate-800 text-slate-300 rounded-xl font-bold border border-slate-600 hover:bg-slate-700 transition z-50">← Volver a Biblioteca</button>
      <div id="book-wrapper" class="relative mt-8 drop-shadow-2xl">
        <div id="flipbook" class="bg-slate-300"></div>
      </div>
      <button id="ttsFloatingBtn" onclick="playCurrentPageTTS()" class="fixed bottom-12 right-12 w-16 h-16 rounded-full shadow-[0_10px_40px_rgba(0,0,0,0.6)] bg-cyan-500 border-4 border-cyan-300 text-2xl z-50 transform transition hover:scale-110 flex items-center justify-center">🔊</button>
    </div>
  `;

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

  setTimeout(() => {
    const bookEl = document.getElementById('flipbook');
    bookEl.innerHTML = pagesHtml;
    window.pageFlipInstance = new St.PageFlip(bookEl, {
      width: 400, height: 600, size: "stretch", minWidth: 315, maxWidth: 1000,
      minHeight: 400, maxHeight: 800, maxShadowOpacity: 0.3, showCover: false, mobileScrollSupport: true
    });
    window.pageFlipInstance.loadFromHTML(document.querySelectorAll('.page'));
    window.pageFlipInstance.on('flip', (e) => { if (window.isSpeakingTTS) stopTTS(); });
  }, 100);
};

function stopTTS() {
  window.speechSynthesis.cancel(); window.isSpeakingTTS = false;
  const btn = document.getElementById('ttsFloatingBtn');
  if(btn) { btn.innerHTML = '🔊'; btn.className = "fixed bottom-12 right-12 w-16 h-16 rounded-full shadow-[0_10px_40px_rgba(0,0,0,0.6)] bg-cyan-500 border-4 border-cyan-300 text-2xl z-50 transform transition hover:scale-110 flex items-center justify-center"; }
}

const originalCloseFullScreenViewer = window.closeFullScreenViewer;
window.closeFullScreenViewer = function() {
  stopTTS();
  if (window.pageFlipInstance) { window.pageFlipInstance.destroy(); window.pageFlipInstance = null; }
  originalCloseFullScreenViewer();
};

window.playCurrentPageTTS = async function() {
  if (!('speechSynthesis' in window)) return alert('TTS no soportado.');
  const btn = document.getElementById('ttsFloatingBtn');
  if (window.isSpeakingTTS) { stopTTS(); return; }

  const currentPageIdx = window.pageFlipInstance.getCurrentPageIndex();
  const pages = document.querySelectorAll('.page-content');
  if(!pages[currentPageIdx]) return;
  const rawPageText = pages[currentPageIdx].textContent;
  btn.innerHTML = '⏳';

  try {
    const res = await apiFetch('/api/tts-clean', { method: 'POST', body: JSON.stringify({ rawText: rawPageText }) });
    const { cleanedText } = await res.json();
    const utterance = new SpeechSynthesisUtterance(cleanedText);
    utterance.lang = 'es-ES'; utterance.rate = 1.0; utterance.onend = () => stopTTS();
    window.speechSynthesis.speak(utterance);
    window.isSpeakingTTS = true;
    btn.innerHTML = '🛑';
    btn.className = "fixed bottom-12 right-12 w-16 h-16 rounded-full shadow-[0_10px_40px_rgba(0,0,0,0.6)] bg-rose-500 border-4 border-rose-300 text-2xl z-50 transform transition hover:scale-110 flex items-center justify-center animate-pulse";
  } catch (err) { alert("Error TTS."); stopTTS(); }
};


// ==========================================
// 13. FASE 3: CEREBRO DE IA (Tutor, APA e Investigación)
// ==========================================

window.askTutor = async function() {
  const text = document.getElementById('tutorInput').value.trim();
  if (!text) return alert("Pega un texto para explicar.");
  const box = document.getElementById('tutorResponse');
  box.innerHTML = `<span class="animate-pulse text-cyan-400 font-bold">Pensando la explicación clínica...</span>`;
  try {
    const res = await apiFetch('/api/tutor-explain', { method: 'POST', body: JSON.stringify({ username: currentUser.username, text }) });
    const data = await res.json();
    if (res.ok) {
      box.innerHTML = `<b class="text-cyan-300">Tutor:</b><br><br>${data.explanation}`; renderDashboard(); 
    } else box.innerHTML = `<span class="text-red-400">${data.error}</span>`;
  } catch (e) { box.innerHTML = "Error de red."; }
};

window.generateAPATask = async function() {
  const topic = document.getElementById('apaTopic').value.trim();
  if (!topic) return alert("Escribe el tema de la tarea.");
  const btn = document.getElementById('btnAPA'); btn.innerText = "Escribiendo..."; btn.disabled = true;
  try {
    const res = await apiFetch('/api/generate-apa-task', { method: 'POST', body: JSON.stringify({ username: currentUser.username, subjectId: activeSubjectId, topic }) });
    const data = await res.json();
    if (res.ok) {
      document.getElementById('modalAPA').classList.add('hidden');
      exportToWord(`Ensayo_APA_${topic.substring(0,10)}`, data.apaDocument);
      renderDashboard();
    } else alert(data.error);
  } catch (e) { alert("Error al generar Tarea APA."); }
  finally { btn.innerText = "Redactar"; btn.disabled = false; }
};

window.startUnlimitedResearch = async function() {
  const topic = document.getElementById('researchTopic').value.trim();
  if (!topic) return alert("Define el tema de investigación.");
  
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
    let fullDocumentHTML = `<div style="text-align:center;"><h1>Tesis: ${topic}</h1><br><p>Generado por Agente IA Universitario</p></div><br><hr><br>`;
    let previousSummary = "";

    for (let i = 0; i < chapters.length; i++) {
      statusEl.innerText = `2/2: Escribiendo Cap ${i + 1} de ${chapters.length}...`;
      barEl.style.width = `${((i + 1) / chapters.length) * 100}%`;

      res = await apiFetch('/api/research/chapter', { method: 'POST', body: JSON.stringify({ username: currentUser.username, topic, chapterTitle: chapters[i], previousChapterSummary: previousSummary }) });
      data = await res.json();
      if (!res.ok) throw new Error(data.error);

      fullDocumentHTML += `<h1>Capítulo ${i + 1}: ${chapters[i]}</h1>\n${data.chapterContent}\n<br><br>`;
      previousSummary = `El capítulo anterior trató sobre ${chapters[i]}. Se abordaron estos conceptos básicos.`;
    }

    exportToWord(`Investigacion_${topic.substring(0,15)}`, fullDocumentHTML);
    alert("¡Investigación generada con éxito! Se ha descargado en formato Word.");
    document.getElementById('modalResearch').classList.add('hidden');
    renderDashboard();
  } catch (e) { alert("El Agente se detuvo: " + e.message); } 
  finally {
    btn.classList.remove('hidden'); document.getElementById('researchProgress').classList.add('hidden');
    barEl.style.width = "0%"; btn.innerText = "Iniciar Agente";
  }
};
