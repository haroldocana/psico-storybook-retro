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
// 2. TTS Y AUTENTICACIÓN
// ==========================================
function cleanTextForAudio(text) {
  if (!text) return "";
  return text.replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu, '').replace(/[*#_\[\]`~]/g, '').replace(/\n+/g, '. ').replace(/\s{2,}/g, ' ').trim();
}

window.speakText = function(text) {
  if (!('speechSynthesis' in window)) return alert('TTS no soportado.');
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(cleanTextForAudio(text));
  utterance.lang = 'es-ES'; window.speechSynthesis.speak(utterance);
};

window.switchAuthTab = function(tab) {
  document.getElementById('authError').classList.add('hidden');
  document.getElementById('loginForm').classList.toggle('hidden', tab !== 'login');
  document.getElementById('registerForm').classList.toggle('hidden', tab !== 'register');
  document.getElementById('tabLogin').className = tab === 'login' ? 'flex-1 py-3 rounded-xl text-xs font-black bg-indigo-600 text-white shadow transition-all' : 'flex-1 py-3 rounded-xl text-xs font-black text-slate-400 hover:text-white transition-all';
  document.getElementById('tabRegister').className = tab === 'register' ? 'flex-1 py-3 rounded-xl text-xs font-black bg-emerald-600 text-white shadow transition-all' : 'flex-1 py-3 rounded-xl text-xs font-black text-slate-400 hover:text-white transition-all';
};

window.showAuthError = function(msg) { const el = document.getElementById('authError'); el.textContent = msg; el.classList.remove('hidden'); };

window.handleLogin = async function(e) {
  e.preventDefault();
  const tenantId = document.getElementById('loginTenant').value.trim(); const loginId = document.getElementById('loginId').value.trim(); const loginPass = document.getElementById('loginPass').value;
  if (!tenantId || !loginId || !loginPass) return showAuthError("Llena todos los campos.");
  const btn = document.getElementById('btnLoginBtn'); const originalText = btn.innerHTML; btn.innerHTML = '⏳ Conectando...'; btn.disabled = true; document.getElementById('authError').classList.add('hidden');
  try {
    localStorage.setItem('psico_tenant_id', tenantId);
    const res = await apiFetch('/api/auth/login', { method: 'POST', body: JSON.stringify({ identifier: loginId, password: loginPass }) });
    let data; try { data = await res.json(); } catch(err) { throw new Error(); }
    if (!res.ok) { localStorage.removeItem('psico_tenant_id'); showAuthError(data.error || "Error al iniciar sesión."); btn.innerHTML = originalText; btn.disabled = false; return; }
    btn.innerHTML = originalText; btn.disabled = false; enterApp(data.user);
  } catch (e) { showAuthError('Error de red.'); btn.innerHTML = originalText; btn.disabled = false; }
};

window.handleRegister = async function(e) {
  e.preventDefault();
  const tenantId = document.getElementById('regTenant').value.trim(); const regName = document.getElementById('regName').value.trim(); const regUser = document.getElementById('regUser').value.trim(); const regCareer = document.getElementById('regCareer').value.trim(); const regEmail = document.getElementById('regEmail').value.trim(); const regPass = document.getElementById('regPass').value; const regRecovery = document.getElementById('regRecovery') ? document.getElementById('regRecovery').value.trim() : 'clave123';
  if (!tenantId || !regName || !regUser || !regCareer || !regEmail || !regPass) return showAuthError("Todos los campos son obligatorios.");
  const btn = document.getElementById('btnRegBtn'); const originalText = btn.innerHTML; btn.innerHTML = '⏳ Creando perfil...'; btn.disabled = true;
  try {
    localStorage.setItem('psico_tenant_id', tenantId);
    const res = await apiFetch('/api/auth/register', { method: 'POST', body: JSON.stringify({ fullName: regName, username: regUser, career: regCareer, email: regEmail, password: regPass, recoveryWord: regRecovery }) });
    let data; try { data = await res.json(); } catch(err) { throw new Error(); }
    if (!res.ok) { localStorage.removeItem('psico_tenant_id'); showAuthError(data.error || "Error al registrar la cuenta."); btn.innerHTML = originalText; btn.disabled = false; return; }
    btn.innerHTML = originalText; btn.disabled = false; enterApp(data.user);
  } catch (e) { showAuthError('Error al registrar.'); btn.innerHTML = originalText; btn.disabled = false; }
};

window.recoverPassword = async function() {
  const t = document.getElementById('resetTenant').value.trim(); const u = document.getElementById('resetUsername').value.trim(); const w = document.getElementById('resetWord').value.trim(); const p = document.getElementById('resetNewPass').value;
  if(!t || !u || !w || !p) return alert("Llena todos los campos.");
  localStorage.setItem('psico_tenant_id', t);
  try {
    const res = await apiFetch('/api/auth/reset-password', { method: 'POST', body: JSON.stringify({username: u, recoveryWord: w, newPassword: p}) });
    const data = await res.json();
    if(res.ok) { alert(data.message); document.getElementById('modalForgotPass').classList.add('hidden'); } else { alert(data.error); }
  } catch(e) { alert("Error al intentar recuperar."); }
};

window.changeUserPassword = async function() {
  const oldP = document.getElementById('changePassOld').value; const newP = document.getElementById('changePassNew').value;
  if(!oldP || !newP) return alert("Llena ambos campos.");
  try {
    const res = await apiFetch('/api/user/change-password', { method: 'POST', body: JSON.stringify({ username: currentUser.username, oldPassword: oldP, newPassword: newP }) });
    const data = await res.json();
    if(res.ok) { alert("Actualizada con éxito."); document.getElementById('modalChangePass').classList.add('hidden'); document.getElementById('changePassOld').value = ''; document.getElementById('changePassNew').value = ''; } else { alert(data.error); }
  } catch(e) { alert("Error al cambiar contraseña."); }
};

window.enterApp = function(user) {
  currentUser = user; localStorage.setItem('psico_active_user', user.username);
  const lastSubj = localStorage.getItem(`psico_subj_${user.username}`);
  activeSubjectId = (user.subjects.find(s => s.id === lastSubj) ? lastSubj : user.subjects[0]?.id) || null;
  document.getElementById('authScreen').classList.add('hidden'); document.getElementById('appScreen').classList.remove('hidden');
  const btnAdmin = document.getElementById('btnAdminPanel');
  if(btnAdmin) { if(user.role === 'admin') btnAdmin.classList.remove('hidden'); else btnAdmin.classList.add('hidden'); }
  renderDashboard();
};

window.logout = function() { currentUser = null; localStorage.removeItem('psico_active_user'); localStorage.removeItem('psico_tenant_id'); location.reload(); };

// ==========================================
// 4. ADMIN & TOKENS
// ==========================================
window.requestMoreTokens = async function() { if(!confirm("¿Solicitar más Saldo al Master?
