const screens = [...document.querySelectorAll('.screen')];
const firebaseConfig = window.ECOSCAN_FIREBASE_CONFIG || {};
const API_BASE = (window.ECOSCAN_API_BASE || 'http://127.0.0.1:8000').replace(/\/$/, '');

const startScanBtn = document.getElementById('startScanBtn');
const saveBtn = document.getElementById('saveBtn');
const selectImageBtn = document.getElementById('selectImageBtn');
const imageInput = document.getElementById('imageInput');
const themeSwitch = document.getElementById('themeSwitch');
const notifSwitch = document.getElementById('notifSwitch');
const loginForm = document.getElementById('loginForm');
const registerForm = document.getElementById('registerForm');
const goRegisterBtn = document.getElementById('goRegisterBtn');
const backToLoginBtn = document.getElementById('backToLoginBtn');
const forgotPasswordBtn = document.getElementById('forgotPasswordBtn');
const googleLoginBtn = document.getElementById('googleLoginBtn');
const googleRegisterBtn = document.getElementById('googleRegisterBtn');
const checkVerificationBtn = document.getElementById('checkVerificationBtn');
const resendVerificationBtn = document.getElementById('resendVerificationBtn');
const verifyLogoutBtn = document.getElementById('verifyLogoutBtn');
const logoutBtn = document.getElementById('logoutBtn');
const locateBtn = document.getElementById('locateBtn');
const cameraFeed = document.getElementById('cameraFeed');
const overlay = document.getElementById('overlay');
const cameraFallback = document.getElementById('cameraFallback');

let auth = null;
let currentUser = null;
let authReady = false;
let currentScreen = 'loginScreen';
let stream = null;
let model = null;
let detectionLoopActive = false;
let lastPredictions = [];
let lastDetectionData = null;
let staticImageMode = false;
let map = null;
let mapMarkers = [];
let detections = [];

const WASTE_RULES = {
  papel: { category: 'Papel', bin: '🔵 Azul', dest: 'Reciclagem', time: '3–6 meses', fact: 'Papel e papelão devem estar, de preferência, secos e sem restos de comida.' },
  plastico: { category: 'Plástico', bin: '🔴 Vermelha', dest: 'Reciclagem', time: 'Varia por material', fact: 'Garrafas e embalagens plásticas podem ser encaminhadas à reciclagem.' },
  vidro: { category: 'Vidro', bin: '🟢 Verde', dest: 'Reciclagem', time: 'Muito longo', fact: 'Vidro pode ser reciclado repetidas vezes e deve ser encaminhado para coleta apropriada.' },
  metal: { category: 'Metal', bin: '🟡 Amarela', dest: 'Reciclagem', time: 'Varia por material', fact: 'Latas e outros metais devem ser encaminhados à reciclagem.' },
  organico: { category: 'Orgânico', bin: '🟤 Marrom', dest: 'Compostagem', time: 'Varia', fact: 'Restos de alimentos e partes vegetais podem ser destinados à compostagem.' },
  eletronico: { category: 'Eletrônico', bin: '📦 Coleta especial', dest: 'Logística reversa', time: 'Indeterminado', fact: 'Eletrônicos precisam de pontos de coleta ou logística reversa.' },
  rejeito: { category: 'Rejeito', bin: '⚫ Cinza/Preta', dest: 'Rejeitos', time: 'Varia', fact: 'Use esta categoria somente quando o item não tiver um destino reciclável conhecido.' },
  indeterminado: { category: 'Indeterminado', bin: '📌 Verificar', dest: 'Consulta local', time: '—', fact: 'A IA reconheceu o objeto, mas não conseguiu indicar um descarte seguro automaticamente.' }
};

const CATEGORY_COLORS = {
  Orgânico: '#8b5a2b', Papel: '#2f6ef3', Plástico: '#df4b42', Vidro: '#43a047', Metal: '#d6a800', Eletrônico: '#7c3aed', Rejeito: '#5b6068', Indeterminado: '#43a047'
};

