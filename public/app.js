let currentUser = null;
let activeSubjectId = null;
let socraticHistory = '';

window.currentAudiobookSummary = "";
window.currentAudiobookTitle = "";

// ==========================================
// NUEVO: INTERCEPTOR MULTI-TENANT PARA FETCH
// ==========================================
async function apiFetch(endpoint, options = {}) {
  const tenantId = localStorage.getItem('psico_tenant_id');
  if (!options.headers) options.headers = {};
  
  if (!(options.body instanceof FormData) && !options.headers['Content-Type']) {
    options.headers['Content-Type'] = 'application/json';
  }
  
  if (tenantId) {
    options.headers['x-tenant-id'] = tenantId;
  }
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
      if (res.ok && data.user) {
        enterApp(data.user);
      }
    } catch (e) {
      console.error("Error cargando sesión:", e);
    }
  }
});

// ==========================================
// 2. FUNCIÓN DE VOZ SINTÉTICA (TTS) CON FILTRO
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

  if (!tenantId || !loginId || !loginPass) return showAuthError("Por favor, llena todos los campos.");

  const btn = document.getElementById('btnLoginBtn');
  const originalText = btn.innerHTML;
  btn.innerHTML = '⏳ Conectando...';
  btn.disabled = true;
  document.getElementById('authError').classList.add('hidden');

  try {
    localStorage.setItem('psico_tenant_id', tenantId);
    
    const res = await apiFetch('/api/auth/login', {
      method: 'POST', 
      body: JSON.stringify({ identifier: loginId, password: loginPass })
    });
    
    const data = await res.json();
    
    if (!res.ok) {
      localStorage.removeItem('psico_tenant_id');
      showAuthError(data.error || "Error al iniciar sesión.");
      btn.innerHTML = originalText; btn.disabled = false;
      return;
    }
    
    btn.innerHTML = originalText; btn.disabled = false;
    enterApp(data.user);
    
  } catch (e) { 
    showAuthError('Error de red: El servidor no responde o la base de datos falló.'); 
    btn.innerHTML = originalText; btn.disabled = false;
  }
};

window.handleRegister = async function(e) {
  e.preventDefault();
  
  const tenantId = document.getElementById('regTenant').value.trim();
  const regName = document.getElementById('regName').value.trim();
  const regUser = document.getElementById('regUser').value.trim();
  const regCareer = document.getElementById('regCareer').value.trim();
  const regPass = document.getElementById('regPass').value;
  const regRecovery = document.getElementById('regRecovery') ? document.getElementById('regRecovery').value.trim() : 'clave123';

  if (!tenantId || !regName || !regUser || !regCareer || !regPass) return showAuthError("Todos los campos son obligatorios.");
  if (regUser.includes(" ")) return showAuthError("El usuario no debe contener espacios.");
  if (regPass.length < 6) return showAuthError("La contraseña debe tener al menos 6 caracteres.");

  const btn = document.getElementById('btnRegBtn');
  const originalText = btn.innerHTML;
  btn.innerHTML = '⏳ Creando perfil...';
  btn.disabled = true;
  document.getElementById('authError').classList.add('hidden');

  try {
    localStorage.setItem('psico_tenant_id', tenantId);
    
    const res = await apiFetch('/api/auth/register', {
      method: 'POST', 
      body: JSON.stringify({ fullName: regName, username: regUser, career: regCareer, password: regPass, recoveryWord: regRecovery })
    });
    
    const data = await res.json();

    if (!res.ok) {
      localStorage.removeItem('psico_tenant_id');
      showAuthError(data.error || "Error al registrar la cuenta.");
      btn.innerHTML = originalText; btn.disabled = false;
      return;
    }
    
    btn.innerHTML = originalText; btn.disabled = false;
    enterApp(data.user);
    
  } catch (e) { 
    showAuthError('Error al registrar: Servidor fuera de línea.'); 
    btn.innerHTML = originalText; btn.disabled = false;
  }
};

