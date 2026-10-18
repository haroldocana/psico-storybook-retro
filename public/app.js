let currentUser = null;
let activeSubjectId = null;
let socraticHistory = '';

// Variables globales para el resumen del audiolibro
window.currentAudiobookSummary = "";
window.currentAudiobookTitle = "";

// ==========================================
// 1. INICIALIZACIÓN Y SESIÓN
// ==========================================
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

// ==========================================
// 2. FUNCIÓN DE VOZ SINTÉTICA (TTS)
// ==========================================
window.speakText = function(text) {
  if (!('speechSynthesis' in window)) {
    return alert('Tu navegador no soporta síntesis de voz. Por favor usa Chrome, Edge o Safari.');
  }
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
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

// LOGIN CON VALIDACIÓN
window.handleLogin = async function(e) {
  e.preventDefault();
  const loginId = document.getElementById('loginId').value.trim();
  const loginPass = document.getElementById('loginPass').value;

  if (!loginId || !loginPass) {
    return showAuthError("Por favor, llena todos los campos.");
  }

  const btn = document.getElementById('btnLoginBtn');
  const originalText = btn.innerHTML;
  btn.innerHTML = '⏳ Conectando...';
  btn.disabled = true;
  document.getElementById('authError').classList.add('hidden');

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST', 
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: loginId, password: loginPass })
    });
    
    let data;
    try { data = await res.json(); } catch(err) { throw new Error("El servidor devolvió un error interno o está caído."); }
    
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
    showAuthError('Error de red: El servidor no responde o la base de datos falló.'); 
    btn.innerHTML = originalText;
    btn.disabled = false;
  }
};

// REGISTRO DE ALUMNOS (PANTALLA INICIAL)
window.handleRegister = async function(e) {
  e.preventDefault();
  
  const regName = document.getElementById('regName').value.trim();
  const regUser = document.getElementById('regUser').value.trim();
  const regCareer = document.getElementById('regCareer').value.trim();
  const regEmail = document.getElementById('regEmail').value.trim();
  const regPass = document.getElementById('regPass').value;
  const regRecovery = document.getElementById('regRecovery') ? document.getElementById('regRecovery').value.trim() : 'clave123';

  if (!regName || !regUser || !regCareer || !regEmail || !regPass) {
    return showAuthError("Todos los campos son obligatorios.");
  }
  if (regUser.includes(" ")) {
    return showAuthError("El usuario no debe contener espacios.");
  }
  if (regPass.length < 6) {
    return showAuthError("La contraseña debe tener al menos 6 caracteres.");
  }

  const btn = document.getElementById('btnRegBtn');
  const originalText = btn.innerHTML;
  btn.innerHTML = '⏳ Creando perfil...';
  btn.disabled = true;
  document.getElementById('authError').classList.add('hidden');

  try {
    const res = await fetch('/api/auth/register', {
      method: 'POST', 
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        fullName: regName, 
        username: regUser, 
        career: regCareer, 
        email: regEmail, 
        password: regPass,
        recoveryWord: regRecovery
      })
    });
    
    let data;
    try { data = await res.json(); } catch(err) { throw new Error("El servidor devolvió un error interno o está caído."); }

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
    showAuthError('Error al registrar: Servidor fuera de línea.'); 
    btn.innerHTML = originalText;
    btn.disabled = false;
  }
};

// RECUPERACIÓN DE CONTRASEÑA (DESDE EL LOGIN)
window.recoverPassword = async function() {
  const u = document.getElementById('resetUsername').value.trim();
  const w = document.getElementById('resetWord').value.trim();
  const p = document.getElementById('resetNewPass').value;
  
  if(!u || !w || !p) return alert("Por favor llena todos los campos para recuperar tu contraseña.");
  
  try {
    const res = await fetch('/api/auth/reset-password', {
      method: 'POST', 
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({username: u, recoveryWord: w, newPassword: p})
    });
    const data = await res.json();
    if(res.ok) { 
      alert(data.message); 
      document.getElementById('modalForgotPass').classList.add('hidden'); 
    } else {
      alert(data.error);
    }
  } catch(e) { 
    alert("Error de conexión al intentar recuperar la contraseña."); 
  }
};

// NUEVO: CAMBIAR CONTRASEÑA ESTANDO LOGUEADO
window.changeUserPassword = async function() {
  const oldP = document.getElementById('changePassOld').value;
  const newP = document.getElementById('changePassNew').value;
  
  if(!oldP || !newP) return alert("Llena ambos campos para cambiar la contraseña.");
  
  try {
    const res = await fetch('/api/user/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: currentUser.username, oldPassword: oldP, newPassword: newP })
    });
    const data = await res.json();
    if(res.ok) {
      alert("Contraseña actualizada con éxito.");
      document.getElementById('modalChangePass').classList.add('hidden');
      document.getElementById('changePassOld').value = '';
      document.getElementById('changePassNew').value = '';
    } else {
      alert(data.error);
    }
  } catch(e) {
    alert("Error de conexión al cambiar contraseña.");
  }
};

window.enterApp = function(user) {
  currentUser = user;
  localStorage.setItem('psico_active_user', user.username);
  const lastSubj = localStorage.getItem(`psico_subj_${user.username}`);
  activeSubjectId = (user.subjects.find(s => s.id === lastSubj) ? lastSubj : user.subjects[0]?.id) || null;
  
  document.getElementById('authScreen').classList.add('hidden');
  document.getElementById('appScreen').classList.remove('hidden');
  
  // Mostrar Panel Master solo si es Admin
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
  location.reload(); 
};

// ==========================================
// 4. SISTEMA DE TOKENS IA Y PANEL ADMINISTRADOR
// ==========================================
window.requestMoreTokens = async function() {
  if(!confirm("¿Deseas enviar una solicitud al Administrador Master para cargar más Saldo de Inteligencia Artificial?")) return;
  try {
    const res = await fetch('/api/user/request-tokens', { 
      method:'POST', 
      headers:{'Content-Type':'application/json'}, 
      body: JSON.stringify({username: currentUser.username}) 
    });
    if(res.ok) {
      alert("✅ Solicitud enviada exitosamente al Master. Te avisaremos cuando se recargue tu saldo.");
      currentUser.pendingTokenRequest = true;
      renderDashboard(); // Actualizar UI
    }
  } catch(e) {
    alert("Error al enviar la solicitud.");
  }
};