const ALIASES = {
  banana: 'organico', apple: 'organico', orange: 'organico', broccoli: 'organico', carrot: 'organico', sandwich: 'organico', 'hot dog': 'organico', pizza: 'organico', donut: 'organico', cake: 'organico',
  bottle: 'plastico', plastic_bottle: 'plastico', cup: 'indeterminado', bowl: 'indeterminado',
  'wine glass': 'vidro', vase: 'vidro',
  book: 'papel',
  laptop: 'eletronico', mouse: 'eletronico', keyboard: 'eletronico', 'cell phone': 'eletronico', tv: 'eletronico', remote: 'eletronico', microwave: 'eletronico', oven: 'eletronico', toaster: 'eletronico', refrigerator: 'eletronico',
  fork: 'metal', knife: 'metal', spoon: 'metal', scissors: 'metal',
};

init();
initializeFirebase();

function init() {
  applyTheme(getTheme());
  document.addEventListener('click', handleGlobalClicks);
  loginForm?.addEventListener('submit', handleLogin);
  registerForm?.addEventListener('submit', handleRegister);
  goRegisterBtn?.addEventListener('click', () => navigateTo('registerScreen'));
  backToLoginBtn?.addEventListener('click', () => navigateTo('loginScreen'));
  forgotPasswordBtn?.addEventListener('click', handleForgotPassword);
  googleLoginBtn?.addEventListener('click', handleGoogleSignIn);
  googleRegisterBtn?.addEventListener('click', handleGoogleSignIn);
  checkVerificationBtn?.addEventListener('click', checkEmailVerification);
  resendVerificationBtn?.addEventListener('click', resendVerificationEmail);
  verifyLogoutBtn?.addEventListener('click', handleLogout);
  logoutBtn?.addEventListener('click', handleLogout);
  startScanBtn?.addEventListener('click', () => navigateTo('cameraScreen'));
  saveBtn?.addEventListener('click', saveCurrentDetection);
  selectImageBtn?.addEventListener('click', () => imageInput?.click());
  imageInput?.addEventListener('change', handleImageSelection);
  themeSwitch?.addEventListener('click', () => applyTheme(getTheme() === 'light' ? 'dark' : 'light'));
  notifSwitch?.addEventListener('click', () => notifSwitch.classList.toggle('on'));
  locateBtn?.addEventListener('click', locateEcoPoints);
  window.addEventListener('resize', resizeOverlay);
  document.addEventListener('visibilitychange', () => { if (document.hidden) stopCamera(); });
  window.addEventListener('beforeunload', stopCamera);
  renderCreators();
  if (window.lucide) lucide.createIcons();
}

function initializeFirebase() {
  if (!window.firebase?.auth) {
    setAuthMessage('loginMessage', 'Firebase não foi carregado. Verifique a internet.', 'error');
    return;
  }
  if (!firebaseConfig.apiKey || firebaseConfig.apiKey === 'COLE_AQUI') {
    setAuthMessage('loginMessage', 'Configure o Firebase no frontend/config.js para entrar.', 'info');
    return;
  }
  try {
    if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
    auth = firebase.auth();
    auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL).catch(console.error);
    auth.onAuthStateChanged(async (user) => {
      currentUser = user;
      authReady = true;
      if (!user) { navigateTo('loginScreen'); updateUserUI(null); detections = []; return; }
      updateUserUI(user);
      if (!user.emailVerified && user.providerData.some(p => p.providerId === 'password')) {
        navigateTo('verifyScreen');
        setAuthMessage('verifyMessage', `Confirme o e-mail ${user.email} para continuar.`, 'info');
        return;
      }
      await loadDetections();
      navigateTo('homeScreen');
    });
    auth.getRedirectResult().catch(error => setAuthMessage('loginMessage', firebaseAuthError(error), 'error'));
  } catch (error) {
    console.error(error);
    setAuthMessage('loginMessage', 'Não foi possível inicializar o Firebase.', 'error');
  }
}

