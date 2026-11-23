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
// 2. FUNCIÓN DE VOZ SINTÉTICA FLUIDA (TTS SIN COMAS NI CARACTERES)
// ==========================================
function cleanTextForAudio(text) {
  if (!text) return "";
  return text
    .replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu, ' ')
    .replace(/[,;:()[\]{}"'«»“”‘’*#_~^|<>/\\+=@$%&!?¡¿.`]/g, ' ')
    .replace(/[\r\n•▪◦●\-–—]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

window.speakText = function(text, rate = 1.0) {
  if (!('speechSynthesis' in window)) return alert('Tu navegador no soporta síntesis de voz.');
  window.speechSynthesis.cancel();
  const cleanedText = cleanTextForAudio(text);
  const utterance = new SpeechSynthesisUtterance(cleanedText);
  utterance.lang = 'es-ES';
  utterance.rate = rate;
  window.speechSynthesis.speak(utterance);
};

// ==========================================
// 3. AUTENTICACIÓN Y CAMBIO DE CLAVE POST-PAGO
// ==========================================
window.showAuthError = function(msg) { 
  const el = document.getElementById('authError'); 
  if (!el) return;
  el.textContent = msg; 
  el.classList.remove('hidden'); 
};

window.handleLogin = async function(e) {
  e.preventDefault();
  const tenantId = document.getElementById('loginTenant').value.trim().toLowerCase();
  const loginId = document.getElementById('loginId').value.trim();
  const loginPass = document.getElementById('loginPass').value;

  if (!tenantId || !loginId || !loginPass) return showAuthError("Llena todos los campos.");

  const btn = document.getElementById('btnLoginBtn');
  const originalText = btn.innerHTML; btn.innerHTML = '⏳ Conectando...'; btn.disabled = true;

  try {
    localStorage.setItem('psico_tenant_id', tenantId);
    const res = await apiFetch('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ identifier: loginId, password: loginPass })
    });
    let data; try { data = await res.json(); } catch(err) { throw new Error(); }
    if (!res.ok) {
      localStorage.removeItem('psico_tenant_id');
      showAuthError(data.error || "Credenciales incorrectas.");
      btn.innerHTML = originalText; btn.disabled = false; return;
    }
    btn.innerHTML = originalText; btn.disabled = false;
    enterApp(data.user);
  } catch (e) {
    showAuthError('Error de red al conectar con la institución.');
    btn.innerHTML = originalText; btn.disabled = false;
  }
};

window.changeUserPassword = async function() {
  const oldP = document.getElementById('changePassOld').value.trim();
  const newP = document.getElementById('changePassNew').value.trim();

  if (!oldP || !newP) return alert("Por favor ingresa tu contraseña actual y la nueva.");
  if (!currentUser || !currentUser.username) return alert("Sesión no detectada. Vuelve a iniciar sesión.");

  try {
    const res = await apiFetch('/api/user/change-password', {
      method: 'POST',
      body: JSON.stringify({
        username: currentUser.username,
        oldPassword: oldP,
        newPassword: newP
      })
    });
    const data = await res.json();

    if (res.ok) {
      alert("✅ " + (data.message || "Contraseña personal actualizada correctamente."));
      if (data.user) currentUser = data.user;
      document.getElementById('changePassOld').value = '';
      document.getElementById('changePassNew').value = '';
      document.getElementById('modalChangePass').classList.add('hidden');
    } else {
      alert("❌ Error: " + (data.error || "No se pudo actualizar la contraseña."));
    }
  } catch (e) {
    alert("❌ Error de conexión con el servidor al intentar cambiar la contraseña.");
  }
};

window.enterApp = async function(user) {
  currentUser = user;
  localStorage.setItem('psico_active_user', user.username);
  const lastSubj = localStorage.getItem(`psico_subj_${user.username}`);
  activeSubjectId = (user.subjects.find(s => s.id === lastSubj) ? lastSubj : user.subjects[0]?.id) || null;
  
  document.getElementById('authScreen').classList.add('hidden');
  document.getElementById('appScreen').classList.remove('hidden');
  
  const btnAdmin = document.getElementById('btnAdminPanel');
  if(btnAdmin) { btnAdmin.classList.toggle('hidden', user.role !== 'admin'); }

  await loadAvailablePensums();
  renderDashboard();

  if (user.mustChangePassword && user.role !== 'admin') {
    setTimeout(() => {
      alert("🔐 Bienvenido. Por seguridad, cambia tu contraseña temporal por una clave personal.");
      document.getElementById('modalChangePass').classList.remove('hidden');
    }, 400);
  }
};

window.logout = function() { 
  window.speechSynthesis.cancel();
  currentUser = null; 
  localStorage.removeItem('psico_active_user'); 
  localStorage.removeItem('psico_tenant_id');
  location.reload(); 
};

// ==========================================
// 4. TOKENS, PANEL MASTER Y GESTOR DINÁMICO DE PENSUMS
// ==========================================
window.loadAvailablePensums = async function() {
  try {
    const res = await apiFetch('/api/pensums');
    const data = await res.json();
    if (!res.ok || !data.pensums) return;

    window.loadedPensums = data.pensums;
    const optionsHtml = data.pensums.map(p => `<option value="${p.careerCode}">${p.careerName} (${p.faculty || 'Oficial'})</option>`).join('');

    const selUser = document.getElementById('selectPensumCareer');
    const selAdmin = document.getElementById('admCareerCode');
    if (selUser && optionsHtml) selUser.innerHTML = optionsHtml;
    if (selAdmin && optionsHtml) selAdmin.innerHTML = optionsHtml;
  } catch (e) { console.error("Error cargando catálogo de pensums:", e); }
};

window.adminSaveNewPensum = async function() {
  const careerCode = document.getElementById('newPensumCode').value.trim();
  const careerName = document.getElementById('newPensumName').value.trim();
  const citationStyle = document.getElementById('newPensumCitation').value;
  const philosophicalFramework = document.getElementById('newPensumFramework').value.trim();
  const cycleNumber = parseInt(document.getElementById('newPensumCycleNum').value) || 1;
  const cycleName = document.getElementById('newPensumCycleName').value.trim() || `Ciclo ${cycleNumber}`;
  const domainTag = document.getElementById('newPensumDomainTag').value;
  const rawCourses = document.getElementById('newPensumCoursesList').value.trim();

  if (!careerCode || !careerName || !rawCourses) {
    return alert("Completa Código, Nombre de Carrera y al menos un curso.");
  }

  const courses = rawCourses.split(',').map((c, idx) => ({
    courseCode: `${careerCode.substring(0, 3).toUpperCase()}-${cycleNumber}0${idx + 1}`,
    name: c.trim(),
    credits: 4,
    domainTags: [domainTag]
  })).filter(c => c.name);

  const btn = document.getElementById('btnSavePensum');
  const orig = btn ? btn.innerHTML : '';
  if (btn) { btn.innerHTML = '⏳ Guardando...'; btn.disabled = true; }

  try {
    const res = await apiFetch('/api/admin/save-pensum', {
      method: 'POST',
      headers: { 'x-user': currentUser.username },
      body: JSON.stringify({
        careerCode,
        careerName,
        universityCode: localStorage.getItem('psico_tenant_id'),
        philosophicalFramework,
        citationStyle,
        cycles: [{ cycleNumber, cycleName, courses }]
      })
    });
    const data = await res.json();
    if (res.ok) {
      alert(`✅ ${data.message}`);
      document.getElementById('newPensumCoursesList').value = '';
      await loadAvailablePensums();
    } else {
      alert(data.error);
    }
  } catch (e) {
    alert("Error guardando pensum.");
  } finally {
    if (btn) { btn.innerHTML = orig; btn.disabled = false; }
  }
};

window.requestMoreTokens = async function() {
  if(!confirm("¿Solicitar recarga de Saldo IA al Administrador?")) return;
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
        <td class="px-4 py-3 font-bold text-white">${u.username} <br><span class="text-[11px] text-cyan-400">${u.universityName || ''}</span><br><span class="text-[10px] text-slate-400">${u.email}</span> ${reqBadge}</td>
        <td class="px-4 py-3">${u.career}</td>
        <td class="px-4 py-3 font-black ${remaining < 1 ? 'text-red-400' : 'text-emerald-400'}">$${remaining}</td>
        <td class="px-4 py-3 flex gap-2">
          <button onclick="adminAddTokens('${u.username}')" class="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 rounded-lg text-white text-[11px] font-black">+ $5</button>
          <button onclick="adminResetPass('${u.username}')" class="px-2.5 py-1.5 bg-rose-600 hover:bg-rose-500 rounded-lg text-white text-[11px] font-black">Reset</button>
        </td>
      </tr>`;
    }).join('');
  } catch(e) { console.error(e); }
};

window.adminCreateUserAndEmail = async function() {
  const universityName = document.getElementById('admUniversityName').value.trim();
  const fullName = document.getElementById('admFullName').value.trim();
  const email = document.getElementById('admEmail').value.trim();
  const username = document.getElementById('admUsername').value.trim();
  const password = document.getElementById('admTempPass').value.trim();
  const careerCode = document.getElementById('admCareerCode').value;
  const cycleNumber = document.getElementById('admCycleNumber').value;
  const initialTokens = document.getElementById('admInitialTokens').value;
  const platformUrl = document.getElementById('admPlatformUrl').value.trim() || window.location.origin;

  if (!fullName || !email || !username || !password) {
    return alert("Completa Nombre, Correo, Usuario y Contraseña temporal.");
  }

  const btn = document.getElementById('btnAdminCreateUser');
  const orig = btn.innerHTML; btn.innerHTML = '⏳ Creando y enviando correo...'; btn.disabled = true;

  try {
    const res = await apiFetch('/api/admin/create-user', {
      method: 'POST',
      headers: { 'x-user': currentUser.username },
      body: JSON.stringify({
        universityName, fullName, email, username, password,
        careerCode, cycleNumber, initialTokens, platformUrl
      })
    });
    const data = await res.json();
    if (res.ok) {
      alert(`✅ Usuario "${username}" creado y credenciales enviadas a ${email}.`);
      document.getElementById('admFullName').value = '';
      document.getElementById('admEmail').value = '';
      document.getElementById('admUsername').value = '';
      document.getElementById('admTempPass').value = '';
      loadAdminUsers();
    } else {
      alert(data.error || "Error al crear usuario.");
    }
  } catch (err) {
    alert("Error de conexión.");
  } finally {
    btn.innerHTML = orig; btn.disabled = false;
  }
};

window.adminAddTokens = async function(username) {
  try {
    await apiFetch('/api/admin/add-tokens', { method:'POST', headers:{'x-user': currentUser.username}, body: JSON.stringify({targetUsername: username, amount: 5.00}) });
    loadAdminUsers();
  } catch(e) { alert("Error."); }
};

window.adminResetPass = async function(username) {
  const newP = prompt(`Nueva contraseña temporal para ${username}:`);
  if(!newP) return;
  try {
    await apiFetch('/api/admin/force-reset', { method:'POST', headers:{'x-user': currentUser.username}, body: JSON.stringify({targetUsername: username, newPassword: newP}) });
    alert(`Contraseña temporal actualizada.`);
  } catch(e) { alert("Error."); }
};

window.enrollPensumCycle = async function() {
  const careerCode = document.getElementById('selectPensumCareer').value;
  const cycleNumber = document.getElementById('selectPensumCycle').value;
  const btn = document.getElementById('btnEnrollPensum');
  const orig = btn.innerHTML; btn.innerHTML = '⏳ Cargando Pensum...'; btn.disabled = true;

  try {
    const res = await apiFetch('/api/user/enroll-pensum', {
      method: 'POST',
      body: JSON.stringify({ username: currentUser.username, careerCode, cycleNumber })
    });
    const data = await res.json();
    if (res.ok) {
      currentUser = data.user;
      activeSubjectId = currentUser.subjects[0]?.id || null;
      if (data.philosophicalFramework && document.getElementById('philosophicalFrameworkBanner')) {
        document.getElementById('philosophicalFrameworkBanner').textContent = `Enfoque: ${data.philosophicalFramework}`;
      }
      document.getElementById('modalPensumSelector').classList.add('hidden');
      renderDashboard();
      alert("✅ Materias oficiales del pensum cargadas correctamente.");
    } else {
      alert(data.error);
    }
  } catch (e) {
    alert("Error al cargar pensum.");
  } finally {
    btn.innerHTML = orig; btn.disabled = false;
  }
};

// ==========================================
// 5. RENDERIZADO DEL DASHBOARD
// ==========================================
window.renderDashboard = function() {
  document.getElementById('careerTitleBanner').textContent = `${currentUser.universityName || 'AprendePro'} · ${currentUser.career || 'Universitario'}`;
  document.getElementById('userHeaderInfo').innerHTML = `👤 <b>${currentUser.fullName}</b> | Código Inst: <b>${localStorage.getItem('psico_tenant_id')}</b>`;
  
  const balance = (currentUser.aiAllowanceUSD - currentUser.aiConsumptionUSD).toFixed(2);
  const billingEl = document.getElementById('aiBilling');
  if(billingEl) {
    billingEl.textContent = `$${balance} USD`;
    billingEl.className = balance < 1.00 ? "text-red-400 text-sm font-black animate-pulse" : "text-emerald-400 text-sm font-black";
  }

  const list = document.getElementById('subjectsList');
  list.innerHTML = currentUser.subjects.map(s => `
    <button onclick="selectSubject('${s.id}')" class="w-full text-left p-3.5 rounded-2xl border-2 transition-all ${s.id === activeSubjectId ? 'bg-cyan-950/80 border-cyan-400 shadow-lg text-white transform scale-[1.01]' : 'bg-slate-900/70 border-indigo-500/30 text-slate-300 hover:border-indigo-400'}">
      <div class="flex justify-between items-center">
        <span class="font-black text-xs">${s.name}</span>
        ${s.credits ? `<span class="text-[10px] px-2 py-0.5 rounded bg-indigo-950 text-cyan-300 font-bold">${s.credits} cr</span>` : ''}
      </div>
      <div class="text-[11px] text-cyan-300/80 mt-1 font-bold">${s.schedule || ''}</div>
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
      <div class="flex items-center justify-between px-3.5 py-2.5 rounded-xl bg-slate-900 border border-indigo-500/30 text-xs gap-2 shadow-sm hover:border-indigo-400 transition">
        <div class="truncate text-slate-200 font-bold flex-1">
          ${d.isOfficialCurriculum ? '🏛️' : '📄'} ${d.title}
        </div>
        <button onclick="deleteSavedDoc('${d.id}')" class="text-red-400 font-black hover:text-red-300 bg-red-950/50 px-2 py-1 rounded-lg">🗑️</button>
      </div>
    `).join('');

  document.getElementById('selectDocForAI').innerHTML = `<option value="ALL">📚 USAR TODOS LOS DOCUMENTOS (${docs.length})</option>` + docs.map(d => `<option value="${d.id}">📄 ${d.title}</option>`).join('');
  document.getElementById('audiobookDocSelect').innerHTML = `<option value="ALL">📚 TODOS LOS DOCUMENTOS DE LA MATERIA (${docs.length})</option>` + docs.map(d => `<option value="${d.id}">📖 ${d.title}</option>`).join('');

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
// 6. GESTIÓN DE ARCHIVOS Y RETROALIMENTACIÓN LOCAL (ML/RAG)
// ==========================================
window.handleUploadDoc = async function(e) {
  e.preventDefault();
  const btn = document.getElementById('btnUploadDoc');
  const originalText = btn.innerHTML; btn.innerHTML = '⏳ Subiendo...'; btn.disabled = true;
  const fd = new FormData();
  fd.append('username', currentUser.username);
  fd.append('subjectId', activeSubjectId);
  fd.append('docTitle', document.getElementById('docTitle').value);
  fd.append('youtubeUrl', document.getElementById('youtubeUrlInput').value);
  fd.append('isOfficialCurriculum', document.getElementById('isOfficialDocCheck')?.checked || false);
  const files = document.getElementById('docFiles').files;
  for (let i = 0; i < files.length; i++) { fd.append('documents', files[i]); }
  try {
    const res = await apiFetch('/api/documents', { method: 'POST', body: fd });
    const data = await res.json();
    if (res.ok) {
      currentUser = data.user;
      document.getElementById('docTitle').value = '';
      document.getElementById('docFiles').value = '';
      document.getElementById('selectedFilesPreview').textContent = '';
      document.getElementById('youtubeUrlInput').value = '';
      renderDashboard();
      alert('✅ Material guardado. Puedes pulsar "🧬 Retroalimentar IA" para entrenar los simuladores y mapas con este archivo.');
    } else { alert(data.error); }
  } catch (err) { alert('Error al subir.'); } finally { btn.innerHTML = originalText; btn.disabled = false; }
};

window.trainLocalKnowledgeBase = async function() {
  const docId = document.getElementById('selectDocForAI').value;
  const isOfficial = document.getElementById('isOfficialDocCheck')?.checked || false;
  const btn = document.getElementById('btnTrainKB');
  const orig = btn.innerHTML; btn.innerHTML = '⏳ Entrenando...'; btn.disabled = true;

  try {
    const res = await apiFetch('/api/knowledge/train-from-documents', {
      method: 'POST',
      body: JSON.stringify({
        username: currentUser.username,
        subjectId: activeSubjectId,
        documentId: docId,
        isOfficialCurriculum: isOfficial
      })
    });
    const data = await res.json();
    if (res.ok) {
      alert(`🧬 ${data.message}`);
      renderDashboard();
    } else {
      alert(data.error);
    }
  } catch (e) {
    alert("Error retroalimentando la base de conocimiento.");
  } finally {
    btn.innerHTML = orig; btn.disabled = false;
  }
};

window.deleteSavedDoc = async function(id) {
  if (!confirm('¿Borrar documento?')) return;
  try { const res = await apiFetch(`/api/documents/${id}`, { method: 'DELETE', body: JSON.stringify({ username: currentUser.username, subjectId: activeSubjectId }) }); if (res.ok) { currentUser = (await res.json()).user; renderDashboard(); } } catch(e) {}
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
// 7. MÓDULOS INTERACTIVOS TIPO ENCARTA (CEREBRO, SUSTANCIAS, CUERPO HUMANO, PSICOMETRÍA)
// ==========================================
window.openEncartaBrainModal = function() {
  document.getElementById('modalEncartaBrain').classList.remove('hidden');
};

window.launchEncartaBrain = async function() {
  const topic = document.getElementById('encartaBrainTopic').value.trim();
  const viewMode = document.getElementById('encartaBrainMode').value;

  document.getElementById('modalEncartaBrain').classList.add('hidden');
  const v = document.getElementById('viewerArea');
  v.classList.add('fullscreen-mode'); v.classList.remove('hidden');
  v.innerHTML = `<div class="text-center pt-32 animate-pulse"><span class="text-6xl">🧠</span><p class="text-sky-300 font-black text-2xl uppercase mt-4">Cargando Atlas Interactivo Neuropsicológico...</p></div>`;

  try {
    const res = await apiFetch('/api/encarta/neuropsychology-atlas', {
      method: 'POST',
      body: JSON.stringify({ username: currentUser.username, subjectId: activeSubjectId, topic, viewMode })
    });
    const data = await res.json();
    if (!res.ok) { alert(data.error || 'No se pudo cargar el Atlas Cerebral.'); return closeFullScreenViewer(); }

    const cards = data.multimediaCards || [];
    window.renderBrainCardDetail = function(idx) {
      const c = cards[idx];
      if (!c) return;
      document.getElementById('brainDetailPanel').innerHTML = `
        <div class="space-y-4">
          <div class="border-b border-sky-500/30 pb-3">
            <span class="text-[10px] font-black uppercase px-2.5 py-1 rounded bg-sky-950 text-sky-300 border border-sky-500/40">Área Seleccionada</span>
            <h3 class="text-2xl font-black text-white mt-2">${c.title}</h3>
          </div>
          <div class="p-4 rounded-2xl bg-slate-900 border border-slate-700 space-y-2">
            <h4 class="text-xs font-black text-cyan-300 uppercase">🔬 Neuroanatomía y Circuitos</h4>
            <p class="text-xs text-slate-200 leading-relaxed">${c.neuroanatomy}</p>
            <p class="text-xs text-sky-200/90 leading-relaxed"><b>Comunicación Inter-Área:</b> ${c.interAreaCommunication}</p>
          </div>
          <div class="p-4 rounded-2xl bg-fuchsia-950/30 border border-fuchsia-500/40 space-y-2">
            <h4 class="text-xs font-black text-fuchsia-300 uppercase">⚡ Dinámica de Dopamina y Sinapsis</h4>
            <p class="text-xs text-slate-200 leading-relaxed">${c.dopamineAndSynapseFunction}</p>
          </div>
          <div class="p-4 rounded-2xl bg-emerald-950/30 border border-emerald-500/40 space-y-2">
            <h4 class="text-xs font-black text-emerald-300 uppercase">🧩 Función Neuropsicológica y Trastornos</h4>
            <p class="text-xs text-slate-200 leading-relaxed">${c.neuropsychologyFunction}</p>
            <p class="text-xs text-rose-300 leading-relaxed"><b>Consecuencias de Lesión:</b> ${c.lesionConsequences}</p>
          </div>
          <div class="p-4 rounded-2xl bg-amber-950/30 border border-amber-500/40">
            <h4 class="text-xs font-black text-amber-300 uppercase mb-2">📋 Pruebas de Evaluación Neuropsicológica</h4>
            <div class="flex flex-wrap gap-2">${(c.evaluationTests || []).map(t => `<span class="px-2.5 py-1 rounded-lg bg-slate-900 text-amber-200 text-xs font-bold border border-amber-500/30">${t}</span>`).join('')}</div>
          </div>
          <div class="pt-2">
            <p class="text-[11px] font-black text-slate-400 uppercase mb-2">🔗 Explorar Temas Relacionados (Encarta):</p>
            <div class="flex flex-wrap gap-2">${(c.relatedTopics || []).map(rt => `<button onclick="document.getElementById('encartaBrainTopic').value='${rt.replace(/'/g, '')}'; launchEncartaBrain();" class="px-3 py-1.5 rounded-xl bg-sky-900/60 hover:bg-sky-700 text-sky-200 text-xs font-bold transition">${rt} ➔</button>`).join('')}</div>
          </div>
        </div>
      `;
    };

    const q = data.selfAssessmentChallenge;
    v.innerHTML = `
      <div class="max-w-7xl mx-auto glass-edu rounded-3xl p-8 space-y-6 border-2 border-sky-500 relative shadow-2xl">
        <button onclick="closeFullScreenViewer()" class="absolute top-6 right-6 px-5 py-2.5 rounded-2xl bg-slate-800 text-white font-bold">✕ Cerrar</button>
        <div class="border-b border-sky-500/30 pb-4">
          <span class="text-xs font-black text-sky-400 uppercase">Enciclopedia Interactiva de Neurología y Neuropsicología</span>
          <h2 class="text-3xl font-black text-white mt-1">🧠 ${data.articleTitle}</h2>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div class="lg:col-span-6 space-y-4">
            <div class="encarta-svg-container" id="brainSvgWrapper">${data.interactiveBrainSvg}</div>
            <div class="flex flex-wrap gap-2">
              ${cards.map((c, idx) => `<button onclick="renderBrainCardDetail(${idx})" class="px-3 py-2 rounded-xl bg-sky-950 hover:bg-sky-800 border border-sky-500/50 text-xs font-black text-sky-200">${c.title}</button>`).join('')}
            </div>
            ${q ? `
              <div class="p-5 rounded-2xl bg-slate-900 border border-amber-500/40 space-y-3">
                <h4 class="text-xs font-black text-amber-300 uppercase">🎯 Reto Clínico de Autoevaluación</h4>
                <p class="text-xs text-slate-200 font-bold">${q.clinicalCaseQuestion}</p>
                <div class="space-y-2">
                  ${(q.options || []).map((opt, idx) => `<button onclick="alert('${idx === q.correctIndex ? '✅ ¡Correcto!' : '❌ Revisa el circuito.'}\\n\\n${(q.detailedExplanation || '').replace(/'/g, '')}')" class="w-full text-left p-2.5 rounded-xl bg-slate-800 hover:bg-indigo-900 text-xs text-slate-200 font-medium">${opt}</button>`).join('')}
                </div>
              </div>` : ''}
          </div>
          <div class="lg:col-span-6 bg-slate-950/90 p-6 rounded-3xl border border-sky-500/30 max-h-[75vh] overflow-y-auto" id="brainDetailPanel"></div>
        </div>
      </div>
    `;

    const svgWrapper = document.getElementById('brainSvgWrapper');
    if (svgWrapper) {
      svgWrapper.addEventListener('click', (e) => {
        const target = e.target.closest('[data-area-id], [data-region-id]');
        if (target) {
          const areaId = target.getAttribute('data-area-id') || target.getAttribute('data-region-id');
          const foundIdx = cards.findIndex(c => c.areaId === areaId);
          if (foundIdx !== -1) renderBrainCardDetail(foundIdx);
        }
      });
    }
    if (cards.length > 0) renderBrainCardDetail(0);
    renderDashboard();
  } catch (err) {
    alert('Error cargando Atlas Cerebral: ' + err.message);
    closeFullScreenViewer();
  }
};

window.openSynapseCascadeModal = function() {
  document.getElementById('modalSynapseCascade').classList.remove('hidden');
};

window.launchSynapseCascade = async function() {
  const substanceLevels = {
    dopamina: document.getElementById('valDopamina').innerText,
    serotonina: document.getElementById('valSerotonina').innerText,
    cortisol: document.getElementById('valCortisol').innerText,
    gaba: document.getElementById('valGaba').innerText,
    glutamato: document.getElementById('valGlutamato').innerText
  };
  const triggerEvent = document.getElementById('cascadeTriggerInput').value.trim();

  document.getElementById('modalSynapseCascade').classList.add('hidden');
  const v = document.getElementById('viewerArea');
  v.classList.add('fullscreen-mode'); v.classList.remove('hidden');
  v.innerHTML = `<div class="text-center pt-32 animate-pulse"><span class="text-6xl">⚡</span><p class="text-fuchsia-300 font-black text-2xl uppercase mt-4">Simulando Reacción Sináptica en Cadena...</p></div>`;

  try {
    const res = await apiFetch('/api/encarta/neuro-cascade-lab', {
      method: 'POST',
      body: JSON.stringify({ username: currentUser.username, subjectId: activeSubjectId, substanceLevels, triggerEvent })
    });
    const data = await res.json();
    if (!res.ok) { alert(data.error); return closeFullScreenViewer(); }

    v.innerHTML = `
      <div class="max-w-7xl mx-auto glass-edu rounded-3xl p-8 space-y-6 border-2 border-fuchsia-500 relative shadow-2xl">
        <button onclick="closeFullScreenViewer()" class="absolute top-6 right-6 px-5 py-2.5 rounded-2xl bg-slate-800 text-white font-bold">✕ Cerrar</button>
        <div class="border-b border-fuchsia-500/30 pb-4">
          <span class="text-xs font-black text-fuchsia-400 uppercase">Laboratorio Psicofisiológico de Neurotransmisores</span>
          <h2 class="text-3xl font-black text-white mt-1">⚡ Reacción en Cascada: ${data.clinicalSyndromeAlert?.syndromeName || 'Dinámica Sináptica'}</h2>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div class="lg:col-span-6 space-y-4">
            <div class="encarta-svg-container">${data.interactiveReactionSvg}</div>
            <div class="p-5 rounded-2xl bg-amber-950/30 border border-amber-500/40 space-y-2">
              <h4 class="text-xs font-black text-amber-300 uppercase">🏛️ Integración Antropológica y Terapéutica (ICF)</h4>
              <p class="text-xs text-slate-200 leading-relaxed">${data.humanistAndTherapeuticApproach}</p>
            </div>
          </div>

          <div class="lg:col-span-6 space-y-4 max-h-[75vh] overflow-y-auto pr-2">
            <div class="p-4 rounded-2xl bg-slate-900 border border-fuchsia-500/40">
              <h4 class="text-xs font-black text-fuchsia-300 uppercase mb-3">⏱️ Cascada Fisiológica Paso a Paso</h4>
              <div class="space-y-3">
                ${(data.physiologicalCascade || []).map(st => `
                  <div class="p-3 rounded-xl bg-slate-950 border border-slate-800">
                    <div class="flex justify-between text-[11px] font-black text-cyan-300">
                      <span>Fase ${st.stageNumber}</span>
                      <span>${st.timeWindow}</span>
                    </div>
                    <p class="text-xs text-slate-200 mt-1">${st.biologicalReaction}</p>
                    <p class="text-[11px] text-fuchsia-300 mt-1">Circuitos: ${(st.affectedBrainCircuits || []).join(', ')}</p>
                  </div>
                `).join('')}
              </div>
            </div>

            <div class="p-4 rounded-2xl bg-sky-950/40 border border-sky-500/40 space-y-2">
              <h4 class="text-xs font-black text-sky-300 uppercase">🧠 Impacto Neuropsicológico y Somático</h4>
              <p class="text-xs text-slate-200"><b>Cognición:</b> ${data.neuropsychologicalEffects?.cognitiveImpact}</p>
              <p class="text-xs text-slate-200"><b>Afectividad y Conducta:</b> ${data.neuropsychologicalEffects?.emotionalAndBehavioralImpact}</p>
              <p class="text-xs text-rose-300"><b>Signos Somáticos:</b> ${(data.neuropsychologicalEffects?.somaticSymptoms || []).join(', ')}</p>
            </div>
          </div>
        </div>
      </div>
    `;
    renderDashboard();
  } catch (err) {
    alert('Error en simulación sináptica.');
    closeFullScreenViewer();
  }
};

window.openHumanBodyModal = function() {
  document.getElementById('modalHumanBody').classList.remove('hidden');
};

window.launchHumanBodyAtlas = async function() {
  const bodySystem = document.getElementById('bodySystemSelect').value;
  const specificOrgan = document.getElementById('bodyOrganInput').value.trim();
  const subj = currentUser.subjects.find(s => s.id === activeSubjectId);

  document.getElementById('modalHumanBody').classList.add('hidden');
  const v = document.getElementById('viewerArea');
  v.classList.add('fullscreen-mode'); v.classList.remove('hidden');
  v.innerHTML = `<div class="text-center pt-32 animate-pulse"><span class="text-6xl">🫀</span><p class="text-emerald-300 font-black text-2xl uppercase mt-4">Construyendo Atlas Anatómico y Fisiológico...</p></div>`;

  try {
    const res = await apiFetch('/api/interactive/human-body-explorer', {
      method: 'POST',
      body: JSON.stringify({ username: currentUser.username, bodySystem, specificOrgan, courseName: subj?.name })
    });
    const data = await res.json();
    if (!res.ok) { alert(data.error); return closeFullScreenViewer(); }

    const organs = data.anatomicalStructures || [];
    window.renderOrganDetail = function(idx) {
      const o = organs[idx];
      if (!o) return;
      document.getElementById('organDetailPanel').innerHTML = `
        <div class="space-y-4">
          <h3 class="text-2xl font-black text-emerald-300 border-b border-emerald-500/30 pb-3">${o.organName}</h3>
          <div class="p-4 rounded-2xl bg-slate-900 border border-slate-700"><h4 class="text-xs font-black text-cyan-300 uppercase mb-1">🔬 Anatomía Macro y Microscópica</h4><p class="text-xs text-slate-200 leading-relaxed">${o.macroAndMicroAnatomy}</p></div>
          <div class="p-4 rounded-2xl bg-emerald-950/30 border border-emerald-500/40"><h4 class="text-xs font-black text-emerald-300 uppercase mb-1">⚙️ Fisiología Normal</h4><p class="text-xs text-slate-200 leading-relaxed">${o.normalPhysiology}</p></div>
          <div class="p-4 rounded-2xl bg-rose-950/30 border border-rose-500/40"><h4 class="text-xs font-black text-rose-300 uppercase mb-1">🩺 Fisiopatología</h4><p class="text-xs text-slate-200 leading-relaxed">${o.pathophysiology}</p></div>
          <div class="p-4 rounded-2xl bg-amber-950/30 border border-amber-500/40"><h4 class="text-xs font-black text-amber-300 uppercase mb-1">🔗 Correlación Neuroendocrina / Sistémica</h4><p class="text-xs text-slate-200 leading-relaxed">${o.psychosomaticOrSystemicLink}</p></div>
        </div>
      `;
    };

    v.innerHTML = `
      <div class="max-w-7xl mx-auto glass-edu rounded-3xl p-8 space-y-6 border-2 border-emerald-500 relative shadow-2xl">
        <button onclick="closeFullScreenViewer()" class="absolute top-6 right-6 px-5 py-2.5 rounded-2xl bg-slate-800 text-white font-bold">✕ Cerrar</button>
        <h2 class="text-3xl font-black text-emerald-300 border-b border-emerald-500/30 pb-4">🫀 ${bodySystem}</h2>
        <div class="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div class="lg:col-span-5 space-y-4">
            <div class="encarta-svg-container" id="bodySvgWrapper">${data.interactiveBodySvg}</div>
            <div class="flex flex-wrap gap-2">
              ${organs.map((o, idx) => `<button onclick="renderOrganDetail(${idx})" class="px-3 py-2 rounded-xl bg-emerald-950 hover:bg-emerald-800 border border-emerald-500/50 text-xs font-black text-emerald-200">${o.organName}</button>`).join('')}
            </div>
          </div>
          <div class="lg:col-span-7 bg-slate-950/90 p-6 rounded-3xl border border-emerald-500/30 max-h-[75vh] overflow-y-auto" id="organDetailPanel"></div>
        </div>
      </div>
    `;
    if (organs.length > 0) renderOrganDetail(0);
    renderDashboard();
  } catch (err) {
    alert('Error cargando Atlas Anatómico.');
    closeFullScreenViewer();
  }
};

window.launchPsychometricsLab = async function() {
  const testName = document.getElementById('psychTestName').value.trim();
  const rawScores = document.getElementById('psychRawScores').value.trim();
  const clinicalContext = document.getElementById('psychContext').value.trim();
  if (!testName || !rawScores) return alert("Ingresa el nombre de la prueba y las puntuaciones.");

  document.getElementById('modalPsychometrics').classList.add('hidden');
  const v = document.getElementById('viewerArea');
  v.classList.add('fullscreen-mode'); v.classList.remove('hidden');
  v.innerHTML = `<div class="text-center pt-32 animate-pulse"><span class="text-6xl">📊</span><p class="text-violet-300 font-black text-2xl uppercase mt-4">Calculando Baremos e Informe Psicométrico...</p></div>`;

  try {
    const res = await apiFetch('/api/agents/psychometrics-lab', {
      method: 'POST',
      body: JSON.stringify({ username: currentUser.username, testName, rawScores, clinicalContext })
    });
    const data = await res.json();
    if (!res.ok) { alert(data.error); return closeFullScreenViewer(); }

    v.innerHTML = `
      <div class="max-w-5xl mx-auto glass-edu rounded-3xl p-8 space-y-6 border-2 border-violet-500 relative shadow-2xl">
        <button onclick="closeFullScreenViewer()" class="absolute top-6 right-6 px-5 py-2.5 rounded-2xl bg-slate-800 text-white font-bold">✕ Cerrar</button>
        <h2 class="text-3xl font-black text-violet-300 border-b border-violet-500/30 pb-4">📊 Informe Psicométrico: ${testName}</h2>
        <div class="overflow-x-auto bg-slate-900 rounded-2xl border border-violet-500/40">
          <table class="w-full text-left text-xs text-slate-200">
            <thead class="bg-slate-950 text-violet-300 uppercase"><tr><th class="p-3">Subescala</th><th class="p-3">PD</th><th class="p-3">Punt. Z</th><th class="p-3">Punt. T</th><th class="p-3">Percentil</th><th class="p-3">Rango Clínico</th></tr></thead>
            <tbody class="divide-y divide-slate-800">
              ${(data.calculations || []).map(c => `<tr><td class="p-3 font-bold">${c.subscale}</td><td class="p-3">${c.rawScore}</td><td class="p-3">${c.zScore}</td><td class="p-3">${c.tScore}</td><td class="p-3">${c.percentile}%</td><td class="p-3 text-cyan-300 font-bold">${c.clinicalRange}</td></tr>`).join('')}
            </tbody>
          </table>
        </div>
        <div class="p-6 rounded-2xl bg-slate-900 border border-slate-700 text-sm text-slate-200 leading-relaxed whitespace-pre-wrap">${data.integratedClinicalReport}</div>
      </div>
    `;
    renderDashboard();
  } catch (err) {
    alert('Error en laboratorio psicométrico.');
    closeFullScreenViewer();
  }
};

// ==========================================
// 8. EXPORTACIÓN APA / VANCOUVER OFICIAL A WORD
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
// 9. CEREBRO DE IA (RAG, APA/VANCOUVER, INVESTIGACIÓN, SIMULADOR)
// ==========================================
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

window.generateAPATask = async function() {
  const topic = document.getElementById('apaTopic').value.trim();
  if (!topic) return alert("Escribe el tema.");
  const btn = document.getElementById('btnAPA'); btn.innerText = "Redactando..."; btn.disabled = true;
  try {
    const res = await apiFetch('/api/generate-apa-advanced', { method: 'POST', body: JSON.stringify({ username: currentUser.username, subjectId: activeSubjectId, topic }) });
    const data = await res.json();
    if (res.ok) {
      document.getElementById('modalAPA').classList.add('hidden');
      exportToWord(`Ensayo_${currentUser.citationStyle || 'APA7'}_${topic.substring(0,10)}`, data.apaDocument);
      renderDashboard();
    } else alert(data.error);
  } catch (e) { alert("Error al generar."); }
  finally { btn.innerText = "Redactar"; btn.disabled = false; }
};

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
    let fullDocumentHTML = `<div style="text-align:center;"><h1>Tesis: ${topic}</h1><br><p>${currentUser.universityName || 'Universidad'} - ${currentUser.career}</p></div><br><hr><br>`;
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
    barEl.style.width = "0%"; btn.innerText = "Iniciar";
  }
};

let clinicalSimulatorHistory = '';
window.sendSimulatorMessage = async function() {
  const input = document.getElementById('simulatorInput'); 
  const msg = input.value.trim(); if (!msg) return;
  const box = document.getElementById('simulatorChatBox'); 
  const docId = document.getElementById('selectDocForAI').value;
  
  box.innerHTML += `<div class="p-4 rounded-2xl bg-slate-800 text-right text-slate-200 font-medium ml-12 shadow-sm border border-slate-700"><b>Estudiante:</b> ${msg}</div>`;
  input.value = ''; clinicalSimulatorHistory += `\nEstudiante: ${msg}`;
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
// 10. VISUALES, MAPAS CONCEPTUALES CON IMÁGENES, STORYBOOK + LÍNEA DE TIEMPO Y SUITE HARVARD
// ==========================================
window.askRealistPhilosophy = async function() {
  const query = document.getElementById('filosofiaInput').value.trim();
  if (!query) return alert("Ingresa un tema.");
  const v = document.getElementById('viewerArea'); v.classList.add('fullscreen-mode'); v.classList.remove('hidden');
  document.getElementById('modalFilosofia').classList.add('hidden');
  v.innerHTML = `<div class="text-center pt-32 animate-pulse"><span class="text-6xl">🏛️</span><p class="text-amber-300 font-black text-2xl uppercase mt-4">Analizando bajo Antropología Personalista...</p></div>`;
  try {
    const res = await apiFetch('/api/philosophy-realism', { method: 'POST', body: JSON.stringify({ username: currentUser.username, query }) });
    const data = await res.json();
    v.innerHTML = `<div class="max-w-5xl mx-auto glass-edu rounded-3xl p-10 space-y-6 border-2 border-amber-500 mt-10 relative shadow-2xl"><button onclick="closeFullScreenViewer()" class="absolute top-6 right-6 px-5 py-3 rounded-2xl bg-slate-800 text-white font-bold">✕ Cerrar</button><h2 class="text-3xl font-black text-amber-300 border-b border-amber-500/30 pb-4">🏛️ Síntesis Personalista y Logoterapéutica</h2><div class="bg-slate-900 p-8 rounded-2xl text-slate-100 leading-relaxed">${data.answer}</div></div>`;
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
  v.innerHTML = `<div class="text-center pt-32 animate-pulse"><span class="text-6xl">🧠</span><p class="text-teal-300 font-black text-2xl uppercase mt-4">Construyendo Mapa Conceptual con Ilustraciones y Citas...</p></div>`;
  try {
    const res = await apiFetch('/api/generate-mindmap', {
      method: 'POST',
      body: JSON.stringify({ username: currentUser.username, subjectId: activeSubjectId, documentId: docId })
    });
    const data = await res.json();
    if (!res.ok) { alert(data.error); return closeFullScreenViewer(); }

    const nodes = data.interactiveNodes || [];
    v.innerHTML = `
      <div class="max-w-7xl mx-auto glass-edu rounded-3xl p-8 border-2 border-teal-500 mt-4 relative space-y-6">
        <button onclick="closeFullScreenViewer()" class="absolute top-6 right-6 px-5 py-2.5 rounded-2xl bg-slate-800 text-white font-bold z-50">✕ Cerrar</button>
        <div class="border-b border-teal-500/30 pb-4">
          <span class="text-xs font-black text-teal-400 uppercase">Codificación Dual · Mapa Conceptual Basado en Evidencia</span>
          <h2 class="text-3xl font-black text-white mt-1">🧠 ${data.mapTitle || 'Mapa Conceptual'}</h2>
          <p class="text-xs text-slate-300 mt-1">${data.centralThesis || ''}</p>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div class="lg:col-span-7 space-y-4">
            <div class="encarta-svg-container">${data.visualDiagramSvg || ''}</div>
            <div class="bg-slate-900 p-4 rounded-2xl overflow-auto flex justify-center border border-teal-500/30">
              <div class="mermaid">${data.mermaidCode}</div>
            </div>
          </div>
          <div class="lg:col-span-5 space-y-3 max-h-[75vh] overflow-y-auto pr-2">
            <h3 class="text-xs font-black text-teal-300 uppercase">📑 Nodos Conceptuales y Citas Verificables</h3>
            ${nodes.map(n => `
              <div class="p-4 rounded-2xl bg-slate-900 border border-teal-500/40 space-y-1.5">
                <h4 class="text-sm font-black text-white">${n.conceptName}</h4>
                <p class="text-xs text-slate-200 leading-relaxed">${n.objectiveDefinition}</p>
                <p class="text-[11px] text-cyan-300"><b>Relación:</b> ${n.causalConnection}</p>
                <div class="text-[10px] text-emerald-300 bg-emerald-950/60 px-2.5 py-1 rounded-lg border border-emerald-500/30 mt-1">
                  📚 Fuente: ${n.exactSourceCitation}
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      </div>`;
    setTimeout(() => { mermaid.init(undefined, document.querySelectorAll('.mermaid')); }, 100);
    renderDashboard();
  } catch (err) { alert('Error generando mapa conceptual.'); closeFullScreenViewer(); }
};

window.generateEvoStorybook = async function() {
  const docId = document.getElementById('selectDocForAI').value;
  const v = document.getElementById('viewerArea'); v.classList.add('fullscreen-mode'); v.classList.remove('hidden');
  v.innerHTML = `<div class="text-center pt-32 animate-pulse"><span class="text-6xl">📖</span><p class="text-cyan-300 font-black text-2xl uppercase mt-4">Creando Storybook Ilustrado y Línea de Tiempo Verídica...</p></div>`;
  try {
    const res = await apiFetch('/api/generate-evolutionary-storybook', { method: 'POST', body: JSON.stringify({ username: currentUser.username, subjectId: activeSubjectId, documentId: docId }) });
    const data = await res.json();
    if (res.ok) { currentUser = data.user; renderDashboard(); openStorybook(data.storybook); }
    else { alert(data.error); closeFullScreenViewer(); }
  } catch (err) { alert('Error.'); closeFullScreenViewer(); }
};

window.openStorybook = function(sb) {
  const v = document.getElementById('viewerArea'); v.classList.add('fullscreen-mode'); v.classList.remove('hidden');
  v.innerHTML = `
    <div class="max-w-6xl mx-auto glass-edu rounded-3xl p-8 space-y-8 border-2 border-cyan-500 mt-4 relative">
      <button onclick="closeFullScreenViewer()" class="absolute top-6 right-6 px-5 py-2.5 rounded-2xl bg-slate-800 text-white font-bold">✕ Cerrar</button>
      
      <div class="border-b border-cyan-500/30 pb-4">
        <span class="text-xs font-black text-cyan-400 uppercase">Narrativa Científica Ilustrada y Línea de Tiempo Verídica</span>
        <h2 class="text-3xl font-black text-white mt-1">📖 ${sb.title}</h2>
        <p class="text-xs text-slate-300 mt-2 bg-slate-900 p-4 rounded-2xl border border-slate-700">${sb.summary}</p>
      </div>

      <!-- LÍNEA DE TIEMPO CRONOLÓGICA / SECUENCIAL -->
      <div class="space-y-3">
        <h3 class="text-sm font-black text-amber-300 uppercase">⏳ Línea de Tiempo Evolutiva / Secuencial del Documento</h3>
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
          ${(sb.timeline || []).map(t => `
            <div class="p-4 rounded-2xl bg-slate-900 border-l-4 border-amber-400 space-y-1.5">
              <span class="text-[10px] font-black uppercase px-2 py-0.5 rounded bg-amber-950 text-amber-300">Paso ${t.step} · ${t.chronologicalMarker || ''}</span>
              <h4 class="text-sm font-black text-white">${t.title}</h4>
              <p class="text-xs text-slate-300">${t.description}</p>
              ${t.sourceReference ? `<p class="text-[10px] text-cyan-400 pt-1">📌 ${t.sourceReference}</p>` : ''}
            </div>
          `).join('')}
        </div>
      </div>

      <!-- ESCENAS ILUSTRADAS CON EVIDENCIA TEXTUAL -->
      <div class="space-y-3">
        <h3 class="text-sm font-black text-cyan-300 uppercase">🎨 Escenas Conceptuales Ilustradas</h3>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
          ${(sb.scenes || []).map(sc => `
            <div class="cartoon-card p-5 space-y-3">
              <div class="flex justify-between items-center">
                <span class="text-xs font-black text-cyan-400">Escena ${sc.sceneNumber} · ${sc.characterName}</span>
                <span class="text-[10px] px-2 py-0.5 rounded bg-cyan-950 text-cyan-200 font-bold">${sc.academicConcept}</span>
              </div>
              ${sc.sceneIllustrationSvg ? `<div class="encarta-svg-container">${sc.sceneIllustrationSvg}</div>` : ''}
              <p class="text-xs text-slate-200 leading-relaxed">${sc.storyDialogue}</p>
              ${sc.verbatimSourceEvidence ? `<div class="text-[10px] text-emerald-300 bg-emerald-950/50 p-2.5 rounded-xl border border-emerald-500/30">📚 Evidencia: ${sc.verbatimSourceEvidence}</div>` : ''}
            </div>
          `).join('')}
        </div>
      </div>

      <!-- EVALUACIÓN TAXONOMÍA DE BLOOM -->
      ${(sb.quiz && sb.quiz.length) ? `
        <div class="p-6 rounded-2xl bg-slate-900 border border-indigo-500/40 space-y-4">
          <h3 class="text-sm font-black text-indigo-300 uppercase">🎯 Recuperación Activa (Taxonomía de Bloom)</h3>
          ${sb.quiz.map((q, qIdx) => `
            <div class="space-y-2 border-b border-slate-800 pb-4">
              <span class="text-[10px] font-black text-purple-300 uppercase">${q.bloomLevel || 'Análisis'}</span>
              <p class="text-xs font-bold text-white">${qIdx + 1}. ${q.question}</p>
              <div class="grid grid-cols-1 md:grid-cols-2 gap-2">
                ${(q.options || []).map((opt, oIdx) => `
                  <button onclick="alert('${oIdx === q.correctIndex ? '✅ ¡Correcto!' : '❌ Revisa la evidencia.'}\\n\\n${(q.heroExplanation || '').replace(/'/g, '')}')" class="text-left p-2.5 rounded-xl bg-slate-800 hover:bg-indigo-900 text-xs text-slate-200">${opt}</button>
                `).join('')}
              </div>
            </div>
          `).join('')}
        </div>
      ` : ''}
    </div>
  `;
};

window.launchHarvardStudySuite = async function() {
  const docId = document.getElementById('selectDocForAI').value;
  const v = document.getElementById('viewerArea'); v.classList.add('fullscreen-mode'); v.classList.remove('hidden');
  v.innerHTML = `<div class="text-center pt-32 animate-pulse"><span class="text-6xl">🎓</span><p class="text-amber-300 font-black text-2xl uppercase mt-4">Generando Suite de Estudio Científico (Cornell, Feynman y Active Recall)...</p></div>`;

  try {
    const res = await apiFetch('/api/pedagogy/harvard-study-suite', {
      method: 'POST',
      body: JSON.stringify({ username: currentUser.username, subjectId: activeSubjectId, documentId: docId })
    });
    const data = await res.json();
    if (!res.ok) { alert(data.error); return closeFullScreenViewer(); }

    v.innerHTML = `
      <div class="max-w-6xl mx-auto glass-edu rounded-3xl p-8 space-y-6 border-2 border-amber-500 mt-4 relative">
        <button onclick="closeFullScreenViewer()" class="absolute top-6 right-6 px-5 py-2.5 rounded-2xl bg-slate-800 text-white font-bold">✕ Cerrar</button>
        <h2 class="text-3xl font-black text-amber-300 border-b border-amber-500/30 pb-4">🎓 Suite de Aprendizaje Científico (Basado en Evidencia)</h2>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div class="p-5 rounded-2xl bg-slate-900 border border-cyan-500/40 space-y-3">
            <h3 class="text-sm font-black text-cyan-300 uppercase">📝 Sistema Cornell</h3>
            <div class="space-y-2">
              <p class="text-xs font-bold text-slate-400">Preguntas Disparadoras:</p>
              <ul class="list-disc pl-4 text-xs text-cyan-200 space-y-1">${(data.cornellNotes?.cueQuestions || []).map(q => `<li>${q}</li>`).join('')}</ul>
              <p class="text-xs font-bold text-slate-400 pt-2">Notas con Citas:</p>
              <ul class="list-disc pl-4 text-xs text-slate-200 space-y-1">${(data.cornellNotes?.detailedNotes || []).map(n => `<li>${n}</li>`).join('')}</ul>
              <div class="p-3 rounded-xl bg-cyan-950/40 text-xs text-cyan-100 mt-2"><b>Síntesis:</b> ${data.cornellNotes?.synthesisSummary || ''}</div>
            </div>
          </div>

          <div class="space-y-4">
            <div class="p-5 rounded-2xl bg-slate-900 border border-emerald-500/40 space-y-2">
              <h3 class="text-sm font-black text-emerald-300 uppercase">💡 Técnica Feynman (Claridad Conceptual)</h3>
              <p class="text-xs text-slate-200 leading-relaxed">${data.feynmanSimplification}</p>
            </div>
            <div class="p-5 rounded-2xl bg-slate-900 border border-purple-500/40 space-y-2">
              <h3 class="text-sm font-black text-purple-300 uppercase">🃏 Tarjetas Active Recall (Clic para ver respuesta)</h3>
              <div class="space-y-2 max-h-60 overflow-y-auto pr-1">
                ${(data.activeRecallFlashcards || []).map(fc => `
                  <details class="p-3 rounded-xl bg-slate-950 border border-slate-800 cursor-pointer">
                    <summary class="text-xs font-bold text-purple-200">${fc.frontQuestion}</summary>
                    <p class="text-xs text-emerald-300 mt-2 pt-2 border-t border-slate-800">${fc.backAnswerWithCitation}</p>
                  </details>
                `).join('')}
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
    renderDashboard();
  } catch (e) { alert("Error generando suite de estudio."); closeFullScreenViewer(); }
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

// ==========================================
// 11. AUDIOLIBROS DE LECTURA CORRIDA Y RESÚMENES REALES
// ==========================================
window.generateFluidAudiobook = async function() {
  const selectedDocId = document.getElementById('audiobookDocSelect').value || 'ALL';
  const v = document.getElementById('viewerArea'); v.classList.add('fullscreen-mode'); v.classList.remove('hidden');
  v.innerHTML = `<div class="text-center pt-32 animate-pulse"><span class="text-6xl">🎧</span><p class="text-rose-400 font-black text-2xl uppercase mt-4">Procesando Documentos y Generando Narración Corrida...</p></div>`;
  try {
    const res = await apiFetch('/api/audiobook-chapters', {
      method: 'POST',
      body: JSON.stringify({ username: currentUser.username, subjectId: activeSubjectId, documentId: selectedDocId })
    });
    const data = await res.json();
    if (!res.ok) { alert(data.error); return closeFullScreenViewer(); }
    currentUser = data.user;
    renderDashboard();
    openSavedAudiobook(data.audiobook);
  } catch (err) {
    alert('Error al generar el audiolibro.');
    closeFullScreenViewer();
  }
};

window.openSavedAudiobook = function(ab) {
  const v = document.getElementById('viewerArea'); v.classList.add('fullscreen-mode'); v.classList.remove('hidden');
  window.currentAudiobookSummary = ab.bookSummary || '';
  window.currentAudiobookTitle = ab.audiobookTitle || 'Audiolibro';
  let currentChapterIdx = 0;
  let currentRate = 1.0;

  function playTextFluidly(textToRead, autoAdvance = false) {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(cleanTextForAudio(textToRead));
    utterance.lang = 'es-ES';
    utterance.rate = currentRate;
    if (autoAdvance) {
      utterance.onend = () => {
        if (currentChapterIdx < ab.chapters.length - 1) {
          currentChapterIdx++;
          renderAudiobookUI();
          playCurrentChapter();
        }
      };
    }
    window.speechSynthesis.speak(utterance);
  }

  function playCurrentChapter() {
    const ch = ab.chapters[currentChapterIdx];
    playTextFluidly(`${ch.chapterTitle} ${ch.chapterContent}`, true);
  }

  window.playAudiobookSummary = () => playTextFluidly(ab.bookSummary || ab.executiveSummaryReadable, false);
  window.setAudiobookRate = (r) => { currentRate = r; playCurrentChapter(); };
  window.jumpToChapter = (idx) => { currentChapterIdx = idx; renderAudiobookUI(); playCurrentChapter(); };
  window.downloadAudiobookSummaryWord = () => {
    const html = `<h1>${ab.audiobookTitle}</h1><h2>Resumen Ejecutivo Académico</h2><p>${ab.executiveSummaryReadable || ab.bookSummary}</p>` +
      ab.chapters.map(c => `<h3>${c.chapterTitle}</h3><p>${c.chapterSummary || ''}</p>`).join('');
    exportToWord(`Resumen_${ab.audiobookTitle.substring(0, 15)}`, html);
  };

  function renderAudiobookUI() {
    const activeCh = ab.chapters[currentChapterIdx];
    v.innerHTML = `
      <div class="max-w-6xl mx-auto glass-edu rounded-3xl p-8 space-y-6 border-2 border-rose-500 relative shadow-2xl mt-2">
        <button onclick="closeFullScreenViewer(); window.speechSynthesis.cancel();" class="absolute top-6 right-6 px-5 py-2.5 rounded-2xl bg-red-950 text-red-300 font-bold z-10">✕ Cerrar</button>
        
        <div class="border-b border-rose-500/30 pb-4">
          <span class="text-xs font-black text-rose-400 uppercase">Audiolibro de Estudio Corrido (Sin comas ni caracteres)</span>
          <h2 class="text-3xl font-black text-white mt-1">🎧 ${ab.audiobookTitle}</h2>
        </div>

        <div class="p-5 rounded-2xl bg-slate-900/90 border border-rose-500/40 space-y-3">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <h3 class="text-sm font-black text-rose-300 uppercase">📑 Resumen Ejecutivo Real del Documento</h3>
            <div class="flex gap-2">
              <button onclick="playAudiobookSummary()" class="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-black">▶️ Escuchar Resumen Corrido</button>
              <button onclick="downloadAudiobookSummaryWord()" class="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black">📥 Descargar Resumen (.doc)</button>
            </div>
          </div>
          <p class="text-xs text-slate-200 leading-relaxed">${ab.executiveSummaryReadable || ab.bookSummary}</p>
          ${(ab.keyTakeaways && ab.keyTakeaways.length) ? `<div class="flex flex-wrap gap-2 pt-1">${ab.keyTakeaways.map(k => `<span class="px-2.5 py-1 rounded-lg bg-rose-950/60 border border-rose-500/30 text-[11px] text-rose-200">✓ ${k}</span>`).join('')}</div>` : ''}
        </div>

        <div class="flex flex-wrap items-center justify-between gap-3 bg-slate-950 p-3.5 rounded-2xl border border-slate-800">
          <div class="flex gap-2">
            <button onclick="window.speechSynthesis.pause()" class="px-4 py-2 rounded-xl bg-slate-800 text-white text-xs font-black">⏸ Pausar</button>
            <button onclick="window.speechSynthesis.resume()" class="px-4 py-2 rounded-xl bg-slate-800 text-white text-xs font-black">▶️ Reanudar</button>
            <button onclick="window.speechSynthesis.cancel()" class="px-4 py-2 rounded-xl bg-red-950 text-red-300 text-xs font-black">⏹ Detener</button>
          </div>
          <div class="flex items-center gap-2 text-xs">
            <span class="text-slate-400 font-bold">Velocidad:</span>
            ${[0.9, 1.0, 1.25, 1.5].map(r => `<button onclick="setAudiobookRate(${r})" class="px-2.5 py-1 rounded-lg font-black ${currentRate === r ? 'bg-rose-600 text-white' : 'bg-slate-800 text-slate-300'}">${r}x</button>`).join('')}
          </div>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div class="space-y-2.5 max-h-[380px] overflow-y-auto pr-2">
            ${ab.chapters.map((ch, idx) => `
              <button onclick="jumpToChapter(${idx})" class="w-full text-left p-3.5 rounded-xl text-xs font-bold transition ${idx === currentChapterIdx ? 'bg-rose-900 border border-rose-400 text-white shadow-lg' : 'bg-slate-900 text-slate-400 hover:text-white'}">
                <div class="font-black">${idx + 1}. ${ch.chapterTitle}</div>
                ${ch.chapterSummary ? `<div class="text-[11px] opacity-80 mt-1 line-clamp-2">${ch.chapterSummary}</div>` : ''}
              </button>
            `).join('')}
          </div>
          <div class="lg:col-span-2 bg-slate-900 p-6 rounded-3xl max-h-[380px] overflow-y-auto space-y-3 border border-slate-800">
            <h4 class="text-lg font-black text-rose-300">${activeCh.chapterTitle}</h4>
            <p class="text-sm text-slate-200 leading-relaxed whitespace-pre-wrap">${activeCh.chapterContent}</p>
          </div>
        </div>
      </div>
    `;
  }

  renderAudiobookUI();
  playCurrentChapter();
};