window.loadAdminUsers = async function() {
  try {
    const res = await fetch('/api/admin/users', { headers: {'x-user': currentUser.username} });
    const users = await res.json();
    const tbody = document.getElementById('adminUsersTableBody');
    if(!tbody) return;
    
    tbody.innerHTML = users.map(u => {
      const remaining = (u.aiAllowanceUSD - u.aiConsumptionUSD).toFixed(2);
      const reqBadge = u.pendingTokenRequest 
        ? `<span class="px-2 py-0.5 bg-rose-500 text-white text-[10px] rounded-full font-black animate-pulse ml-2">Solicita Saldo</span>` 
        : '';
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
  } catch(e) {
    console.error("Error cargando usuarios master", e);
  }
};

// NUEVO: CREAR ALUMNO DESDE EL MASTER CON CARGA DE TOKENS
window.adminCreateUser = async function(e) {
  e.preventDefault();
  const n = document.getElementById('adminNewName').value.trim();
  const u = document.getElementById('adminNewUser').value.trim();
  const p = document.getElementById('adminNewPass').value;
  const c = document.getElementById('adminNewCareer').value.trim();
  const t = document.getElementById('adminNewTokens') ? document.getElementById('adminNewTokens').value : '2.00';

  if (!n || !u || !p || !c || !t) return alert("Todos los campos son obligatorios.");

  try {
    const res = await fetch('/api/admin/create-user', {
      method: 'POST', 
      headers: {'Content-Type':'application/json', 'x-user': currentUser.username},
      body: JSON.stringify({ fullName: n, username: u, password: p, career: c, initialTokens: t })
    });
    const data = await res.json();
    if(res.ok) {
      alert('Alumno creado exitosamente con sus tokens asignados.');
      document.getElementById('adminCreateUserForm').reset();
      loadAdminUsers();
    } else {
      alert(data.error);
    }
  } catch(err) { 
    alert('Error al crear usuario desde el panel Master.'); 
  }
};

window.adminAddTokens = async function(username) {
  if(!confirm(`¿Añadir $5.00 USD de saldo a ${username}?`)) return;
  try {
    await fetch('/api/admin/add-tokens', { 
      method:'POST', 
      headers:{'Content-Type':'application/json', 'x-user': currentUser.username}, 
      body: JSON.stringify({targetUsername: username, amount: 5.00}) 
    });
    alert(`Saldo añadido exitosamente a ${username}`);
    loadAdminUsers();
  } catch(e) {
    alert("Error al añadir saldo.");
  }
};

window.adminResetPass = async function(username) {
  const newP = prompt(`Escribe la NUEVA CONTRASEÑA temporal para el usuario ${username}:`);
  if(!newP) return;
  try {
    await fetch('/api/admin/force-reset', { 
      method:'POST', 
      headers:{'Content-Type':'application/json', 'x-user': currentUser.username}, 
      body: JSON.stringify({targetUsername: username, newPassword: newP}) 
    });
    alert(`Contraseña de ${username} reseteada con éxito.`);
  } catch(e) {
    alert("Error al resetear la contraseña.");
  }
};

// ==========================================
// 5. RENDERIZADO DEL DASHBOARD Y MATERIAS
// ==========================================
window.updateSelectedFilesList = function() {
  const input = document.getElementById('docFiles');
  document.getElementById('selectedFilesPreview').textContent = input.files.length > 0 
    ? `✅ ${input.files.length} archivo(s) listos para subir.` 
    : '';
};

window.renderDashboard = function() {
  document.getElementById('careerTitleBanner').textContent = `Entorno: ${currentUser.career || 'Universitario'}`;
  document.getElementById('userHeaderInfo').innerHTML = `👤 <b>${currentUser.fullName}</b>`;
  
  // Render de Saldo IA
  const balance = (currentUser.aiAllowanceUSD - currentUser.aiConsumptionUSD).toFixed(2);
  const billingEl = document.getElementById('aiBilling');
  if(billingEl) {
    billingEl.textContent = `$${balance} USD`;
    if(balance < 1.00) {
      billingEl.className = "text-red-400 text-sm font-black animate-pulse";
    } else {
      billingEl.className = "text-emerald-400 text-sm font-black";
    }
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
  
  // Cálculo de Progreso
  const domainScore = Math.min(100, (docs.length * 25) + (sbCount * 20));
  document.getElementById('progressBar').style.width = domainScore + '%';
  document.getElementById('progressText').textContent = domainScore + '%';

  document.getElementById('savedLibraryBadge').textContent = docs.length;
  
  // Render Archivos Guardados
  document.getElementById('savedDocsList').innerHTML = docs.length === 0 
    ? `<p class="text-xs text-slate-500 italic p-3 border border-dashed border-slate-700 rounded-xl text-center">Repositorio vacío. Sube material para comenzar.</p>` 
    : docs.map(d => `
      <div class="flex items-center justify-between px-4 py-3 rounded-xl bg-slate-900 border border-indigo-500/30 text-sm gap-3 shadow-sm hover:border-indigo-400 transition">
        <div class="truncate text-slate-200 font-bold flex-1">📄 ${d.title}</div>
        <button onclick="deleteSavedDoc('${d.id}')" class="text-red-400 font-black hover:text-red-300 bg-red-950/50 px-2 py-1 rounded-lg">🗑️</button>
      </div>
    `).join('');

  // Render Selectores (IA y Audiolibro)
  const optionsHTML = `<option value="ALL">📚 USAR TODOS LOS ARCHIVOS (${docs.length})</option>` + docs.map(d => `<option value="${d.id}">📄 ${d.title}</option>`).join('');
  document.getElementById('selectDocForAI').innerHTML = optionsHTML;
  document.getElementById('audiobookDocSelect').innerHTML = `<option value="">-- Elige el Libro Completo --</option>` + docs.map(d => `<option value="${d.id}">📖 ${d.title}</option>`).join('');

  // Render Historial de Monografías
  const hist = document.getElementById('savedHistoryList');
  hist.innerHTML = (subj.storybooks || []).slice().reverse().map(sb => `
    <div class="p-3.5 rounded-xl bg-slate-900 border border-indigo-500/30 flex justify-between items-center text-sm shadow-sm hover:border-cyan-500 transition">
      <div onclick='openStorybook(${JSON.stringify(sb).replace(/'/g, "&#39;")})' class="cursor-pointer truncate flex-1 text-slate-200 font-black hover:text-cyan-300">📖 ${sb.title}</div>
      <button onclick="deleteSavedStorybook('${sb.id}')" class="text-red-400 ml-3 font-black bg-red-950/50 px-2 py-1 rounded-lg">🗑️</button>
    </div>
  `).join('') || '<p class="text-xs text-slate-500 italic p-3 border border-dashed border-slate-700 rounded-xl text-center">No hay monografías generadas aún.</p>';

  // Render Bitácora de Audiolibros
  const abHist = document.getElementById('savedAudiobooksList');
  abHist.innerHTML = (subj.audiobooks || []).slice().reverse().map(ab => `
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

window.toggleNewSubjectModal = function() { 
  document.getElementById('modalSubject').classList.toggle('hidden'); 
};

window.createNewSubject = async function() {
  const name = document.getElementById('newSubjName').value.trim();
  if (!name) return alert("El nombre de la materia es obligatorio.");
  try {
    const res = await fetch('/api/subjects', {
      method: 'POST', 
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        username: currentUser.username, 
        name: name, 
        schedule: document.getElementById('newSubjSchedule').value 
      })
    });
    const data = await res.json();
    if (res.ok) { 
      currentUser = data.user; 
      activeSubjectId = data.newSubjectId; 
      toggleNewSubjectModal(); 
      document.getElementById('newSubjName').value = '';
      document.getElementById('newSubjSchedule').value = '';
      renderDashboard(); 
    }
  } catch(e) {
    alert("Error al crear la materia.");
  }
};

window.deleteActiveSubject = async function() {
  if (!activeSubjectId || !confirm('¿Estás seguro de querer borrar esta materia y TODOS sus documentos permanentemente?')) return;
  try {
    const res = await fetch(`/api/subjects/${activeSubjectId}`, {
      method: 'DELETE', 
      headers: { 'Content-Type': 'application/json' }, 
      body: JSON.stringify({ username: currentUser.username })
    });
    const data = await res.json();
    if (res.ok) { 
      currentUser = data.user; 
      activeSubjectId = currentUser.subjects[0]?.id || null; 
      document.getElementById('viewerArea').classList.add('hidden'); 
      renderDashboard(); 
    }
  } catch(e) {
    alert("Error al borrar la materia.");
  }
};

// ==========================================
// 6. SUBIDA DE ARCHIVOS Y GESTIÓN DE REPOSITORIO
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
  for (let i = 0; i < files.length; i++) {
    fd.append('documents', files[i]);
  }

  try {
    const res = await fetch('/api/documents', { method: 'POST', body: fd });
    const data = await res.json();
    
    if (res.ok) { 
      currentUser = data.user; 
      document.getElementById('docTitle').value = ''; 
      document.getElementById('docFiles').value = ''; 
      document.getElementById('selectedFilesPreview').textContent = '';
      document.getElementById('youtubeUrlInput').value = '';
      renderDashboard(); 
      alert('¡Material procesado y guardado en la nube con éxito!'); 
    } else {
      alert(data.error);
    }
  } catch (err) {
    alert('Error al subir el archivo. Revisa tu conexión.');
  } finally {
    btn.innerHTML = originalText;
    btn.disabled = false;
  }
};

window.deleteSavedDoc = async function(id) {
  if (!confirm('¿Borrar documento permanentemente del repositorio?')) return;
  try {
    const res = await fetch(`/api/documents/${id}`, { 
      method: 'DELETE', 
      headers: { 'Content-Type': 'application/json' }, 
      body: JSON.stringify({ username: currentUser.username, subjectId: activeSubjectId }) 
    });
    const data = await res.json();
    if (res.ok) { currentUser = data.user; renderDashboard(); }
  } catch(e) {}
};

window.clearAllSubjectDocs = async function() {
  if (!confirm('¿Estás SEGURO de querer vaciar todo el repositorio de esta materia?')) return;
  try {
    const res = await fetch(`/api/subjects/${activeSubjectId}/documents`, { 
      method: 'DELETE', 
      headers: { 'Content-Type': 'application/json' }, 
      body: JSON.stringify({ username: currentUser.username }) 
    });
    const data = await res.json();
    if (res.ok) { currentUser = data.user; renderDashboard(); }
  } catch(e) {}
};

window.deleteSavedStorybook = async function(sbId) {
  if (!confirm('¿Borrar esta monografía del historial?')) return;
  try {
    const res = await fetch(`/api/storybooks/${sbId}`, { 
      method: 'DELETE', 
      headers: { 'Content-Type': 'application/json' }, 
      body: JSON.stringify({ username: currentUser.username, subjectId: activeSubjectId }) 
    });
    const data = await res.json();
    if (res.ok) { currentUser = data.user; renderDashboard(); }
  } catch(e) {}
};

window.deleteSavedAudiobook = async function(abId) {
  if (!confirm('¿Borrar este audiolibro de la bitácora?')) return;
  try {
    const res = await fetch(`/api/audiobooks/${abId}`, { 
      method: 'DELETE', 
      headers: { 'Content-Type': 'application/json' }, 
      body: JSON.stringify({ username: currentUser.username, subjectId: activeSubjectId }) 
    });
    const data = await res.json();
    if (res.ok) { currentUser = data.user; renderDashboard(); }
  } catch(e) {}
};

// ==========================================
// 7. EXPORTACIÓN A WORD Y VISOR FULL SCREEN
// ==========================================
window.exportToWord = function(title, contentHtml) {
  const htmlContent = `
    <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
    <head>
      <meta charset='utf-8'>
      <title>${title}</title>
      <style>
        body { font-family: 'Arial', sans-serif; line-height: 1.6; color: #000; padding: 20px; }
        h1, h2, h3, h4 { color: #1a365d; }
        p { margin-bottom: 15px; }
        .chapter-box { border: 1px solid #ccc; padding: 15px; margin-bottom: 20px; background-color: #f9f9f9; }
      </style>
    </head>
    <body>
      <div style="text-align: center; margin-bottom: 30px;">
        <h1 style="color: #0284c7;">DOCUMENTO ACADÉMICO</h1>
        <p><strong>Generado desde la Plataforma Universitaria</strong></p>
      </div>
      ${contentHtml}
    </body>
    </html>
  `;
  const blob = new Blob(['\ufeff' + htmlContent], { type: 'application/msword' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); 
  a.href = url; 
  a.download = `${title}.doc`; 
  document.body.appendChild(a); 
  a.click(); 
  document.body.removeChild(a);
};

window.closeFullScreenViewer = function() {
  const v = document.getElementById('viewerArea');
  v.classList.remove('fullscreen-mode');
  v.classList.add('hidden');
  window.speechSynthesis.cancel();
};

// ==========================================
// 8. ORÁCULO FENOMENOLÓGICO Y TAREAS
// ==========================================
window.togglePhenomenologyDocs = function() { 
  document.getElementById('phenomenologyDocs').classList.toggle('hidden'); 
};

window.askPhenomenology = async function() {
  const query = document.getElementById('phenoQueryInput').value.trim();
  if (!query) return alert('Por favor, escribe tu duda existencial o fenomenológica primero.');
  
  const v = document.getElementById('viewerArea');
  v.classList.add('fullscreen-mode'); 
  v.classList.remove('hidden');
  v.innerHTML = `
    <div class="text-center animate-pulse pt-32 flex flex-col items-center">
      <span class="text-6xl mb-4">🏛️</span>
      <p class="text-amber-300 font-black text-2xl tracking-widest uppercase">Consultando al Oráculo Fenomenológico...</p>
      <p class="text-slate-400 mt-2 text-sm">Analizando a Husserl y Heidegger...</p>
    </div>`;

  try {
    const res = await fetch('/api/phenomenology-query', {
      method: 'POST', 
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: currentUser.username, query })
    });
    const data = await res.json();
    if (!res.ok) return alert(data.error);
    currentUser = data.user;
    renderDashboard();

    v.innerHTML = `
      <div class="max-w-4xl mx-auto glass-edu rounded-3xl p-10 space-y-6 border-2 border-amber-500 relative shadow-2xl bg-gradient-to-b from-amber-950/40 to-slate-900 mt-10">
        <button onclick="closeFullScreenViewer()" class="absolute top-6 right-6 px-5 py-3 rounded-2xl bg-red-950 text-red-300 font-bold text-sm hover:bg-red-900 transition shadow-lg">✕ Cerrar</button>
        <div class="flex justify-between items-center pr-20 border-b-2 border-amber-500/30 pb-5">
          <div>
            <span class="text-amber-500 font-black text-xs tracking-[0.2em] uppercase">Módulo Continental Puro</span>
            <h2 class="text-3xl font-black text-amber-300 mt-1">🏛️ Respuesta Fenomenológica</h2>
          </div>
          <button onclick="speakText(document.getElementById('phenoResultText').textContent)" class="px-5 py-3 rounded-2xl bg-amber-600 hover:bg-amber-500 font-black text-sm text-white shadow-lg transition-all transform hover:scale-105 flex items-center gap-2">
            <span>🔊</span> Escuchar
          </button>
        </div>
        <div class="bg-slate-900/80 p-8 rounded-2xl border border-amber-500/30 shadow-inner">
          <div id="phenoResultText" class="text-base whitespace-pre-wrap leading-relaxed text-slate-100 font-medium">${data.answer}</div>
        </div>
      </div>
    `;
  } catch (err) { alert('Error al consultar al oráculo: ' + err.message); closeFullScreenViewer(); }
};

window.submitUniversityHomework = async function() {
  const promptTask = document.getElementById('homeworkPromptInput').value.trim();
  if (!promptTask) return alert('Escribe detalladamente qué tarea o resumen necesitas que el profesor IA te resuelva.');
  
  const v = document.getElementById('viewerArea');
  v.classList.add('fullscreen-mode'); 
  v.classList.remove('hidden');
  v.innerHTML = `
    <div class="text-center animate-pulse pt-32 flex flex-col items-center">
      <span class="text-6xl mb-4">📝</span>
      <p class="text-emerald-300 font-black text-2xl tracking-widest uppercase">Redactando Resolución Académica...</p>
      <p class="text-slate-400 mt-2 text-sm">Aplicando método humanista-existencial y leyendo repositorio...</p>
    </div>`;

  try {
    const res = await fetch('/api/university-homework', {
      method: 'POST', 
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: currentUser.username, subjectId: activeSubjectId, promptTask })
    });
    const data = await res.json();
    if (!res.ok) {
      closeFullScreenViewer();
      return alert(data.error);
    }
    currentUser = data.user; 
    renderDashboard();

    v.innerHTML = `
      <div class="max-w-5xl mx-auto glass-edu rounded-3xl p-10 space-y-6 border-2 border-emerald-500 relative shadow-2xl mt-10">
        <button onclick="closeFullScreenViewer()" class="absolute top-6 right-6 px-5 py-3 rounded-2xl bg-red-950 text-red-300 font-bold text-sm hover:bg-red-900 transition shadow-lg">✕ Cerrar</button>
        <div class="flex justify-between items-center pr-20 border-b-2 border-indigo-500/30 pb-5">
          <div>
            <span class="px-3 py-1 rounded-full text-xs font-black bg-emerald-500 text-slate-950 uppercase tracking-widest shadow">Asistencia Universitaria</span>
            <h2 class="text-3xl font-black mt-3 text-emerald-300">Resolución de Tarea</h2>
          </div>
          <div class="flex gap-3">
            <button onclick="speakText(document.getElementById('homeworkResultText').textContent)" class="px-5 py-3 rounded-2xl bg-cyan-600 hover:bg-cyan-500 font-black text-sm text-white shadow-lg transition-all transform hover:scale-105 flex items-center gap-2">
              <span>🔊</span> Audio
            </button>
            <button onclick="exportToWord('Resolucion_Tarea_Humanista', document.getElementById('exportableHomework').innerHTML)" class="px-5 py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-500 font-black text-sm text-white shadow-lg transition-all transform hover:scale-105 flex items-center gap-2">
              <span>📥</span> Descargar .doc
            </button>
          </div>
        </div>
        <div id="exportableHomework" class="bg-slate-900 p-8 rounded-2xl border border-indigo-500/30 shadow-inner">
          <div id="homeworkResultText" class="text-base whitespace-pre-wrap leading-relaxed text-slate-100 font-medium">${data.result}</div>
        </div>
      </div>
    `;
  } catch (err) { alert('Error al generar la tarea: ' + err.message); closeFullScreenViewer(); }
};

// ==========================================
// 9. AUDIOLIBROS Y HERRAMIENTAS VISUALES
// ==========================================
window.downloadAudiobookSummary = () => {
  const safeTitle = window.currentAudiobookTitle.replace(/[^a-z0-9]/gi, '_').toLowerCase();
  const content = `
    <div class="chapter-box">
      <h2>Resumen Analítico</h2>
      <p>${window.currentAudiobookSummary.replace(/\n/g, '<br>')}</p>
    </div>
  `;
  exportToWord('Resumen_' + safeTitle, content);
};

window.openSavedAudiobook = function(ab) {
  const v = document.getElementById('viewerArea');
  v.classList.add('fullscreen-mode');
  v.classList.remove('hidden');
  
  window.currentAudiobookSummary = ab.bookSummary || 'Resumen no disponible.';
  window.currentAudiobookTitle = ab.audiobookTitle || 'Libro_Educativo';

  let currentChapterIdx = 0;

  function playCurrentChapter() {
    if (!('speechSynthesis' in window)) return alert('Tu navegador no soporta síntesis de voz.');
    window.speechSynthesis.cancel();
    
    const textToSpeak = `${ab.chapters[currentChapterIdx].chapterTitle}. ${ab.chapters[currentChapterIdx].chapterContent}`;
    const utterance = new SpeechSynthesisUtterance(textToSpeak);
    utterance.lang = 'es-ES';
    utterance.rate = 1.0;
    
    utterance.onend = () => {
      if (currentChapterIdx < ab.chapters.length - 1) {
        currentChapterIdx++;
        renderAudiobookUI();
        playCurrentChapter();
      }
    };

    window.speechSynthesis.speak(utterance);
  }

  window.jumpToChapter = (idx) => {
    currentChapterIdx = idx;
    renderAudiobookUI();
    playCurrentChapter();
  };

  window.pauseAudiobook = () => { window.speechSynthesis.pause(); };
  window.resumeAudiobook = () => { window.speechSynthesis.resume(); };
  window.stopAudiobook = () => { window.speechSynthesis.cancel(); };

  function renderAudiobookUI() {
    v.innerHTML = `
      <div class="max-w-6xl mx-auto glass-edu rounded-3xl p-8 space-y-6 border-2 border-rose-500 relative shadow-2xl mt-4">
        
        <button onclick="closeFullScreenViewer(); window.speechSynthesis.cancel();" class="absolute top-6 right-6 px-5 py-3 rounded-2xl bg-red-950 text-red-300 font-black text-sm hover:bg-red-900 transition shadow-lg z-10">✕ Cerrar Audio</button>
        
        <div class="border-b-2 border-rose-500/30 pb-5 pr-32 flex flex-col md:flex-row md:justify-between md:items-end gap-4">
          <div>
            <span class="px-3 py-1 rounded-full text-[10px] font-black bg-emerald-500 text-slate-950 uppercase tracking-widest shadow">🎧 Reproduciendo desde Bitácora (0 Tokens)</span>
            <h2 class="text-3xl font-black mt-3 text-rose-300 leading-tight">${ab.audiobookTitle}</h2>
          </div>
          
          <button onclick="downloadAudiobookSummary()" class="px-5 py-4 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-black text-sm shadow-xl transition-all transform hover:scale-105 flex items-center justify-center gap-2 whitespace-nowrap border border-emerald-400">
            <span class="text-xl">📥</span> Descargar Puntos Clave (.doc)
          </button>
        </div>

        <div class="bg-slate-900/90 p-6 rounded-3xl border-2 border-rose-500/50 flex flex-wrap items-center justify-between gap-6 shadow-xl relative overflow-hidden">
          <div class="absolute left-0 top-0 bottom-0 w-1 bg-rose-500"></div>
          <div class="pl-2">
            <p class="text-xs text-rose-400 font-black uppercase tracking-widest">Reproduciendo Ahora:</p>
            <p class="text-xl font-black text-white mt-1">${ab.chapters[currentChapterIdx].chapterTitle}</p>
          </div>
          <div class="flex items-center gap-3">
            <button onclick="playCurrentChapter()" class="px-5 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-sm shadow-md transition transform hover:scale-105">▶️ Reiniciar</button>
            <button onclick="pauseAudiobook()" class="px-5 py-3 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-black text-sm shadow-md transition transform hover:scale-105">⏸️ Pausar</button>
            <button onclick="resumeAudiobook()" class="px-5 py-3 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-black text-sm shadow-md transition transform hover:scale-105">⏯️ Seguir</button>
            <button onclick="stopAudiobook()" class="px-5 py-3 rounded-xl bg-red-900 hover:bg-red-800 text-white font-black text-sm shadow-md transition transform hover:scale-105">⏹️ Parar</button>
          </div>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-3 gap-8 pt-4">
          
          <div class="space-y-3 max-h-[500px] overflow-y-auto pr-3 custom-scrollbar bg-slate-950/50 p-4 rounded-3xl border border-slate-800">
            <p class="text-xs font-black text-slate-400 mb-4 uppercase tracking-widest text-center border-b border-slate-800 pb-2">ÍNDICE DE CAPÍTULOS</p>
            ${ab.chapters.map((ch, idx) => `
              <button onclick="jumpToChapter(${idx})" class="w-full text-left p-4 rounded-2xl border-2 transition-all text-sm font-bold flex items-center gap-3 ${idx === currentChapterIdx ? 'bg-rose-900/60 border-rose-400 text-white shadow-lg transform scale-[1.02]' : 'bg-slate-900 border-slate-800 text-slate-400 hover:bg-slate-800 hover:text-slate-200'}">
                <span class="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${idx === currentChapterIdx ? 'bg-rose-500 text-white' : 'bg-slate-800 text-slate-500'}">
                  ${idx === currentChapterIdx ? '🔊' : idx + 1}
                </span>
                <span class="line-clamp-2">${ch.chapterTitle}</span>
              </button>
            `).join('')}
          </div>
          
          <div class="lg:col-span-2 bg-slate-900 p-8 rounded-3xl border-2 border-indigo-500/20 max-h-[500px] overflow-y-auto space-y-4 shadow-inner custom-scrollbar relative">
            <p class="text-xs font-black text-rose-300 uppercase tracking-widest sticky top-0 bg-slate-900/90 py-2 backdrop-blur-sm border-b border-indigo-500/30">
              Transcripción del Texto Extraído:
            </p>
            <p class="text-base text-slate-200 leading-relaxed font-medium whitespace-pre-wrap mt-4 text-justify pr-2">${ab.chapters[currentChapterIdx].chapterContent}</p>
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
  if(!selectedDocId) return alert('Por favor, selecciona un libro del menú desplegable rojo para escuchar.');

  const v = document.getElementById('viewerArea');
  v.classList.add('fullscreen-mode');
  v.classList.remove('hidden');
  v.innerHTML = `
    <div class="text-center animate-pulse pt-32 flex flex-col items-center">
      <span class="text-6xl mb-4">🎧</span>
      <p class="text-rose-400 font-black text-2xl tracking-widest uppercase">Extrayendo Obra Completa...</p>
      <p class="text-slate-400 mt-2 text-sm">La IA está leyendo y dividiendo el libro. Se guardará en tu bitácora para siempre.</p>
    </div>`;

  try {
    const res = await fetch('/api/audiobook-chapters', {
      method: 'POST', 
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: currentUser.username, subjectId: activeSubjectId, documentId: selectedDocId })
    });
    
    const data = await res.json();
    if (!res.ok) { 
      closeFullScreenViewer(); 
      return alert(data.error); 
    }
    
    currentUser = data.user;
    renderDashboard();
    
    // Carga la interfaz usando la misma función de bitácora
    window.openSavedAudiobook(data.audiobook);

  } catch (err) { 
    alert('Error al generar audiolibre: ' + err.message); 
    closeFullScreenViewer();
  }
};

window.generateTimelineMap = async function() {
  const v = document.getElementById('viewerArea'); 
  v.classList.add('fullscreen-mode'); 
  v.classList.remove('hidden'); 
  v.innerHTML = `
    <div class="text-center animate-pulse pt-32">
      <p class="text-amber-300 font-black text-3xl">🗺️</p>
      <p class="text-amber-300 font-black text-xl mt-4 uppercase tracking-widest">Mapeando Evolución Teórica...</p>
    </div>`;
  
  try { 
    const res = await fetch('/api/generate-timeline-map', { 
      method: 'POST', 
      headers: { 'Content-Type': 'application/json' }, 
      body: JSON.stringify({ username: currentUser.username, subjectId: activeSubjectId, documentId: document.getElementById('selectDocForAI').value }) 
    }); 
    const data = await res.json(); 
    if (!res.ok) { closeFullScreenViewer(); return alert(data.error); }
    
    currentUser = data.user; 
    renderDashboard(); 
    const tm = data.timelineMap; 
    
    v.innerHTML = `
      <div class="max-w-6xl mx-auto glass-edu rounded-3xl p-10 space-y-8 border-2 border-amber-500 relative shadow-2xl mt-10">
        <button onclick="closeFullScreenViewer()" class="absolute top-6 right-6 px-5 py-3 rounded-2xl bg-red-950 text-red-300 font-bold text-sm hover:bg-red-900 transition shadow-lg">✕ Cerrar Mapa</button>
        
        <div class="border-b-2 border-amber-500/30 pb-6 text-center">
          <span class="px-4 py-1.5 rounded-full text-xs font-black bg-amber-500 text-slate-950 uppercase tracking-widest shadow">🗺️ Evolución Histórica</span>
          <h2 class="text-4xl font-black text-amber-300 mt-4">${tm.timelineTitle}</h2>
        </div>
        
        <div class="space-y-6 pt-4 relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-1 before:bg-gradient-to-b before:from-amber-500 before:to-indigo-500">
          ${tm.eras.map((e, idx) => `
            <div class="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
              <!-- Punto en la línea -->
              <div class="flex items-center justify-center w-10 h-10 rounded-full border-4 border-slate-900 bg-amber-500 text-slate-900 shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 z-10 font-black">
                ${idx + 1}
              </div>
              <!-- Tarjeta -->
              <div class="w-[calc(100%-4rem)] md:w-[calc(50%-3rem)] p-6 rounded-3xl bg-slate-900 border-2 border-cyan-500/40 shadow-xl transition-transform hover:scale-105">
                <span class="text-[10px] font-black px-3 py-1 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 uppercase tracking-widest">${e.eraName}</span>
                <h4 class="font-black text-lg text-teal-300 mt-3 flex items-center gap-2"><span>👤</span> ${e.mainAuthor}</h4>
                <p class="text-sm text-slate-200 mt-3 leading-relaxed bg-slate-950/50 p-3 rounded-xl border border-slate-800"><b>Idea Central:</b> ${e.coreIdea}</p>
                <p class="text-xs text-amber-400 mt-3 font-bold bg-amber-950/30 p-3 rounded-xl border border-amber-900/50"><b>Conexión:</b> ${e.refutationOrLink}</p>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `; 
  } catch (err) { 
    alert('Error al generar Timeline: ' + err.message); 
    closeFullScreenViewer();
  }
};

window.generateFlashcards = async function() {
  const v = document.getElementById('viewerArea'); 
  v.classList.add('fullscreen-mode'); 
  v.classList.remove('hidden'); 
  v.innerHTML = `
    <div class="text-center animate-pulse pt-32">
      <p class="text-purple-300 font-black text-3xl">🃏</p>
      <p class="text-purple-300 font-black text-xl mt-4 uppercase tracking-widest">Generando Fichas Teóricas...</p>
    </div>`;
  
  try { 
    const res = await fetch('/api/generate-flashcards', { 
      method: 'POST', 
      headers: { 'Content-Type': 'application/json' }, 
      body: JSON.stringify({ username: currentUser.username, subjectId: activeSubjectId, documentId: document.getElementById('selectDocForAI').value }) 
    }); 
    const data = await res.json(); 
    if (!res.ok) { closeFullScreenViewer(); return alert(data.error); }
    
    currentUser = data.user; 
    renderDashboard(); 
    
    v.innerHTML = `
      <div class="max-w-5xl mx-auto glass-edu rounded-3xl p-10 space-y-8 border-2 border-purple-500 relative shadow-2xl mt-10">
        <button onclick="closeFullScreenViewer()" class="absolute top-6 right-6 px-5 py-3 rounded-2xl bg-red-950 text-red-300 font-bold text-sm hover:bg-red-900 transition shadow-lg z-20">✕ Cerrar Fichas</button>
        
        <div class="text-center border-b-2 border-purple-500/30 pb-6">
          <span class="px-4 py-1.5 rounded-full text-xs font-black bg-purple-500 text-slate-950 uppercase tracking-widest shadow">Método de Repetición</span>
          <h2 class="text-4xl font-black text-purple-300 mt-4">🃏 Fichas Académicas Interactivas</h2>
          <p class="text-slate-400 mt-2 text-sm">Haz clic en cualquier tarjeta para ver la respuesta y su análisis clínico.</p>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 pt-4">
          ${data.flashcards.map((fc, i) => `
            <div onclick="this.classList.toggle('flipped')" class="flashcard h-80 cursor-pointer relative group">
              <div class="flashcard-inner w-full h-full relative rounded-3xl shadow-2xl">
                
                <!-- FRENTE DE LA FICHA (PREGUNTA) -->
                <div class="flashcard-front bg-slate-900 border-2 border-purple-500/60 p-6 rounded-3xl flex flex-col justify-between items-center text-center group-hover:border-purple-400 transition-colors">
                  <span class="text-xs font-black px-4 py-1.5 rounded-full bg-purple-950/80 text-purple-300 border border-purple-800 uppercase tracking-widest">Ficha #${i+1}</span>
                  <p class="text-lg font-black text-slate-100 leading-snug mt-4 px-2">${fc.question}</p>
                  <div class="mt-auto pt-4 w-full border-t border-slate-800">
                    <span class="text-xs text-purple-400/80 font-bold uppercase tracking-widest animate-pulse">Haz clic para girar 🔄</span>
                  </div>
                </div>
                
                <!-- REVERSO DE LA FICHA (RESPUESTA) -->
                <div class="flashcard-back bg-gradient-to-br from-indigo-950 to-purple-950 border-2 border-indigo-400 p-6 rounded-3xl flex flex-col justify-between overflow-y-auto custom-scrollbar text-center">
                  <span class="text-xs font-black px-4 py-1.5 rounded-full bg-emerald-950/80 text-emerald-400 border border-emerald-800 uppercase tracking-widest mx-auto">Respuesta Oficial</span>
                  <p class="text-base text-slate-100 font-medium leading-relaxed mt-4">${fc.answer}</p>
                  <div class="mt-4 p-3 rounded-xl bg-amber-950/40 border border-amber-900/50">
                    <span class="text-xs text-amber-300 font-black uppercase block mb-1">💡 Tip / Conexión Clínica</span>
                    <span class="text-[11px] text-amber-200/80 font-medium">${fc.hint}</span>
                  </div>
                </div>
                
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `; 
  } catch (err) { 
    alert('Error al generar Fichas: ' + err.message); 
    closeFullScreenViewer();
  }
};

window.generateMindMap = async function() {
  const v = document.getElementById('viewerArea'); 
  v.classList.add('fullscreen-mode'); 
  v.classList.remove('hidden'); 
  v.innerHTML = `
    <div class="text-center animate-pulse pt-32">
      <p class="text-teal-300 font-black text-3xl">🧠</p>
      <p class="text-teal-300 font-black text-xl mt-4 uppercase tracking-widest">Construyendo Mapa Conceptual...</p>
    </div>`;
  
  try { 
    const res = await fetch('/api/generate-mindmap', { 
      method: 'POST', 
      headers: { 'Content-Type': 'application/json' }, 
      body: JSON.stringify({ username: currentUser.username, subjectId: activeSubjectId, documentId: document.getElementById('selectDocForAI').value }) 
    }); 
    const data = await res.json(); 
    if (!res.ok) { closeFullScreenViewer(); return alert(data.error); }
    
    currentUser = data.user; 
    renderDashboard(); 
    const mm = data.mindmap; 
    
    v.innerHTML = `
      <div class="max-w-6xl mx-auto glass-edu rounded-3xl p-10 space-y-8 border-2 border-teal-500 relative shadow-2xl mt-10">
        <button onclick="closeFullScreenViewer()" class="absolute top-6 right-6 px-5 py-3 rounded-2xl bg-red-950 text-red-300 font-bold text-sm hover:bg-red-900 transition shadow-lg">✕ Cerrar Mapa</button>
        
        <div class="text-center border-b-2 border-teal-500/30 pb-6">
          <span class="px-4 py-1.5 rounded-full text-xs font-black bg-teal-500 text-slate-950 uppercase tracking-widest shadow">Esquema Analítico</span>
          <h2 class="text-3xl md:text-4xl font-black text-teal-300 mt-4 leading-tight">${mm.centralTopic}</h2>
        </div>
        
        <div class="flex flex-col items-center space-y-8 pt-6">
          <!-- Nodo Central -->
          <div class="px-8 py-5 rounded-3xl bg-gradient-to-br from-teal-600 to-cyan-600 font-black text-white text-xl shadow-[0_0_30px_rgba(13,148,136,0.4)] border-4 border-teal-300 transform hover:scale-105 transition">
            🌟 ${mm.centralTopic}
          </div>
          
          <div class="text-teal-400 text-3xl font-black animate-bounce">↓</div>
          
          <!-- Nodos Secundarios -->
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 w-full">
            ${mm.branches.map(b => `
              <div class="p-6 rounded-3xl bg-slate-900 border-2 border-teal-500/40 shadow-xl hover:border-teal-400 transition-colors relative overflow-hidden">
                <div class="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-teal-500 to-cyan-500"></div>
                <h4 class="font-black text-base text-amber-300 border-b-2 border-indigo-500/30 pb-3 flex items-center gap-2">
                  <span class="text-xl">📌</span> ${b.branchName}
                </h4>
                <ul class="space-y-3 text-sm text-slate-300 font-medium mt-4">
                  ${b.subitems.map(sub => `
                    <li class="bg-slate-950/80 p-3.5 rounded-xl border border-slate-800 shadow-sm flex items-start gap-2">
                      <span class="text-teal-500 font-black mt-0.5">•</span> 
                      <span class="leading-relaxed">${sub}</span>
                    </li>
                  `).join('')}
                </ul>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    `; 
  } catch (err) { 
    alert('Error al generar Mapa: ' + err.message); 
    closeFullScreenViewer();
  }
};

window.generateStorybook = async function() {
  const v = document.getElementById('viewerArea'); 
  v.classList.add('fullscreen-mode'); 
  v.classList.remove('hidden'); 
  v.innerHTML = `
    <div class="text-center animate-pulse pt-32">
      <p class="text-cyan-300 font-black text-3xl">📖</p>
      <p class="text-cyan-300 font-black text-xl mt-4 uppercase tracking-widest">Redactando Monografía Educativa Gamificada...</p>
    </div>`;
  
  try { 
    const res = await fetch('/api/generate-storybook', { 
      method: 'POST', 
      headers: { 'Content-Type': 'application/json' }, 
      body: JSON.stringify({ username: currentUser.username, subjectId: activeSubjectId, documentId: document.getElementById('selectDocForAI').value, focusTopic: document.getElementById('focusTopic').value }) 
    }); 
    const data = await res.json(); 
    if (res.ok) { 
      currentUser = data.user; 
      renderDashboard(); 
      window.openStorybook(data.storybook); 
    } else {
      closeFullScreenViewer();
      alert(data.error); 
    }
  } catch (e) { 
    alert('Error al conectar con el servidor.'); 
    closeFullScreenViewer();
  }
};

window.openStorybook = function(sb) {
  const v = document.getElementById('viewerArea'); 
  v.classList.add('fullscreen-mode'); 
  v.classList.remove('hidden');
  
  v.innerHTML = `
    <div id="exportableStorybook" class="max-w-6xl mx-auto glass-edu rounded-[2.5rem] p-8 md:p-12 space-y-10 cartoon-card relative shadow-[0_20px_50px_rgba(0,0,0,0.5)] mt-8 mb-8">
      
      <!-- Botón de Cerrar -->
      <button onclick="closeFullScreenViewer()" class="absolute top-8 right-8 px-5 py-3 rounded-2xl bg-red-950 hover:bg-red-900 text-red-300 font-black text-sm shadow-xl z-20 transition-all border border-red-800 border-b-4 active:border-b active:translate-y-[3px]">
        ✕ Cerrar Monografía
      </button>
      
      <!-- Cabecera -->
      <div class="flex flex-wrap justify-between items-end gap-6 border-b-4 border-cyan-400 pb-6 pr-40">
        <div>
          <span class="px-4 py-1.5 rounded-full text-xs font-black bg-cyan-400 text-slate-950 uppercase tracking-widest shadow-md">Monografía Académica Interactiva</span>
          <h2 class="text-4xl md:text-5xl font-black mt-4 bg-gradient-to-r from-cyan-300 via-teal-200 to-indigo-300 bg-clip-text text-transparent leading-tight tracking-tight">${sb.title}</h2>
        </div>
        <div class="flex gap-3">
          <button onclick="speakText('${sb.summary.replace(/'/g, "")}')" class="px-5 py-3 rounded-2xl bg-cyan-600 hover:bg-cyan-500 font-black text-sm text-white shadow-lg transition-all border-cyan-700 border-b-4 active:border-b active:translate-y-[3px] flex items-center gap-2">
            <span>🔊</span> Escuchar Todo
          </button>
          <button onclick="exportToWord('${sb.title.replace(/ /g, '_')}', document.getElementById('exportableStorybook').innerHTML)" class="px-5 py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-500 font-black text-sm text-white shadow-lg transition-all border-indigo-700 border-b-4 active:border-b active:translate-y-[3px] flex items-center gap-2">
            <span>📥</span> Guardar .doc
          </button>
        </div>
      </div>
      
      <!-- Resumen -->
      <div class="speech-bubble p-8 text-sm font-bold shadow-2xl flex items-start gap-6 transform hover:scale-[1.01] transition-transform">
        <span class="text-5xl drop-shadow-md hidden md:block">👨‍🏫</span>
        <div>
          <p class="text-emerald-900 font-black mb-3 text-xl uppercase tracking-wider border-b-2 border-emerald-900/20 pb-2 inline-block">Resumen Conceptual y Clínico:</p>
          <p class="text-emerald-950 font-semibold leading-loose text-base text-justify">${sb.summary}</p>
        </div>
      </div>
      
      <!-- Línea de Tiempo -->
      <div class="bg-slate-950/90 rounded-3xl p-8 border-4 border-cyan-400 shadow-2xl space-y-6 relative overflow-hidden">
        <div class="absolute top-0 right-0 w-32 h-32 bg-cyan-500/10 rounded-full blur-3xl"></div>
        <h3 class="font-black text-xl text-cyan-300 uppercase tracking-widest flex items-center gap-3">
          <span>⏳</span> Línea de Evolución Teórica
        </h3>
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 relative z-10">
          ${(sb.timeline || []).map(t => `
            <div class="p-6 rounded-3xl bg-slate-900 border-2 border-cyan-400/60 shadow-xl hover:border-cyan-300 transition-colors flex flex-col h-full">
              <span class="text-[10px] font-black px-3 py-1 rounded-full bg-cyan-400 text-slate-950 uppercase w-max tracking-widest">Fase ${t.step}</span>
              <h4 class="font-black text-base mt-4 text-amber-300">${t.title}</h4>
              <p class="text-sm text-slate-300 mt-3 font-medium leading-relaxed flex-grow">${t.description}</p>
            </div>
          `).join('')}
        </div>
      </div>
      
      <!-- Escenas -->
      <div class="space-y-6 pt-4">
        <h3 class="font-black text-xl text-teal-300 uppercase tracking-widest px-2 flex items-center gap-3">
          <span>📚</span> Exposición Analítica por Autores
        </h3>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
          ${(sb.scenes || []).map(sc => `
            <div class="cartoon-card rounded-3xl p-8 space-y-6 flex flex-col justify-between shadow-2xl bg-gradient-to-br from-slate-900 to-slate-950">
              <div class="flex justify-between items-start border-b-2 border-indigo-500/30 pb-4">
                <div>
                  <span class="text-xs font-black px-3 py-1 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-400/40 uppercase tracking-widest shadow-sm">
                    Módulo #${sc.sceneNumber}
                  </span>
                  <h4 class="font-black text-xl text-white mt-3">${sc.characterName}</h4>
                </div>
                <button onclick="speakText('${sc.storyDialogue.replace(/'/g, "")}')" class="text-xs px-4 py-2 bg-cyan-700 hover:bg-cyan-600 text-white rounded-xl font-black shadow-md transition border-cyan-800 border-b-4 active:border-b active:translate-y-[2px] flex items-center gap-2">
                  <span>🔊</span> Narrar
                </button>
              </div>
              
              <div class="speech-bubble p-6 text-sm font-bold leading-relaxed shadow-lg">
                <p class="text-emerald-950 font-black mb-3 text-base flex items-center gap-2">
                  <span>📘</span> Concepto Clave: <span class="text-emerald-800">${sc.academicConcept}</span>
                </p>
                <div class="bg-white/50 p-4 rounded-2xl border border-emerald-900/10">
                  <p class="text-emerald-900 italic font-bold text-sm leading-relaxed">"${sc.storyDialogue}"</p>
                </div>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
      
      <!-- Trivia Gamificada -->
      <div class="bg-slate-950/90 rounded-3xl p-8 md:p-10 border-4 border-amber-400 space-y-8 shadow-2xl relative overflow-hidden mt-10">
        <div class="absolute -bottom-10 -right-10 text-9xl opacity-5">🏆</div>
        <div class="flex items-center gap-4 border-b-2 border-amber-500/30 pb-4 relative z-10">
          <span class="text-4xl drop-shadow-md">🏆</span>
          <div>
            <h3 class="font-black text-xl text-amber-300 uppercase tracking-widest">Trivia Gamificada</h3>
            <p class="text-sm text-slate-300 mt-1">Evaluación de Retención Cognitiva. Selecciona la respuesta correcta.</p>
          </div>
        </div>
        
        <div class="space-y-6 relative z-10">
          ${(sb.quiz || []).map((q, idx) => `
            <div class="p-6 rounded-3xl bg-slate-900 border-2 border-indigo-500/40 space-y-4 shadow-lg">
              <p class="text-base font-black text-slate-100 flex gap-3">
                <span class="text-amber-400">Pregunta ${idx + 1}:</span> 
                <span>${q.question}</span>
              </p>
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                ${(q.options || []).map((opt, oIdx) => `
                  <button onclick="alert('${oIdx === q.correctIndex ? '🏆 ¡RESPUESTA CORRECTA! HAS GANADO +100 PUNTOS DE EXPERIENCIA ACADÉMICA (Nivel Desbloqueado)\\n\\n' : '❌ Respuesta Incorrecta. Sigue intentándolo.\\n\\nEXPLICACIÓN DEL PROFESOR:\\n'} ${JSON.stringify(q.heroExplanation).replace(/'/g, "\\'").replace(/^"|"$/g, '')}')" class="text-left text-sm font-bold p-4 rounded-2xl bg-slate-950 hover:bg-indigo-950 border-2 border-indigo-500/30 text-slate-200 transition-all transform hover:scale-[1.02] shadow-md border-b-4 active:border-b active:translate-y-[2px]">
                    <span class="text-indigo-400 mr-2">${String.fromCharCode(65 + oIdx)})</span> ${opt}
                  </button>
                `).join('')}
              </div>
            </div>
          `).join('')}
        </div>
      </div>
      
    </div>
  `;
  v.scrollIntoView({ behavior: 'smooth' });
};

// ==========================================
// 11. DEBATE SOCRÁTICO
// ==========================================
window.openSocraticModal = function() { 
  document.getElementById('modalSocratic').classList.toggle('hidden'); 
};

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
      method: 'POST', 
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: currentUser.username, subjectId: activeSubjectId, philosopher, message: msg, history: socraticHistory })
    });
    const data = await res.json();
    if (res.ok) {
      socraticHistory += `\n${philosopher}: ${data.reply}`;
      box.innerHTML += `<div class="p-4 rounded-2xl bg-indigo-950/90 border border-indigo-800 text-indigo-100 font-medium mr-12 shadow-md"><b>${philosopher}:</b> ${data.reply}</div>`;
      box.scrollTop = box.scrollHeight;
    }
  } catch (e) { 
    alert('Error en el debate.'); 
  }
};