async function handleLogin(event) {
  event.preventDefault();
  if (!auth) return setAuthMessage('loginMessage', 'Configure o Firebase no config.js.', 'error');
  const email = document.getElementById('loginEmail')?.value.trim();
  const password = document.getElementById('loginPassword')?.value;
  if (!email || !password) return setAuthMessage('loginMessage', 'Informe e-mail e senha.', 'error');
  setButtonLoading('loginBtn', true, 'Entrando...');
  try { await auth.signInWithEmailAndPassword(email, password); }
  catch (error) { setAuthMessage('loginMessage', firebaseAuthError(error), 'error'); }
  finally { setButtonLoading('loginBtn', false, 'Entrar'); }
}

async function handleRegister(event) {
  event.preventDefault();
  if (!auth) return setAuthMessage('registerMessage', 'Configure o Firebase no config.js.', 'error');
  const name = document.getElementById('registerName')?.value.trim();
  const email = document.getElementById('registerEmail')?.value.trim();
  const password = document.getElementById('registerPassword')?.value;
  const confirm = document.getElementById('registerPasswordConfirm')?.value;
  if (!name || !email || !password || !confirm) return setAuthMessage('registerMessage', 'Preencha todos os campos.', 'error');
  if (password.length < 6) return setAuthMessage('registerMessage', 'A senha precisa ter pelo menos 6 caracteres.', 'error');
  if (password !== confirm) return setAuthMessage('registerMessage', 'As senhas não coincidem.', 'error');
  setButtonLoading('registerBtn', true, 'Criando...');
  try {
    const credential = await auth.createUserWithEmailAndPassword(email, password);
    if (credential.user) { await credential.user.updateProfile({ displayName: name }); await credential.user.sendEmailVerification(); }
    registerForm.reset();
    setAuthMessage('verifyMessage', `Enviamos uma mensagem de confirmação para ${email}.`, 'success');
    navigateTo('verifyScreen');
  } catch (error) { setAuthMessage('registerMessage', firebaseAuthError(error), 'error'); }
  finally { setButtonLoading('registerBtn', false, 'Criar Conta'); }
}

async function handleGoogleSignIn() {
  if (!auth) return setAuthMessage('loginMessage', 'Configure o Firebase no config.js.', 'error');
  const provider = new firebase.auth.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  try { await auth.signInWithPopup(provider); }
  catch (error) {
    if (['auth/popup-blocked', 'auth/cancelled-popup-request'].includes(error?.code)) {
      try { await auth.signInWithRedirect(provider); return; } catch (redirectError) { error = redirectError; }
    }
    if (error?.code !== 'auth/popup-closed-by-user') {
      const message = firebaseAuthError(error);
      setAuthMessage('loginMessage', message, 'error');
      setAuthMessage('registerMessage', message, 'error');
    }
  }
}

async function handleForgotPassword() {
  if (!auth) return setAuthMessage('loginMessage', 'Configure o Firebase no config.js.', 'error');
  const email = document.getElementById('loginEmail')?.value.trim();
  if (!email) { setAuthMessage('loginMessage', 'Digite seu e-mail para receber o link.', 'info'); return; }
  try { await auth.sendPasswordResetEmail(email); setAuthMessage('loginMessage', 'Link de recuperação enviado.', 'success'); }
  catch (error) { setAuthMessage('loginMessage', firebaseAuthError(error), 'error'); }
}

async function resendVerificationEmail() {
  if (!auth?.currentUser) return navigateTo('loginScreen');
  try { await auth.currentUser.sendEmailVerification(); setAuthMessage('verifyMessage', 'Novo e-mail enviado.', 'success'); }
  catch (error) { setAuthMessage('verifyMessage', firebaseAuthError(error), 'error'); }
}