window.recoverPassword = async function() {
  const u = document.getElementById('resetUsername').value.trim();
  const w = document.getElementById('resetWord').value.trim();
  const p = document.getElementById('resetNewPass').value;
  
  if(!u || !w || !p) return alert("Por favor llena todos los campos.");
  
  try {
    const res = await apiFetch('/api/auth/reset-password', {
      method: 'POST', 
      body: JSON.stringify({username: u, recoveryWord: w, newPassword: p})
    });
    const data = await res.json();
    if(res.ok) { 
      alert(data.message); 
      document.getElementById('modalForgotPass').classList.add('hidden'); 
    } else { alert(data.error); }
  } catch(e) { alert("Error de conexión."); }
};

window.changeUserPassword = async function() {
  const oldP = document.getElementById('changePassOld').value;
  const newP = document.getElementById('changePassNew').value;
  if(!oldP || !newP) return alert("Llena ambos campos.");
  
  try {
    const res = await apiFetch('/api/user/change-password', {
      method: 'POST',
      body: JSON.stringify({ username: currentUser.username, oldPassword: oldP, newPassword: newP })
    });
    const data = await res.json();
    if(res.ok) {
      alert("Contraseña actualizada con éxito.");
      document.getElementById('modalChangePass').classList.add('hidden');
    } else { alert(data.error); }
  } catch(e) { alert("Error de conexión al cambiar contraseña."); }
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
// 4. SISTEMA DE TOKENS IA Y PANEL ADMINISTRADOR
// ==========================================
window.requestMoreTokens = async function() {
  if(!confirm("¿Solicitar saldo al Administrador?")) return;
  try {
    const res = await apiFetch('/api/user/request-tokens', { 
      method:'POST', 
      body: JSON.stringify({username: currentUser.username}) 
    });
    if(res.ok) {
      alert("✅ Solicitud enviada.");
      currentUser.pendingTokenRequest = true;
      renderDashboard(); 
    }
  } catch(e) { alert("Error al enviar la solicitud."); }
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

  if (!n || !u || !p || !c || !t) return alert("Campos obligatorios.");

  try {
    const res = await apiFetch('/api/admin/create-user', {
      method: 'POST', 
      headers: {'x-user': currentUser.username},
      body: JSON.stringify({ fullName: n, username: u, password: p, career: c, initialTokens: t })
    });
    const data = await res.json();
    if(res.ok) {
      alert('Alumno creado exitosamente.');
      document.getElementById('adminCreateUserForm').reset();
      loadAdminUsers();
    } else { alert(data.error); }
  } catch(err) { alert('Error al crear usuario.'); }
};

window.adminAddTokens = async function(username) {
  if(!confirm(`¿Añadir $5.00 USD de saldo a ${username}?`)) return;
  try {
    const res = await apiFetch('/api/admin/add-tokens', { 
      method:'POST', headers: {'x-user': currentUser.username}, 
      body: JSON.stringify({targetUsername: username, amount: 5.00}) 
    });
    if (res.ok) { alert(`Saldo añadido.`); loadAdminUsers(); }
  } catch(e) { alert("Error al añadir saldo."); }
};

window.adminResetPass = async function(username) {
  const newP = prompt(`Nueva contraseña temporal para ${username}:`);
  if(!newP) return;
  try {
    await apiFetch('/api/admin/force-reset', { 
      method:'POST', headers:{'x-user': currentUser.username}, 
      body: JSON.stringify({targetUsername: username, newPassword: newP}) 
    });
    alert(`Contraseña reseteada.`);
  } catch(e) { alert("Error."); }
};

// ==========================================
// 5. RENDERIZADO DEL DASHBOARD Y MATERIAS
// ==========================================
window.renderDashboard = function() {
  document.getElementById('careerTitleBanner').textContent = `Entorno: ${currentUser.career || 'Universitario'}`;
  document.getElementById('userHeaderInfo').innerHTML = `👤 <b>${currentUser.fullName}</b>`;
  
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
    ? `<p class="text-xs text-slate-500 italic p-3 border border-dashed border-slate-700 rounded-xl text-center">Repositorio vacío. Sube material para comenzar.</p>` 
    : docs.map(d => `
      <div class="flex items-center justify-between px-4 py-3 rounded-xl bg-slate-900 border border-indigo-500/30 text-sm gap-3 shadow-sm hover:border-indigo-400 transition">
        <div class="truncate text-slate-200 font-bold flex-1">📄 ${d.title}</div>
        <button onclick="deleteSavedDoc('${d.id}')" class="text-red-400 font-black hover:text-red-300 bg-red-950/50 px-2 py-1 rounded-lg">🗑️</button>
      </div>
    `).join('');

  document.getElementById('selectDocForAI').innerHTML = `<option value="ALL">📚 USAR TODOS LOS ARCHIVOS (${docs.length})</option>` + docs.map(d => `<option value="${d.id}">📄 ${d.title}</option>`).join('');
  document.getElementById('audiobookDocSelect').innerHTML = `<option value="">-- Elige el Libro Completo --</option>` + docs.map(d => `<option value="${d.id}">📖 ${d.title}</option>`).join('');

  document.getElementById('savedHistoryList').innerHTML = (subj.storybooks || []).slice().reverse().map(sb => `
    <div class="p-3.5 rounded-xl bg-slate-900 border border-indigo-500/30 flex justify-between items-center text-sm shadow-sm hover:border-cyan-500 transition">
      <div onclick='openStorybook(${JSON.stringify(sb).replace(/'/g, "&#39;")})' class="cursor-pointer truncate flex-1 text-slate-200 font-black hover:text-cyan-300">📖 ${sb.title}</div>
      <button onclick="deleteSavedStorybook('${sb.id}')" class="text-red-400 ml-3 font-black bg-red-950/50 px-2 py-1 rounded-lg">🗑️</button>
    </div>
  `).join('') || '<p class="text-xs text-slate-500 italic p-3 border border-dashed border-slate-700 rounded-xl text-center">No hay monografías generadas aún.</p>';

  document.getElementById('savedAudiobooksList').innerHTML = (subj.audiobooks || []).slice().reverse().map(ab => `
    <div class="p-3.5 rounded-xl bg-slate-900 border border-rose-500/30 flex justify-between items-center text-sm shadow-sm hover:border-rose-500 transition">
      <div onclick='openSavedAudiobook(${JSON.stringify(ab).replace(/'/g, "&#39;")})' class="cursor-pointer truncate flex-1 text-slate-200 font-black hover:text-rose-300">🎧 ${ab.audiobookTitle}</div>
      <button onclick="deleteSavedAudiobook('${ab.id}')" class="text-red-400 ml-3 font-black bg-red-950/50 px-2 py-1 rounded-lg">🗑️</button>
    </div>
  `).join('') || '<p class="text-xs text-slate-500 italic p-3 border border-dashed border-slate-700 rounded-xl text-center">No hay audiolibros en la bitácora.</p>';
};

window.selectSubject = function(id) { 
  activeSubjectId = id; 
  localStorage.setItem(`psico_subj_${currentUser.username}`, id); 
  document.getElementById('viewerArea').classList.add('hidden'); 
  renderDashboard(); 
};

window.createNewSubject = async function() {
  const name = document.getElementById('newSubjName').value.trim();
  if (!name) return alert("Nombre obligatorio.");
  try {
    const res = await apiFetch('/api/subjects', {
      method: 'POST', 
      body: JSON.stringify({ username: currentUser.username, name: name, schedule: document.getElementById('newSubjSchedule').value })
    });
    const data = await res.json();
    if (res.ok) { 
      currentUser = data.user; activeSubjectId = data.newSubjectId; 
      document.getElementById('modalSubject').classList.add('hidden'); 
      document.getElementById('newSubjName').value = '';
      renderDashboard(); 
    }
  } catch(e) { alert("Error al crear la materia."); }
};

window.deleteActiveSubject = async function() {
  if (!activeSubjectId || !confirm('¿Borrar materia permanentemente?')) return;
  try {
    const res = await apiFetch(`/api/subjects/${activeSubjectId}`, {
      method: 'DELETE', 
      body: JSON.stringify({ username: currentUser.username })
    });
    const data = await res.json();
    if (res.ok) { 
      currentUser = data.user; activeSubjectId = currentUser.subjects[0]?.id || null; 
      document.getElementById('viewerArea').classList.add('hidden'); 
      renderDashboard(); 
    }
  } catch(e) {}
};

// ==========================================
// 6. SUBIDA DE ARCHIVOS Y REPOSITORIO
// ==========================================
window.handleUploadDoc = async function(e) {
  e.preventDefault();
  const btn = document.getElementById('btnUploadDoc');
  const originalText = btn.innerHTML;
  btn.innerHTML = '⏳ Subiendo y procesando...';
  btn.disabled = true;
  
  const fd = new FormData();
  fd.append('username', currentUser.username); 
  fd.append('subjectId', activeSubjectId);
  fd.append('docTitle', document.getElementById('docTitle').value);
  fd.append('youtubeUrl', document.getElementById('youtubeUrlInput').value);
  
  const files = document.getElementById('docFiles').files;
  for (let i = 0; i < files.length; i++) fd.append('documents', files[i]);

  try {
    const res = await apiFetch('/api/documents', { method: 'POST', body: fd });
    const data = await res.json();
    if (res.ok) { 
      currentUser = data.user; 
      document.getElementById('docTitle').value = ''; document.getElementById('docFiles').value = ''; document.getElementById('youtubeUrlInput').value = '';
      renderDashboard(); alert('¡Guardado!'); 
    } else { alert(data.error); }
  } catch (err) { alert('Error al subir.'); } 
  finally { btn.innerHTML = originalText; btn.disabled = false; }
};

window.deleteSavedDoc = async function(id) {
  if (!confirm('¿Borrar documento permanentemente?')) return;
  try {
    const res = await apiFetch(`/api/documents/${id}`, { method: 'DELETE', body: JSON.stringify({ username: currentUser.username, subjectId: activeSubjectId }) });
    const data = await res.json();
    if (res.ok) { currentUser = data.user; renderDashboard(); }
  } catch(e) {}
};

window.clearAllSubjectDocs = async function() {
  if (!confirm('¿Vaciar TODO el repositorio?')) return;
  try {
    const res = await apiFetch(`/api/subjects/${activeSubjectId}/documents`, { method: 'DELETE', body: JSON.stringify({ username: currentUser.username }) });
    const data = await res.json();
    if (res.ok) { currentUser = data.user; renderDashboard(); }
  } catch(e) {}
};

window.deleteSavedStorybook = async function(sbId) {
  if (!confirm('¿Borrar esta monografía?')) return;
  try {
    const res = await apiFetch(`/api/storybooks/${sbId}`, { method: 'DELETE', body: JSON.stringify({ username: currentUser.username, subjectId: activeSubjectId }) });
    const data = await res.json();
    if (res.ok) { currentUser = data.user; renderDashboard(); }
  } catch(e) {}
};

window.deleteSavedAudiobook = async function(abId) {
  if (!confirm('¿Borrar este audiolibro?')) return;
  try {
    const res = await apiFetch(`/api/audiobooks/${abId}`, { method: 'DELETE', body: JSON.stringify({ username: currentUser.username, subjectId: activeSubjectId }) });
    const data = await res.json();
    if (res.ok) { currentUser = data.user; renderDashboard(); }
  } catch(e) {}
};

// ==========================================
// 7. EXPORTACIÓN WORD Y VIEWER
// ==========================================
window.exportToWord = function(title, contentHtml) {
  const htmlContent = `<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'><head><meta charset='utf-8'><title>${title}</title></head><body>${contentHtml}</body></html>`;
  const blob = new Blob(['\ufeff' + htmlContent], { type: 'application/msword' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${title}.doc`; 
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
};

window.closeFullScreenViewer = function() {
  const v = document.getElementById('viewerArea');
  v.classList.remove('fullscreen-mode'); v.classList.add('hidden');
  window.speechSynthesis.cancel();
};

window.togglePhenomenologyDocs = function() { document.getElementById('phenomenologyDocs').classList.toggle('hidden'); };

// ==========================================
// 8. ENDPOINTS DE IA
// ==========================================
window.askPhenomenology = async function() {
  const query = document.getElementById('phenoQueryInput').value.trim();
  if (!query) return;
  const v = document.getElementById('viewerArea'); v.classList.add('fullscreen-mode'); v.classList.remove('hidden');
  v.innerHTML = `<div class="text-center animate-pulse pt-32"><span class="text-6xl mb-4">🏛️</span><p class="text-amber-300 font-black text-2xl uppercase">Consultando al Oráculo...</p></div>`;

  try {
    const res = await apiFetch('/api/phenomenology-query', { method: 'POST', body: JSON.stringify({ username: currentUser.username, query }) });
    const data = await res.json();
    if (!res.ok) return alert(data.error);
    currentUser = data.user; renderDashboard();

    v.innerHTML = `<div class="max-w-4xl mx-auto glass-edu rounded-3xl p-10 mt-10 relative shadow-2xl border-amber-500 border-2">
      <button onclick="closeFullScreenViewer()" class="absolute top-6 right-6 px-5 py-3 rounded-2xl bg-red-950 text-red-300 font-bold text-sm">✕ Cerrar</button>
      <div id="phenoResultText" class="text-base whitespace-pre-wrap text-slate-100 mt-12">${data.answer}</div>
    </div>`;
  } catch (err) { alert(err.message); closeFullScreenViewer(); }
};

window.submitUniversityHomework = async function() {
  const promptTask = document.getElementById('homeworkPromptInput').value.trim();
  if (!promptTask) return;
  const v = document.getElementById('viewerArea'); v.classList.add('fullscreen-mode'); v.classList.remove('hidden');
  v.innerHTML = `<div class="text-center animate-pulse pt-32"><span class="text-6xl mb-4">📝</span><p class="text-emerald-300 font-black text-2xl uppercase">Redactando Resolución...</p></div>`;

  try {
    const res = await apiFetch('/api/university-homework', { method: 'POST', body: JSON.stringify({ username: currentUser.username, subjectId: activeSubjectId, promptTask }) });
    const data = await res.json();
    if (!res.ok) { closeFullScreenViewer(); return alert(data.error); }
    currentUser = data.user; renderDashboard();
    v.innerHTML = `<div class="max-w-5xl mx-auto glass-edu rounded-3xl p-10 mt-10 relative shadow-2xl border-emerald-500 border-2">
      <button onclick="closeFullScreenViewer()" class="absolute top-6 right-6 px-5 py-3 rounded-2xl bg-red-950 text-red-300 font-bold">✕ Cerrar</button>
      <button onclick="exportToWord('Tarea', document.getElementById('homeworkResultText').innerHTML)" class="absolute top-6 right-32 px-5 py-3 rounded-2xl bg-indigo-600 text-white font-bold">📥 Guardar .doc</button>
      <div id="homeworkResultText" class="text-base whitespace-pre-wrap text-slate-100 mt-12">${data.result}</div>
    </div>`;
  } catch (err) { alert(err.message); closeFullScreenViewer(); }
};

window.generateAudiobook = async function() {
  const docId = document.getElementById('audiobookDocSelect').value;
  if(!docId) return alert('Selecciona un libro.');
  const v = document.getElementById('viewerArea'); v.classList.add('fullscreen-mode'); v.classList.remove('hidden');
  v.innerHTML = `<div class="text-center animate-pulse pt-32"><p class="text-rose-400 font-black text-2xl uppercase">Extrayendo Obra...</p></div>`;

  try {
    const res = await apiFetch('/api/audiobook-chapters', { method: 'POST', body: JSON.stringify({ username: currentUser.username, subjectId: activeSubjectId, documentId: docId }) });
    const data = await res.json();
    if (!res.ok) { closeFullScreenViewer(); return alert(data.error); }
    currentUser = data.user; renderDashboard();
    window.openSavedAudiobook(data.audiobook);
  } catch (err) { alert(err.message); closeFullScreenViewer(); }
};

window.openSavedAudiobook = function(ab) {
  const v = document.getElementById('viewerArea');
  v.classList.add('fullscreen-mode'); v.classList.remove('hidden');
  window.currentAudiobookTitle = ab.audiobookTitle || 'Libro';
  let idx = 0;

  window.playAudio = () => {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(cleanTextForAudio(`${ab.chapters[idx].chapterTitle}. ${ab.chapters[idx].chapterContent}`));
    utterance.lang = 'es-ES';
    utterance.onend = () => { if(idx < ab.chapters.length - 1) { idx++; renderUI(); window.playAudio(); } };
    window.speechSynthesis.speak(utterance);
  };

  const renderUI = () => {
    v.innerHTML = `<div class="max-w-6xl mx-auto glass-edu rounded-3xl p-8 border-rose-500 border-2 mt-10 relative">
      <button onclick="closeFullScreenViewer()" class="absolute top-6 right-6 px-5 py-3 rounded-2xl bg-red-950 text-red-300 font-bold">✕ Cerrar</button>
      <h2 class="text-3xl font-black text-rose-300">${ab.audiobookTitle}</h2>
      <p class="text-xl font-bold text-white mt-4">Reproduciendo: ${ab.chapters[idx].chapterTitle}</p>
      <div class="mt-4 flex gap-4"><button onclick="playAudio()" class="px-4 py-2 bg-emerald-600 rounded-xl text-white font-bold">▶️ Play</button><button onclick="window.speechSynthesis.pause()" class="px-4 py-2 bg-amber-600 rounded-xl text-white font-bold">⏸️ Pausa</button><button onclick="window.speechSynthesis.resume()" class="px-4 py-2 bg-cyan-600 rounded-xl text-white font-bold">⏯️ Seguir</button></div>
      <p class="text-base text-slate-200 mt-6">${ab.chapters[idx].chapterContent}</p>
    </div>`;
  };
  renderUI(); window.playAudio();
};

window.generateStorybook = async function() {
  const v = document.getElementById('viewerArea'); v.classList.add('fullscreen-mode'); v.classList.remove('hidden');
  v.innerHTML = `<div class="text-center animate-pulse pt-32"><p class="text-cyan-300 font-black text-2xl uppercase">Redactando Monografía...</p></div>`;
  
  try {
    const res = await apiFetch('/api/generate-storybook', { method: 'POST', body: JSON.stringify({ username: currentUser.username, subjectId: activeSubjectId, documentId: document.getElementById('selectDocForAI').value }) });
    const data = await res.json();
    if (!res.ok) { closeFullScreenViewer(); return alert(data.error); }
    currentUser = data.user; renderDashboard();
    window.openStorybook(data.storybook);
  } catch (e) { alert('Error.'); closeFullScreenViewer(); }
};

window.openStorybook = function(sb) {
  const v = document.getElementById('viewerArea'); v.classList.add('fullscreen-mode'); v.classList.remove('hidden');
  v.innerHTML = `<div id="exportableStorybook" class="max-w-6xl mx-auto glass-edu rounded-3xl p-10 relative mt-10">
    <button onclick="closeFullScreenViewer()" class="absolute top-6 right-6 px-5 py-3 rounded-2xl bg-red-950 text-red-300 font-bold">✕ Cerrar</button>
    <button onclick="exportToWord('${sb.title.replace(/ /g, '_')}', document.getElementById('exportableStorybook').innerHTML)" class="absolute top-6 right-32 px-5 py-3 rounded-2xl bg-indigo-600 text-white font-bold">📥 Guardar .doc</button>
    <h2 class="text-4xl font-black text-cyan-300 mb-6">${sb.title}</h2>
    <p class="text-lg text-slate-200">${sb.summary}</p>
    <div class="mt-8">
      ${(sb.scenes || []).map(sc => `<div class="mt-4 p-4 border border-cyan-500 rounded-xl bg-slate-900"><h4 class="font-bold text-amber-300">${sc.characterName}</h4><p class="mt-2 text-white">${sc.storyDialogue}</p></div>`).join('')}
    </div>
  </div>`;
};

window.generateTimelineMap = async function() {
  const v = document.getElementById('viewerArea'); v.classList.add('fullscreen-mode'); v.classList.remove('hidden');
  v.innerHTML = `<div class="text-center animate-pulse pt-32"><p class="text-amber-300 font-black text-2xl uppercase">Mapeando Evolución...</p></div>`;
  try {
    const res = await apiFetch('/api/generate-timeline-map', { method: 'POST', body: JSON.stringify({ username: currentUser.username, subjectId: activeSubjectId, documentId: document.getElementById('selectDocForAI').value }) });
    const data = await res.json();
    if (!res.ok) { closeFullScreenViewer(); return alert(data.error); }
    currentUser = data.user; renderDashboard();
    const tm = data.timelineMap;
    v.innerHTML = `<div class="max-w-6xl mx-auto glass-edu rounded-3xl p-10 relative mt-10"><button onclick="closeFullScreenViewer()" class="absolute top