async function checkEmailVerification() {
  if (!auth?.currentUser) return navigateTo('loginScreen');
  try {
    await auth.currentUser.reload();
    if (auth.currentUser.emailVerified) { setAuthMessage('verifyMessage', 'E-mail confirmado.', 'success'); await loadDetections(); navigateTo('homeScreen'); }
    else setAuthMessage('verifyMessage', 'Ainda não identificamos a confirmação.', 'info');
  } catch (error) { setAuthMessage('verifyMessage', firebaseAuthError(error), 'error'); }
}

async function handleLogout() {
  stopCamera();
  try { if (auth) await auth.signOut(); else navigateTo('loginScreen'); } catch (error) { console.error(error); }
}

function updateUserUI(user) {
  const name = user?.displayName || user?.email?.split('@')[0] || 'usuário';
  document.getElementById('userName').textContent = name.split(' ')[0];
  document.getElementById('avatarBtn').textContent = name.charAt(0).toUpperCase();
}

function setAuthMessage(id, message, type = 'info') {
  const element = document.getElementById(id); if (!element) return;
  element.textContent = message || ''; element.className = `auth-message ${type}`;
}

function setButtonLoading(id, loading, label) {
  const button = document.getElementById(id); if (!button) return;
  button.disabled = loading; button.classList.toggle('is-loading', loading); button.textContent = label;
}

function firebaseAuthError(error) {
  const messages = {
    'auth/invalid-email': 'Digite um e-mail válido.', 'auth/missing-password': 'Digite sua senha.', 'auth/weak-password': 'A senha é muito fraca.',
    'auth/email-already-in-use': 'Este e-mail já possui uma conta.', 'auth/invalid-credential': 'E-mail ou senha incorretos.', 'auth/user-not-found': 'Conta não encontrada.',
    'auth/wrong-password': 'E-mail ou senha incorretos.', 'auth/too-many-requests': 'Muitas tentativas. Aguarde alguns minutos.', 'auth/popup-blocked': 'O navegador bloqueou a janela do Google.',
    'auth/operation-not-allowed': 'Esse método de login ainda não foi ativado no Firebase.', 'auth/network-request-failed': 'Falha de conexão.'
  };
  return messages[error?.code] || 'Não foi possível concluir a autenticação.';
}

function handleGlobalClicks(event) {
  const target = event.target.closest('[data-go]');
  if (target) navigateTo(target.getAttribute('data-go'));
}

async function navigateTo(screenId) {
  const publicScreens = new Set(['loginScreen', 'registerScreen', 'verifyScreen']);
  if (authReady && !currentUser && !publicScreens.has(screenId)) screenId = 'loginScreen';
  if (currentScreen === 'cameraScreen' && screenId !== 'cameraScreen') stopCamera();
  currentScreen = screenId;
  screens.forEach(screen => screen.classList.toggle('active', screen.id === screenId));
  updateNavState(screenId);
  if (screenId === 'cameraScreen') await openCamera();
  if (screenId === 'historyScreen' || screenId === 'statsScreen' || screenId === 'achievementsScreen' || screenId === 'homeScreen') await loadDetections();
  if (screenId === 'mapScreen') initMap();
  if (window.lucide) lucide.createIcons();
}

function updateNavState(screenId) {
  document.querySelectorAll('.nav-item').forEach(button => button.classList.toggle('active', button.getAttribute('data-go') === screenId));
}

function getTheme() { return localStorage.getItem('ecoscan-theme') || 'light'; }
function applyTheme(theme) { document.body.dataset.theme = theme; localStorage.setItem('ecoscan-theme', theme); themeSwitch?.classList.toggle('on', theme === 'dark'); }

async function apiFetch(path, options = {}) {
  const headers = new Headers(options.headers || {});
  if (!headers.has('Content-Type') && options.body) headers.set('Content-Type', 'application/json');
  if (auth?.currentUser) {
    const token = await auth.currentUser.getIdToken();
    headers.set('Authorization', `Bearer ${token}`);
  }
  const response = await fetch(`${API_BASE}${path}`, { ...options, headers });
  if (!response.ok) {
    let message = `Erro HTTP ${response.status}`;
    try { const data = await response.json(); message = data.detail || message; } catch {}
    throw new Error(message);
  }
  return response.json();
}

async function loadDetections() {
  if (!currentUser) return;
  try { const data = await apiFetch('/api/detections?limit=100'); detections = data.items || []; renderAll(); }
  catch (error) { console.error(error); setDetectionStatus(`⚠️ Não foi possível carregar o histórico: ${error.message}`); }
}

function renderAll() { renderHomeStats(); renderHistory(); renderStats(); renderAchievements(); }
function renderHomeStats() {
  document.getElementById('totalCount').textContent = detections.length;
  document.getElementById('recycleCount').textContent = detections.filter(d => ['Papel','Plástico','Vidro','Metal'].includes(d.category)).length;
  document.getElementById('organicCount').textContent = detections.filter(d => d.category === 'Orgânico').length;
}
function renderHistory() {
  const list = document.getElementById('historyList'); if (!list) return;
  if (!detections.length) { list.innerHTML = '<p class="empty">Nenhuma detecção salva ainda.</p>'; return; }
  list.innerHTML = detections.map(d => `<article class="info-card"><div class="history-head"><div><h3>${escapeHTML(d.name)}</h3><p>${escapeHTML(d.category)} • ${escapeHTML(d.bin)}${d.confidence != null ? ` • ${(d.confidence * 100).toFixed(0)}%` : ''}</p></div><small>${new Date(d.detectedAt).toLocaleString('pt-BR')}</small></div></article>`).join('');
}
function renderStats() {
  const counts = { 'Orgânico':0,'Papel':0,'Plástico':0,'Vidro':0,'Metal':0,'Rejeito':0 };
  detections.forEach(d => { if (counts[d.category] !== undefined) counts[d.category]++; });
  const max = Math.max(1, ...Object.values(counts));
  const mapping = { 'Orgânico':['sbOrganic','barOrganic'], 'Papel':['sbPaper','barPaper'], 'Plástico':['sbPlastic','barPlastic'], 'Vidro':['sbGlass','barGlass'], 'Metal':['sbMetal','barMetal'], 'Rejeito':['sbReject','barReject'] };
  Object.entries(mapping).forEach(([category,[countId,barId]]) => { document.getElementById(countId).textContent = counts[category]; document.getElementById(barId).style.width = `${counts[category] / max * 100}%`; });
  const total = detections.length;
  const level = total >= 100 ? '🏆 Mestre da Sustentabilidade' : total >= 50 ? '🌎 Guardião Ambiental' : total >= 25 ? '♻️ Reciclador Avançado' : total >= 10 ? '♻️ Reciclador' : '🌱 Iniciante Verde';
  document.getElementById('ecoLevel').textContent = level;
  document.getElementById('ecoPoints').textContent = `${total * 10} pontos`;
}
function renderAchievements() {
  const total = detections.length;
  document.getElementById('ach1')?.classList.toggle('locked', total < 1);
  document.getElementById('ach2')?.classList.toggle('locked', total < 10);
  document.getElementById('ach3')?.classList.toggle('locked', total < 25);
  document.getElementById('ach4')?.classList.toggle('locked', total < 50);
  document.getElementById('ach6')?.classList.toggle('locked', total < 100);
}

async function openCamera() {
  staticImageMode = false;
  cameraFeed.style.opacity = '1';
  if (stream) return;
  try {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('Seu navegador não suporta câmera.');
    if (!model) { setDetectionStatus('🤖 Carregando inteligência artificial...'); model = await cocoSsd.load(); }
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal:'environment' }, width:{ ideal:1280 }, height:{ ideal:720 } }, audio:false });
    cameraFeed.srcObject = stream;
    await waitForVideoMetadata(cameraFeed);
    await cameraFeed.play();
    cameraFallback.hidden = true;
    resizeOverlay();
    setDetectionStatus('📷 Câmera ativa. Aponte para um objeto.');
    startDetectionLoop();
  } catch (error) {
    console.error(error);
    stopCamera();
    cameraFallback.hidden = false;
    setDetectionStatus(`❌ ${formatCameraError(error)}`);
  }
}

function stopCamera() {
  detectionLoopActive = false;
  if (stream) { stream.getTracks().forEach(track => track.stop()); stream = null; }
  if (cameraFeed) { cameraFeed.pause(); cameraFeed.srcObject = null; }
  if (overlay) overlay.getContext('2d')?.clearRect(0,0,overlay.width,overlay.height);
}
function formatCameraError(err) {
  if (err?.name === 'NotAllowedError') return 'Permita o acesso à câmera.';
  if (err?.name === 'NotFoundError') return 'Nenhuma câmera foi encontrada.';
  if (err?.name === 'NotReadableError') return 'A câmera está em uso por outro aplicativo.';
  return err?.message || 'Não foi possível abrir a câmera.';
}
function waitForVideoMetadata(video) { return new Promise((resolve,reject) => { if (video.readyState >= 1) return resolve(); const timeout = setTimeout(() => reject(new Error('Tempo excedido ao carregar a câmera.')), 10000); video.onloadedmetadata = () => { clearTimeout(timeout); resolve(); }; }); }
function resizeOverlay() { if (!cameraFeed.videoWidth || !cameraFeed.videoHeight || !overlay) return; overlay.width = cameraFeed.videoWidth; overlay.height = cameraFeed.videoHeight; }

async function startDetectionLoop() {
  if (detectionLoopActive) return;
  detectionLoopActive = true;
  while (detectionLoopActive && currentScreen === 'cameraScreen') {
    try {
      if (cameraFeed.readyState >= 2 && model) {
        const predictions = await model.detect(cameraFeed);
        lastPredictions = predictions || [];
        drawPredictions(lastPredictions);
        updateDetectionCard(lastPredictions);
      }
    } catch (error) { console.error('Detection:', error); }
    await sleep(250);
  }
}

async function handleImageSelection(event) {
  const file = event.target.files?.[0]; if (!file) return;
  try {
    if (!model) { setDetectionStatus('🤖 Carregando inteligência artificial...'); model = await cocoSsd.load(); }
    const image = await loadImageFile(file);
    staticImageMode = true; stopCamera();
    cameraFeed.srcObject = null; cameraFeed.style.opacity = '0';
    cameraFallback.hidden = false;
    cameraFallback.innerHTML = `<img class="selected-image" src="${URL.createObjectURL(file)}" alt="Imagem selecionada para análise">`;
    overlay.width = image.naturalWidth;
    overlay.height = image.naturalHeight;
    const predictions = await model.detect(image);
    lastPredictions = predictions || [];
    drawPredictions(lastPredictions);
    updateDetectionCard(lastPredictions);
    setDetectionStatus(predictions.length ? '🖼️ Imagem analisada com IA local.' : '🖼️ Nenhum objeto reconhecido.');
  } catch (error) { console.error(error); setDetectionStatus(`❌ ${error.message}`); }
  finally { imageInput.value = ''; }
}
function loadImageFile(file) { return new Promise((resolve,reject) => { const url = URL.createObjectURL(file); const img = new Image(); img.onload=()=>{URL.revokeObjectURL(url); resolve(img)}; img.onerror=()=>{URL.revokeObjectURL(url); reject(new Error('Não foi possível abrir a imagem.'))}; img.src=url; }); }

function drawPredictions(predictions) {
  resizeOverlay();
  if (!overlay) return;
  const ctx = overlay.getContext('2d'); ctx.clearRect(0,0,overlay.width,overlay.height);
  const top = predictions.slice(0,3);
  if (!top.length) return;
  ctx.font = `700 ${Math.max(14, Math.round(overlay.width / 42))}px Outfit`; ctx.lineWidth = 3;
  top.forEach(pred => {
    const [x,y,width,height] = pred.bbox;
    const text = `${prettifyClassName(pred.class)} ${(pred.score*100).toFixed(0)}%`;
    const rule = resolveWasteRule(pred.class);
    const color = CATEGORY_COLORS[rule.category] || '#43a047';
    ctx.strokeStyle = color; ctx.fillStyle = color; ctx.strokeRect(x,y,width,height);
    const tw = ctx.measureText(text).width; const ty = Math.max(24,y-10); ctx.fillRect(x,ty-ctx.measureText('Ag').actualBoundingBoxAscent-7,tw+12,30);
    ctx.fillStyle='#fff'; ctx.fillText(text,x+6,ty+3);
  });
}

function updateDetectionCard(predictions) {
  const best = predictions?.[0];
  if (!best || best.score < 0.30) {
    lastDetectionData = null;
    setDetectionCard({ name:'Nenhum objeto detectado', category:'-', bin:'-', dest:'-', time:'-', fact:'Aponte para um objeto reconhecido ou selecione outra imagem.', confidence:null });
    return;
  }
  const rule = resolveWasteRule(best.class);
  lastDetectionData = { name: prettifyClassName(best.class), category:rule.category, bin:rule.bin, dest:rule.dest, time:rule.time, fact:rule.fact, confidence:best.score, source: staticImageMode ? 'image' : 'camera', model:'COCO-SSD' };
  setDetectionCard(lastDetectionData);
}
function setDetectionCard(data) {
  document.getElementById('detName').textContent = data.name;
  document.getElementById('detType').textContent = data.category;
  document.getElementById('detBin').textContent = data.bin;
  document.getElementById('detDest').textContent = data.dest;
  document.getElementById('detTime').textContent = data.time;
  document.getElementById('detFact').textContent = data.fact;
  document.getElementById('detConfidence').textContent = data.confidence == null ? '-' : `${(data.confidence*100).toFixed(0)}%`;
  document.getElementById('detName').style.color = CATEGORY_COLORS[data.category] || 'var(--primary-dark)';
}
function setDetectionStatus(text) { const el=document.getElementById('detFact'); if (el && !lastDetectionData) el.textContent=text; }
function resolveWasteRule(label) {
  const key = normalizeKey(label); const alias = ALIASES[key] || ALIASES[String(label||'').toLowerCase()] || null;
  return WASTE_RULES[alias] || WASTE_RULES.indeterminado;
}
function normalizeKey(value) { return String(value || '').trim().toLowerCase().replace(/-/g,'_'); }
function prettifyClassName(label) { return String(label || '').replace(/_/g,' ').replace(/\b\w/g, l => l.toUpperCase()); }

async function saveCurrentDetection() {
  if (!currentUser) return setDetectionStatus('Entre na sua conta para salvar uma detecção.');
  if (!lastDetectionData || !lastDetectionData.name || lastDetectionData.category === '-' || lastDetectionData.category === 'Indeterminado') {
    return setDetectionStatus('Faça uma detecção válida antes de salvar.');
  }
  saveBtn.disabled = true;
  try {
    const data = await apiFetch('/api/detections', { method:'POST', body:JSON.stringify({ name:lastDetectionData.name, category:lastDetectionData.category, bin:lastDetectionData.bin, destination:lastDetectionData.dest, decomposition:lastDetectionData.time, fact:lastDetectionData.fact, confidence:lastDetectionData.confidence, source:lastDetectionData.source, model:lastDetectionData.model }) });
    detections.unshift(data.item); renderAll();
    saveBtn.textContent='✓ Salvo no PostgreSQL!';
    await maybeRefreshMapAchievement();
  } catch (error) { console.error(error); setDetectionStatus(`❌ Não foi possível salvar: ${error.message}`); }
  finally { setTimeout(()=>{saveBtn.disabled=false;saveBtn.textContent='Salvar Detecção';},1400); }
}

async function maybeRefreshMapAchievement() { try { const data = await apiFetch('/api/profile'); if (data.ecoPointSearches >= 1) document.getElementById('ach5')?.classList.remove('locked'); } catch {} }

function initMap() {
  if (!map) {
    map = L.map('ecoMap').setView([-23.5505, -46.6333], 12);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{ maxZoom:19, attribution:'&copy; OpenStreetMap contributors' }).addTo(map);
  }
  setTimeout(()=>map.invalidateSize(),100);
}

async function locateEcoPoints() {
  initMap();
  if (!navigator.geolocation) { document.getElementById('mapStatus').textContent='Seu navegador não oferece geolocalização.'; return; }
  locateBtn.disabled=true; locateBtn.textContent='Localizando...'; document.getElementById('mapStatus').textContent='Obtendo sua localização...';
  navigator.geolocation.getCurrentPosition(async position => {
    const { latitude, longitude } = position.coords;
    map.setView([latitude,longitude],14);
    try {
      const data = await apiFetch(`/api/ecopoints?lat=${encodeURIComponent(latitude)}&lon=${encodeURIComponent(longitude)}&radius=8000`);
      renderEcoPoints(data.items || [], latitude, longitude);
      await apiFetch('/api/profile/ecopoint-search',{method:'POST',body:'{}'}).catch(()=>{});
      document.getElementById('ach5')?.classList.remove('locked');
    } catch(error) { document.getElementById('mapStatus').textContent=`Não foi possível carregar os pontos: ${error.message}`; }
    finally { locateBtn.disabled=false; locateBtn.textContent='Encontrar próximos'; }
  }, error => { document.getElementById('mapStatus').textContent='Permita a localização no navegador para encontrar pontos próximos.'; locateBtn.disabled=false; locateBtn.textContent='Encontrar próximos'; }, { enableHighAccuracy:true, timeout:10000, maximumAge:120000 });
}

function renderEcoPoints(items, latitude, longitude) {
  mapMarkers.forEach(marker=>marker.remove()); mapMarkers=[];
  L.marker([latitude,longitude]).addTo(map).bindPopup('<strong>Você está aqui</strong>').openPopup();
  const list=document.getElementById('mapList');
  if(!items.length){ list.innerHTML='<p class="empty">Nenhum ponto encontrado nessa região. Tente aumentar a distância ou pesquisar outra área.</p>'; document.getElementById('mapStatus').textContent='Nenhum EcoPonto encontrado em até 8 km.'; return; }
  list.innerHTML=items.map(item=>{ const marker=L.marker([item.lat,item.lon]).addTo(map).bindPopup(`<strong>${escapeHTML(item.name)}</strong><br>${escapeHTML(item.type)}<br>${Math.round(item.distanceMeters)} m`); mapMarkers.push(marker); return `<article class="info-card"><h3>${escapeHTML(item.name)}</h3><p>${escapeHTML(item.type)} • ${Math.round(item.distanceMeters)} m</p></article>`; }).join('');
  document.getElementById('mapStatus').textContent=`${items.length} local(is) encontrado(s) perto de você.`;
}

function renderCreators() {
  const list=document.getElementById('creatorsList'); const creators=window.ECOSCAN_CREATORS || [];
  list.innerHTML = creators.map(person => `<article class="creator-card"><div><h3>${escapeHTML(person.name)}</h3><p>${escapeHTML(person.role||'Colaborador')}</p></div><a href="${safeURL(person.github)}" target="_blank" rel="noopener noreferrer" class="creator-github">GitHub</a></article>`).join('');
}
function safeURL(url) { try { const parsed=new URL(url); return ['http:','https:'].includes(parsed.protocol) ? parsed.href : '#'; } catch { return '#'; } }
function escapeHTML(value) { return String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;'); }
function sleep(ms) { return new Promise(resolve=>setTimeout(resolve,ms)); }
