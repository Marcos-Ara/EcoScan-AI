const splash = document.getElementById('ecoscanSplash');
const screens = [...document.querySelectorAll('.screen')];
const firebaseConfig = window.ECOSCAN_FIREBASE_CONFIG || {};
const SUPABASE_URL = window.ECOSCAN_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = window.ECOSCAN_SUPABASE_ANON_KEY || '';
const SUPABASE_ENABLED = window.ECOSCAN_ENABLE_SUPABASE !== false;
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
const soundSwitch = document.getElementById('soundSwitch');
const avatarBtn = document.getElementById('avatarBtn');
const profileForm = document.getElementById('profileForm');
const passwordForm = document.getElementById('passwordForm');
const profileAvatarBtn = document.getElementById('profileAvatarBtn');
const profilePhotoInput = document.getElementById('profilePhotoInput');
const profileResetPasswordBtn = document.getElementById('profileResetPasswordBtn');
const scanDetailModal = document.getElementById('scanDetailModal');
const closeScanDetailBtn = document.getElementById('closeScanDetailBtn');
const scanDetailCloseBtn = document.getElementById('scanDetailCloseBtn');
const scanDetailMapBtn = document.getElementById('scanDetailMapBtn');
const scanDetailDeleteBtn = document.getElementById('scanDetailDeleteBtn');
const clearHistoryBtn = document.getElementById('clearHistoryBtn');
const cameraFeed = document.getElementById('cameraFeed');
const overlay = document.getElementById('overlay');
const cameraFallback = document.getElementById('cameraFallback');

let auth = null;
let supabaseClient = null;
let supabaseReady = false;
window.ECOSCAN_SUPABASE_STATUS = 'connecting';
const supabaseObjectCache = new Map();
const supabasePendingLabels = new Set();
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
let routeLayer = null;
let routeTarget = null;
let lastSoundedDetection = '';
let audioContext = null;
let lastScanImageDataUrl = '';
let lastCaptureLocation = null;
let mapItems = [];
let activeMapFilter = 'all';
let selectedHistoryItem = null;

// O COCO-SSD fornece somente o rótulo bruto da detecção.
// Nome, material, categoria, lixeira, destino, regras, textos e imagens
// dos itens vêm exclusivamente do Supabase.
const COCO_MAX_BOXES = 20;
const COCO_MIN_SCORE = 0.15;
init();
initializeFirebase();
void initializeSupabase();

function init() {
  if (splash) {
    const finishSplash = () => {
      splash.classList.add('is-hidden');
      window.setTimeout(() => splash.remove(), 900);
    };
    window.setTimeout(finishSplash, 2850);
  }
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
  startScanBtn?.addEventListener('click', () => { primeAudio(); playEcoSound('start'); navigateTo('cameraScreen'); });
  saveBtn?.addEventListener('click', saveCurrentDetection);
  selectImageBtn?.addEventListener('click', () => imageInput?.click());
  imageInput?.addEventListener('change', handleImageSelection);
  themeSwitch?.addEventListener('click', () => applyTheme(getTheme() === 'light' ? 'dark' : 'light'));
  notifSwitch?.addEventListener('click', () => notifSwitch.classList.toggle('on'));
  soundSwitch?.addEventListener('click', () => soundSwitch.classList.toggle('on'));
  avatarBtn?.addEventListener('click', () => navigateTo('profileScreen'));
  profileForm?.addEventListener('submit', handleProfileSave);
  passwordForm?.addEventListener('submit', handlePasswordChange);
  profileAvatarBtn?.addEventListener('click', () => profilePhotoInput?.click());
  profilePhotoInput?.addEventListener('change', handleProfilePhoto);
  profileResetPasswordBtn?.addEventListener('click', sendProfilePasswordReset);
  locateBtn?.addEventListener('click', locateEcoPoints);
  closeScanDetailBtn?.addEventListener('click', closeScanDetailModal);
  scanDetailCloseBtn?.addEventListener('click', closeScanDetailModal);
  scanDetailModal?.addEventListener('click', e => { if (e.target === scanDetailModal) closeScanDetailModal(); });
  scanDetailMapBtn?.addEventListener('click', openSelectedHistoryLocation);
  scanDetailDeleteBtn?.addEventListener('click', deleteSelectedHistoryItem);
  clearHistoryBtn?.addEventListener('click', clearHistory);
  document.querySelectorAll('.map-filter').forEach(btn => btn.addEventListener('click', () => { activeMapFilter = btn.dataset.mapFilter || 'all'; document.querySelectorAll('.map-filter').forEach(b => b.classList.toggle('active', b === btn)); renderMapList(); }));
  window.addEventListener('keydown', e => { if (e.key === 'Escape') closeScanDetailModal(); });
  window.addEventListener('resize', resizeOverlay);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stopCamera();
    else if (currentScreen === 'cameraScreen' && !staticImageMode && !stream) openCamera();
  });
  window.addEventListener('beforeunload', stopCamera);
  renderCreators();
  if (window.lucide) lucide.createIcons();
}

function initializeSupabase() {
  if (!SUPABASE_ENABLED) return;
  if (!window.supabase?.createClient) return;
  if (!SUPABASE_URL || SUPABASE_URL.includes('SEU-PROJETO') || !SUPABASE_ANON_KEY || SUPABASE_ANON_KEY.includes('SUA_CHAVE')) return;
  try {
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
    supabaseReady = true;
  } catch (error) {
    console.warn('EcoScan: Supabase não pôde ser inicializado.', error);
    supabaseClient = null;
    supabaseReady = false;
  }
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
    auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL).catch(() => {});
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
  try { if (auth) await auth.signOut(); else navigateTo('loginScreen'); } catch (error) { navigateTo('loginScreen'); }
}

function getLocalProfilePhotoKey() { return `ecoscan-profile-photo-${currentUser?.uid || 'dev-user'}`; }
function getLocalProfilePhoto() { try { return localStorage.getItem(getLocalProfilePhotoKey()) || ''; } catch { return ''; } }
function setAvatarElement(element, name, photoUrl='') {
  if (!element) return;
  const photo = photoUrl || getLocalProfilePhoto();
  const allowed = /^https?:\/\//i.test(photo) || /^data:image\//i.test(photo);
  if (allowed) { element.innerHTML = `<img src="${photo.replace(/&/g,'&amp;').replace(/"/g,'&quot;')}" alt="Foto de perfil">`; element.classList.add('has-photo'); }
  else { element.textContent = (name || 'U').charAt(0).toUpperCase(); element.classList.remove('has-photo'); }
}
function updateUserUI(user) {
  const name = user?.displayName || user?.email?.split('@')[0] || 'usuário';
  document.getElementById('userName').textContent = name.split(' ')[0];
  setAvatarElement(document.getElementById('avatarBtn'), name, user?.photoURL || '');
  setAvatarElement(document.getElementById('profileAvatarBtn'), name, user?.photoURL || '');
  const pn = document.getElementById('profileNamePreview'); if (pn) pn.textContent = name;
  const pe = document.getElementById('profileEmailPreview'); if (pe) pe.textContent = user?.email || '';
}
function populateProfileForm() {
  if (!currentUser) return;
  document.getElementById('profileNameInput').value = currentUser.displayName || currentUser.email?.split('@')[0] || '';
  document.getElementById('profileEmailInput').value = currentUser.email || '';
  updateUserUI(currentUser);
}
async function handleProfileSave(event) {
  event.preventDefault();
  if (!auth?.currentUser) return setAuthMessage('profileMessage', 'Entre na sua conta para editar o perfil.', 'error');
  const name = document.getElementById('profileNameInput')?.value.trim();
  const email = document.getElementById('profileEmailInput')?.value.trim();
  if (!name || !email) return setAuthMessage('profileMessage', 'Preencha nome e e-mail.', 'error');
  const button = document.getElementById('profileSaveBtn');
  if (button) { button.disabled = true; button.textContent = 'Salvando...'; }
  try {
    const user = auth.currentUser;
    if (user.displayName !== name) await user.updateProfile({ displayName: name });
    if (user.email !== email) await user.updateEmail(email);
    await user.reload();
    currentUser = auth.currentUser;
    updateUserUI(currentUser);
    setAuthMessage('profileMessage', 'Perfil atualizado com sucesso.', 'success');
  } catch (error) {
    setAuthMessage('profileMessage', firebaseAuthError(error), 'error');
  } finally { if (button) { button.disabled = false; button.textContent = 'Salvar alterações'; } }
}
async function handlePasswordChange(event) {
  event.preventDefault();
  const user = auth?.currentUser;
  if (!user?.email) return setAuthMessage('passwordMessage', 'Essa conta não usa senha local. Use o link de recuperação.', 'info');
  const current = document.getElementById('currentPasswordInput')?.value || '';
  const next = document.getElementById('newPasswordInput')?.value || '';
  const confirm = document.getElementById('confirmNewPasswordInput')?.value || '';
  if (next.length < 6) return setAuthMessage('passwordMessage', 'A nova senha precisa ter pelo menos 6 caracteres.', 'error');
  if (next !== confirm) return setAuthMessage('passwordMessage', 'As novas senhas não coincidem.', 'error');
  if (!current) return setAuthMessage('passwordMessage', 'Informe sua senha atual.', 'error');
  const button = document.getElementById('passwordSaveBtn');
  if (button) { button.disabled = true; button.textContent = 'Atualizando...'; }
  try {
    const credential = firebase.auth.EmailAuthProvider.credential(user.email, current);
    await user.reauthenticateWithCredential(credential);
    await user.updatePassword(next);
    passwordForm.reset();
    setAuthMessage('passwordMessage', 'Senha atualizada com sucesso.', 'success');
  } catch (error) {
    const code = error?.code;
    if (code === 'auth/wrong-password' || code === 'auth/invalid-credential') setAuthMessage('passwordMessage', 'A senha atual está incorreta.', 'error');
    else if (code === 'auth/requires-recent-login') setAuthMessage('passwordMessage', 'Por segurança, entre novamente na conta e tente alterar a senha.', 'info');
    else setAuthMessage('passwordMessage', firebaseAuthError(error), 'error');
  } finally { if (button) { button.disabled = false; button.textContent = 'Atualizar senha'; } }
}
async function sendProfilePasswordReset() {
  if (!auth?.currentUser?.email) return;
  try { await auth.sendPasswordResetEmail(auth.currentUser.email); setAuthMessage('passwordMessage', 'Link de recuperação enviado para seu e-mail.', 'success'); }
  catch (error) { setAuthMessage('passwordMessage', firebaseAuthError(error), 'error'); }
}
function handleProfilePhoto(event) {
  const file = event.target.files?.[0]; if (!file || !currentUser) return;
  if (!file.type.startsWith('image/')) return setAuthMessage('profileMessage', 'Selecione uma imagem válida.', 'error');
  const reader = new FileReader();
  reader.onload = () => {
    try { localStorage.setItem(getLocalProfilePhotoKey(), String(reader.result)); } catch { return setAuthMessage('profileMessage', 'A foto é grande demais para o armazenamento local.', 'error'); }
    updateUserUI(currentUser);
    setAuthMessage('profileMessage', 'Foto de perfil atualizada neste dispositivo.', 'success');
  };
  reader.readAsDataURL(file);
  event.target.value = '';
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
    'auth/operation-not-allowed': 'Esse método de login ainda não foi ativado no Firebase.', 'auth/network-request-failed': 'Falha de conexão.', 'auth/requires-recent-login': 'Por segurança, entre novamente na conta e tente de novo.', 'auth/invalid-password': 'A senha informada é inválida.'
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
  if (screenId === 'profileScreen') populateProfileForm();
  if (screenId === 'mapScreen') { initMap(); setTimeout(() => { if (!window._ecoMapLocated) locateEcoPoints(); }, 160); }
  if (window.lucide) lucide.createIcons();
}

function updateNavState(screenId) {
  document.querySelectorAll('.nav-item').forEach(button => button.classList.toggle('active', button.getAttribute('data-go') === screenId));
}

function getTheme() { return localStorage.getItem('ecoscan-theme') || 'dark'; }
function applyTheme(theme) { document.body.dataset.theme = theme; localStorage.setItem('ecoscan-theme', theme); themeSwitch?.classList.toggle('on', theme === 'dark'); }

function isBackendUnavailable(error) {
  const name = String(error?.name || '').toLowerCase();
  const message = String(error?.message || '').toLowerCase();
  if (message === 'backend_disabled') return true;
  if (name === 'typeerror' && /fetch|network|load|connection/.test(message)) return true;
  return /failed to fetch|network|connection refused|err_connection|gateway|erro http 5\d{2}|http 502|http 503|http 504/.test(message);
}

async function apiFetch(path, options = {}) {
  if (window.ECOSCAN_ENABLE_BACKEND !== true) {
    throw new Error('BACKEND_DISABLED');
  }
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

function localDetectionKey() {
  const uid = currentUser?.uid || 'dev-user';
  return `ecoscan-detections-${uid}`;
}

function loadLocalDetections() {
  try {
    const data = JSON.parse(localStorage.getItem(localDetectionKey()) || '[]');
    return Array.isArray(data) ? data : [];
  } catch { return []; }
}

function saveLocalDetection(item) {
  let items = loadLocalDetections();
  items.unshift(item);
  items = items.slice(0, 60);
  const key = localDetectionKey();
  while (items.length) {
    try {
      localStorage.setItem(key, JSON.stringify(items));
      return item;
    } catch {
      items.pop();
    }
  }
  return item;
}

function saveLocalDetections(items) {
  try { localStorage.setItem(localDetectionKey(), JSON.stringify(Array.isArray(items) ? items : [])); } catch {}
}

async function deleteDetectionById(item) {
  const id = item?.id;
  if (id == null) return;
  const isLocal = String(id).startsWith('local-');
  if (!isLocal && window.ECOSCAN_ENABLE_BACKEND === true) {
    await apiFetch(`/api/detections/${encodeURIComponent(id)}`, { method: 'DELETE' });
    return;
  }
  saveLocalDetections(loadLocalDetections().filter(d => String(d.id) !== String(id)));
}

async function clearHistory() {
  if (!detections.length) return;
  const confirmed = window.confirm('Deseja apagar todo o histórico deste dispositivo e da sua conta? Essa ação não pode ser desfeita.');
  if (!confirmed) return;
  try {
    if (window.ECOSCAN_ENABLE_BACKEND === true && currentUser) await apiFetch('/api/detections', { method: 'DELETE' });
    saveLocalDetections([]);
    detections = [];
    selectedHistoryItem = null;
    renderAll();
    closeScanDetailModal();
    playEcoSound('success');
  } catch (error) {
    alert(`Não foi possível limpar o histórico: ${error.message}`);
  }
}

async function deleteSelectedHistoryItem() {
  if (!selectedHistoryItem) return;
  const name = selectedHistoryItem.name || 'esta detecção';
  if (!window.confirm(`Excluir \"${name}\" do histórico?`)) return;
  try {
    await deleteDetectionFromCurrentView(selectedHistoryItem);
    closeScanDetailModal();
  } catch (error) {
    alert(`Não foi possível excluir a detecção: ${error.message}`);
  }
}

async function loadDetections() {
  if (!currentUser) return;
  try {
    const data = await apiFetch('/api/detections?limit=100');
    detections = data.items || [];
  } catch (error) {
    // O app continua funcionando sem o backend enquanto a base de dados estiver desativada.
    detections = loadLocalDetections();
  }
  renderAll();
}

function renderAll() { renderHomeStats(); renderHistory(); renderStats(); renderAchievements(); updateAchievementScreen(); }
function renderHomeStats() {
  document.getElementById('totalCount').textContent = detections.length;
  document.getElementById('recycleCount').textContent = detections.filter(d => ['Papel','Plástico','Vidro','Metal'].includes(d.category)).length;
  document.getElementById('organicCount').textContent = detections.filter(d => d.category === 'Orgânico').length;
}
function renderHistory() {
  const list = document.getElementById('historyList'); if (!list) return;
  if (!detections.length) { list.innerHTML = '<p class="empty">Nenhuma detecção salva ainda.</p>'; return; }
  list.innerHTML = detections.map((d,index) => {
    const hasLocation = Number.isFinite(Number(d.latitude)) && Number.isFinite(Number(d.longitude));
    const photo = d.thumbnail || d.photoDataUrl || '';
    const thumb = photo ? `<div class="history-thumb"><img src="${escapeHTML(photo)}" alt="Foto de ${escapeHTML(d.name)}"></div>` : `<div class="history-thumb"><div class="history-thumb-placeholder"><i data-lucide="scan-line"></i><span>Sem foto</span></div></div>`;
    const sourceLabel = d.source === 'camera' ? 'Câmera' : d.source === 'image' ? 'Imagem' : 'Captura';
    return `<article class="info-card history-card" data-history-index="${index}">${thumb}<div class="history-body"><h3>${escapeHTML(d.name)}</h3><p>${escapeHTML(d.category)} • ${escapeHTML(d.bin)}${d.confidence != null ? ` • ${(d.confidence * 100).toFixed(0)}%` : ''}</p><small class="history-location">${hasLocation ? '<i data-lucide="map-pin"></i> Localização salva' : '<i data-lucide="map-pin-off"></i> Sem localização'} • ${sourceLabel}</small></div><div class="history-actions"><button class="history-delete-btn" type="button" data-history-delete="${index}" aria-label="Excluir ${escapeHTML(d.name)}"><i data-lucide="trash-2"></i></button><i class="history-arrow" data-lucide="chevron-right"></i></div></article>`;
  }).join('');
  list.querySelectorAll('.history-card').forEach(card => card.addEventListener('click', () => openScanDetail(detections[Number(card.dataset.historyIndex)])));
  list.querySelectorAll('.history-delete-btn').forEach(btn => btn.addEventListener('click', async (event) => {
    event.stopPropagation();
    const item = detections[Number(btn.dataset.historyDelete)];
    if (!item || !window.confirm(`Excluir \"${item.name || 'esta detecção'}\" do histórico?`)) return;
    try { await deleteDetectionById(item); detections = detections.filter(d => String(d.id) !== String(item.id)); renderAll(); }
    catch (error) { alert(`Não foi possível excluir a detecção: ${error.message}`); }
  }));
  if (window.lucide) lucide.createIcons();
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
function renderAchievements() { updateAchievementScreen(); }

async function openCamera() {
  staticImageMode = false;
  lastScanImageDataUrl = '';
  cameraFeed.style.opacity = '1';
  if (stream) return;
  try {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('Seu navegador não suporta câmera.');
    if (!model) { setDetectionStatus('🤖 Carregando inteligência artificial...'); model = await cocoSsd.load({ base: 'mobilenet_v2' }); }
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal:'environment' }, width:{ ideal:1280 }, height:{ ideal:720 } }, audio:false });
    cameraFeed.srcObject = stream;
    await waitForVideoMetadata(cameraFeed);
    await cameraFeed.play();
    cameraFallback.hidden = true;
    resizeOverlay();
    setDetectionStatus('📷 Câmera ativa. Aponte para um objeto.');
    startDetectionLoop();
  } catch (error) {
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
        const predictions = await model.detect(cameraFeed, COCO_MAX_BOXES, COCO_MIN_SCORE);
        lastPredictions = predictions || [];
        drawPredictions(lastPredictions);
        updateDetectionCard(lastPredictions);
      }
    } catch (error) { await sleep(350); }
    await sleep(250);
  }
}

function imageToDataUrl(image, maxWidth = 480, quality = 0.64) {
  try {
    const width = image.videoWidth || image.naturalWidth || image.width;
    const height = image.videoHeight || image.naturalHeight || image.height;
    if (!width || !height) return '';
    const scale = Math.min(1, maxWidth / width);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', quality);
  } catch { return ''; }
}

function captureCurrentScanImage() {
  if (staticImageMode && lastScanImageDataUrl) return lastScanImageDataUrl;
  if (!cameraFeed?.videoWidth || cameraFeed.readyState < 2) return lastScanImageDataUrl || '';
  return imageToDataUrl(cameraFeed, 480, 0.64);
}

function getCurrentCaptureLocation() {
  return new Promise(resolve => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(pos => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude, accuracy: pos.coords.accuracy || null }), () => resolve(null), { enableHighAccuracy:false, timeout:3000, maximumAge:120000 });
  });
}

async function handleImageSelection(event) {
  const file = event.target.files?.[0]; if (!file) return;
  try {
    if (!model) { setDetectionStatus('🤖 Carregando inteligência artificial...'); model = await cocoSsd.load({ base: 'mobilenet_v2' }); }
    const image = await loadImageFile(file);
    staticImageMode = true; stopCamera();
    cameraFeed.srcObject = null; cameraFeed.style.opacity = '0';
    cameraFallback.hidden = false;
    cameraFallback.innerHTML = `<img class="selected-image" src="${URL.createObjectURL(file)}" alt="Imagem selecionada para análise">`;
    overlay.width = image.naturalWidth;
    overlay.height = image.naturalHeight;
    lastScanImageDataUrl = imageToDataUrl(image, 480, 0.64);
    const predictions = await model.detect(image, COCO_MAX_BOXES, COCO_MIN_SCORE);
    lastPredictions = predictions || [];
    drawPredictions(lastPredictions);
    updateDetectionCard(lastPredictions);
    setDetectionStatus(predictions.length ? '🖼️ Imagem analisada com IA local.' : '🖼️ Nenhum objeto reconhecido.');
  } catch (error) { setDetectionStatus(`❌ ${error.message}`); }
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
    const record = supabaseObjectCache.get(normalizeSupabaseAlias(pred.class));
    const color = record?.category_color_hex || '#6b7280';
    ctx.strokeStyle = color; ctx.fillStyle = color; ctx.strokeRect(x,y,width,height);
    const tw = ctx.measureText(text).width; const ty = Math.max(24,y-10); ctx.fillRect(x,ty-ctx.measureText('Ag').actualBoundingBoxAscent-7,tw+12,30);
    ctx.fillStyle='#fff'; ctx.fillText(text,x+6,ty+3);
  });
}

function updateDetectionCard(predictions) {
  const best = predictions?.[0];

  if (!best || best.score < COCO_MIN_SCORE) {
    lastDetectionData = null;
    setDetectionCard({
      name: 'Nenhum objeto detectado',
      category: '-',
      bin: '-',
      dest: '-',
      time: '-',
      fact: 'Aponte para um objeto reconhecido ou selecione outra imagem.',
      confidence: null,
      categoryColor: '#6b7280'
    });
    return;
  }

  if (!supabaseReady) {
    lastDetectionData = null;
    const status = window.ECOSCAN_SUPABASE_STATUS;
    setDetectionCard({
      name: status === 'connecting' ? 'Conectando ao banco...' : 'Banco indisponível',
      category: '-',
      bin: '-',
      dest: '-',
      time: '-',
      fact: status === 'connecting'
        ? 'Aguarde enquanto o EcoScan conecta à base de conhecimento.'
        : 'Não foi possível acessar a base de conhecimento do Supabase.',
      confidence: best.score,
      categoryColor: '#6b7280'
    });
    return;
  }

  const normalized = normalizeSupabaseAlias(best.class);
  const cached = supabaseObjectCache.get(normalized);

  if (cached === undefined) {
    lastDetectionData = null;
    setDetectionCard({
      name: 'Consultando base...',
      category: '-',
      bin: '-',
      dest: '-',
      time: '-',
      fact: 'O COCO-SSD detectou o objeto. Consultando os dados no Supabase...',
      confidence: best.score,
      categoryColor: '#6b7280'
    });
    queueSupabaseClassification(best.class);
    return;
  }

  if (cached?.status === 'not-found') {
    lastDetectionData = null;
    setDetectionCard({
      name: 'Objeto não cadastrado',
      category: '-',
      bin: '-',
      dest: '-',
      time: '-',
      fact: `A classe "${prettifyClassName(best.class)}" foi detectada, mas não possui correspondência na base do Supabase.`,
      confidence: best.score,
      categoryColor: '#6b7280'
    });
    return;
  }

  if (!cached) {
    lastDetectionData = null;
    setDetectionCard({
      name: 'Erro ao consultar banco',
      category: '-',
      bin: '-',
      dest: '-',
      time: '-',
      fact: 'Não foi possível obter os dados deste item no Supabase.',
      confidence: best.score,
      categoryColor: '#6b7280'
    });
    return;
  }

  const dbRule = cached.specialWasteUi || (cached.category_name ? {
    category: cached.category_name,
    bin: cached.bin_name
      ? `${cached.bin_color_name ? cached.bin_color_name + ' ' : ''}${cached.bin_name}`
      : '-',
    dest: cached.destination_name || '-',
    time: cached.decomposition_text || '—',
    fact: cached.educational_text || cached.recommendation || 'Informação obtida da base de conhecimento EcoScan.'
  } : {
    category: 'Indeterminado',
    bin: '-',
    dest: '-',
    time: '—',
    fact: cached.variant_count > 0
      ? `A base encontrou ${cached.variant_count} variante(s). São necessárias evidências adicionais para definir o material.`
      : 'O objeto está cadastrado, mas ainda não possui material ou regra de descarte definida na base.'
  });

  const result = {
    name: cached.databaseName,
    category: dbRule.category,
    bin: dbRule.bin,
    dest: dbRule.dest,
    time: dbRule.time,
    fact: dbRule.fact,
    confidence: best.score,
    source: staticImageMode ? 'image' : 'camera',
    model: 'COCO-SSD',
    databaseSource: 'supabase',
    databaseObjectId: cached.databaseObjectId,
    databaseVariantId: cached.databaseVariantId || null,
    databaseMaterialId: cached.databaseMaterialId || null,
    databaseCategoryId: cached.databaseCategoryId || null,
    databaseImageUrl: cached.databaseImageUrl || null,
    categoryColor: cached.category_color_hex || '#6b7280'
  };

  lastDetectionData = result;
  setDetectionCard(result);

  const soundKey = `${result.name}|${Math.round(result.confidence * 100)}`;
  if (soundKey !== lastSoundedDetection && !staticImageMode) {
    lastSoundedDetection = soundKey;
    playEcoSound('detect');
  }
}
function setDetectionCard(data) {
  document.getElementById('detName').textContent = data.name;
  document.getElementById('detType').textContent = data.category;
  document.getElementById('detBin').textContent = data.bin;
  document.getElementById('detDest').textContent = data.dest;
  document.getElementById('detTime').textContent = data.time;
  document.getElementById('detFact').textContent = data.fact;
  document.getElementById('detConfidence').textContent = data.confidence == null ? '-' : `${(data.confidence*100).toFixed(0)}%`;
  document.getElementById('detName').style.color = data.categoryColor || 'var(--primary-dark)';
}
function setDetectionStatus(text) { const el=document.getElementById('detFact'); if (el && !lastDetectionData) el.textContent=text; }
function normalizeKey(value) {
  return String(value || '').trim().toLowerCase().replace(/-/g, '_');
}

function normalizeSupabaseAlias(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ');
}

function specialWasteToUi(specialWaste) {
  const item = Array.isArray(specialWaste) ? specialWaste[0] : null;
  if (!item) return null;

  return {
    category: item.name || 'Descarte especial',
    bin: item.destination ? `📦 ${item.destination}` : '📦 Coleta especial',
    dest: item.destination || '-',
    time: 'Não recomendado calcular',
    fact: item.warning || item.instruction || 'Este item exige uma destinação especial.'
  };
}

async function resolveSupabaseClassification(label) {
  if (!supabaseReady || !supabaseClient) return null;

  const normalized = normalizeSupabaseAlias(label);
  if (!normalized) return null;

  if (supabaseObjectCache.has(normalized)) {
    return supabaseObjectCache.get(normalized);
  }

  if (supabasePendingLabels.has(normalized)) {
    return null;
  }

  supabasePendingLabels.add(normalized);

  try {
    let aliases = null;
    let aliasError = null;

    ({ data: aliases, error: aliasError } = await supabaseClient
      .from('object_aliases')
      .select('object_id, variant_id, alias, normalized_alias, confidence_hint, is_active')
      .eq('normalized_alias', normalized)
      .eq('is_active', true)
      .order('confidence_hint', { ascending: false, nullsFirst: false })
      .limit(10));

    if (aliasError) throw aliasError;

    if (!aliases?.length) {
      ({ data: aliases, error: aliasError } = await supabaseClient
        .from('object_aliases')
        .select('object_id, variant_id, alias, normalized_alias, confidence_hint, is_active')
        .ilike('alias', label)
        .eq('is_active', true)
        .order('confidence_hint', { ascending: false, nullsFirst: false })
        .limit(10));

      if (aliasError) throw aliasError;
    }

    let match = aliases?.[0] || null;

    // Último recurso: detection_class também é lido do banco.
    if (!match) {
      const { data: objectsByClass, error: classError } = await supabaseClient
        .from('objects')
        .select('id, name, detection_class, is_ambiguous, is_active')
        .eq('detection_class', label)
        .eq('is_active', true)
        .order('is_ambiguous', { ascending: true })
        .limit(1);

      if (classError) throw classError;

      if (objectsByClass?.length) {
        match = { object_id: objectsByClass[0].id, variant_id: null };
      }
    }

    if (!match) {
      const notFound = { status: 'not-found' };
      supabaseObjectCache.set(normalized, notFound);
      return notFound;
    }

    let record = null;

    if (match.variant_id) {
      const { data, error } = await supabaseClient
        .from('ecoscan_variant_master')
        .select('*')
        .eq('variant_id', match.variant_id)
        .maybeSingle();

      if (error) throw error;
      record = data ? { type: 'variant', ...data } : null;
    }

    if (!record) {
      const { data, error } = await supabaseClient
        .from('ecoscan_object_master')
        .select('*')
        .eq('object_id', match.object_id)
        .maybeSingle();

      if (error) throw error;
      record = data ? { type: 'object', ...data } : null;
    }

    if (!record) {
      const notFound = { status: 'not-found' };
      supabaseObjectCache.set(normalized, notFound);
      return notFound;
    }

    const specialWasteUi = specialWasteToUi(record.special_waste);

    const result = {
      ...record,
      specialWasteUi,
      databaseName: record.variant_name || record.object_name,
      databaseObjectId: record.object_id,
      databaseVariantId: record.variant_id || null,
      databaseMaterialId: record.material_id || null,
      databaseCategoryId: record.category_id || null,
      databaseImageUrl:
        record.primary_image_url ||
        (Array.isArray(record.images) ? record.images[0]?.url || null : null),
      databaseSource: 'supabase'
    };

    supabaseObjectCache.set(normalized, result);
    return result;

  } catch (error) {
    console.error(`EcoScan: erro ao consultar Supabase para "${label}".`, error);
    const failed = { status: 'error', error: error?.message || 'Falha na consulta.' };
    supabaseObjectCache.set(normalized, failed);
    return failed;
  } finally {
    supabasePendingLabels.delete(normalized);
  }
}

function queueSupabaseClassification(label) {
  if (!supabaseReady) return;
  resolveSupabaseClassification(label).then(result => {
    if (!result) return;
    // O próximo ciclo da câmera usa o cache sem gerar uma nova consulta.
    if (lastPredictions?.[0]?.class === label) {
      updateDetectionCard(lastPredictions);
      drawPredictions(lastPredictions);
    }
  });
}
function prettifyClassName(label) { return String(label || '').replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()); }

async function saveCurrentDetection() {
  if (!currentUser) return setDetectionStatus('Entre na sua conta para salvar uma detecção.');
  if (!lastDetectionData || lastDetectionData.databaseSource !== 'supabase' || !lastDetectionData.name || lastDetectionData.category === '-' || lastDetectionData.category === 'Indeterminado') {
    return setDetectionStatus('Faça uma detecção válida antes de salvar.');
  }
  saveBtn.disabled = true;
  const thumbnail = captureCurrentScanImage();
  const location = await getCurrentCaptureLocation();
  const payload = {
    name:lastDetectionData.name,
    category:lastDetectionData.category,
    bin:lastDetectionData.bin,
    destination:lastDetectionData.dest,
    decomposition:lastDetectionData.time,
    fact:lastDetectionData.fact,
    confidence:lastDetectionData.confidence,
    source:lastDetectionData.source,
    model:lastDetectionData.model
  };
  const localMetadata = { thumbnail, photoDataUrl: thumbnail, latitude: location?.latitude ?? null, longitude: location?.longitude ?? null, locationAccuracy: location?.accuracy ?? null };
  try {
    const data = await apiFetch('/api/detections', { method:'POST', body:JSON.stringify(payload) });
    const enrichedItem = { ...data.item, ...localMetadata };
    detections.unshift(enrichedItem);
    registerAchievementFromDetection(enrichedItem);
    renderAll();
    saveBtn.textContent='✓ Detecção salva!';
    showScanDetail(enrichedItem);
    await maybeRefreshMapAchievement();
  } catch (error) {
    if (!isBackendUnavailable(error) && error?.message !== 'BACKEND_DISABLED') {
      setDetectionStatus(`❌ Não foi possível salvar: ${error.message}`);
    } else {
      const localItem = {
        ...payload,
        ...localMetadata,
        id: `local-${Date.now()}`,
        detectedAt: new Date().toISOString()
      };
      saveLocalDetection(localItem);
      detections = loadLocalDetections();
      registerAchievementFromDetection(localItem);
      renderAll();
      saveBtn.textContent='✓ Detecção salva!';
      showScanDetail(localItem);
    }
  } finally {
    setTimeout(()=>{saveBtn.disabled=false;saveBtn.textContent='Salvar Detecção';},1400);
  }
}

function showScanDetail(item) {
  selectedHistoryItem = item || null;
  if (!scanDetailModal || !item) return;
  const photo = item.thumbnail || item.photoDataUrl || '';
  const img = document.getElementById('scanDetailPhoto');
  const placeholder = document.getElementById('scanDetailPhotoPlaceholder');
  if (photo) { img.src = photo; img.hidden = false; placeholder.hidden = true; } else { img.hidden = true; img.removeAttribute('src'); placeholder.hidden = false; }
  document.getElementById('scanDetailTitle').textContent = item.name || 'Objeto detectado';
  document.getElementById('scanDetailEyebrow').textContent = item.source === 'camera' ? 'CAPTURA DA CÂMERA' : item.source === 'image' ? 'IMAGEM ANALISADA' : 'DETECÇÃO SALVA';
  document.getElementById('scanDetailDate').textContent = item.detectedAt ? new Date(item.detectedAt).toLocaleString('pt-BR') : 'Agora';
  document.getElementById('scanDetailType').textContent = item.category || '—';
  document.getElementById('scanDetailBin').textContent = item.bin || '—';
  document.getElementById('scanDetailDest').textContent = item.destination || item.dest || '—';
  document.getElementById('scanDetailTime').textContent = item.decomposition || item.time || '—';
  const hasLocation = Number.isFinite(Number(item.latitude)) && Number.isFinite(Number(item.longitude));
  document.getElementById('scanDetailCoords').textContent = hasLocation ? `${Number(item.latitude).toFixed(5)}, ${Number(item.longitude).toFixed(5)}${item.locationAccuracy ? ` • precisão ±${Math.round(item.locationAccuracy)} m` : ''}` : 'A localização não foi registrada nesta detecção.';
  scanDetailMapBtn.hidden = !hasLocation;
  scanDetailModal.hidden = false;
  document.body.classList.add('modal-open');
  if (window.lucide) lucide.createIcons();
}
async function deleteDetectionFromCurrentView(item) {
  await deleteDetectionById(item);
  detections = detections.filter(d => String(d.id) !== String(item.id));
  selectedHistoryItem = null;
  renderAll();
}

function openScanDetail(item) { showScanDetail(item); }
function closeScanDetailModal() { if (scanDetailModal) scanDetailModal.hidden = true; document.body.classList.remove('modal-open'); }
function openSelectedHistoryLocation() {
  if (!selectedHistoryItem) return;
  const lat = Number(selectedHistoryItem.latitude), lon = Number(selectedHistoryItem.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
  closeScanDetailModal();
  navigateTo('mapScreen');
  setTimeout(() => { initMap(); map.setView([lat,lon],17,{animate:true}); if (window._ecoUserMarker) drawUserMarker(lat,lon); const marker=L.marker([lat,lon]).addTo(map).bindPopup(`<strong>${escapeHTML(selectedHistoryItem.name || 'Detecção')}</strong><br><span>Local da captura</span>`).openPopup(); mapMarkers.push(marker); },180);
}

function getAchievementKey() {
  return currentUser?.uid ? `ecoscan-achievements-${currentUser.uid}` : 'ecoscan-achievements-local';
}
function loadAchievementState() {
  try { return JSON.parse(localStorage.getItem(getAchievementKey()) || '{}'); } catch { return {}; }
}
function saveAchievementState(state) {
  try { localStorage.setItem(getAchievementKey(), JSON.stringify(state)); } catch {}
}
function getAchievementData() {
  const state = loadAchievementState();
  const categorySet = new Set(detections.map(d => d.category).filter(c => c && !['Indeterminado','-'].includes(c)));
  const scans = detections.length;
  const recycled = detections.filter(d => ['Papel','Plástico','Vidro','Metal'].includes(d.category)).length;
  const definedDestination = detections.filter(d => d.destination && !['Consulta local','-'].includes(d.destination)).length;
  const points = (scans * 10) + (recycled * 5) + (categorySet.size * 10) + Number(state.bonusPoints || 0);
  return { state, scans, recycled, categories: categorySet.size, definedDestination, points };
}
function getEcoLevel(points) {
  const levels = [
    [0,'🌱 Iniciante Verde',100], [100,'♻️ Aprendiz da Reciclagem',250], [250,'🌿 Guardião dos Materiais',500],
    [500,'🌎 Protetor do Planeta',1000], [1000,'🏆 Mestre Sustentável',2000], [2000,'👑 Lenda do EcoScan',Infinity]
  ];
  let current=levels[0], next=levels[1];
  for (let i=0;i<levels.length;i++) if (points>=levels[i][0]) { current=levels[i]; next=levels[i+1]||levels[i]; }
  return { name:current[1], base:current[0], next:next[0] };
}
function updateAchievementScreen() {
  const {state,scans,recycled,categories,definedDestination,points}=getAchievementData();
  const level=getEcoLevel(points);
  const target=Number.isFinite(level.next) ? level.next : level.base + 100;
  const progress=target===level.base?100:Math.max(0, Math.min(100, ((points-level.base)/(target-level.base))*100));
  document.getElementById('achievementLevel').textContent=level.name;
  document.getElementById('achievementPoints').textContent=points;
  document.getElementById('achievementScans').textContent=scans;
  document.getElementById('achievementCategories').textContent=categories;
  document.getElementById('achievementRecycled').textContent=recycled;
  document.getElementById('achievementProgress').style.width=`${progress}%`;
  document.getElementById('achievementProgressText').textContent=`${points} / ${target} pontos`;
  document.getElementById('achievementNext').textContent=Number.isFinite(level.next) ? `Próximo nível: ${level.next}` : 'Nível máximo';
  const missionDone = scans >= 1;
  document.getElementById('dailyMissionTitle').textContent = missionDone ? 'Caça ao próximo material' : 'Primeiro passo';
  document.getElementById('dailyMissionText').textContent = missionDone ? `Você já salvou ${scans} scan${scans===1?'':'s'}. Encontre um material novo para aumentar sua coleção.` : 'Faça 1 scan e descubra o destino correto do objeto.';
  document.getElementById('dailyMissionReward').textContent = missionDone ? `+${categories<5?15:25} XP` : '+10 XP';
  document.getElementById('achievementSummary').textContent = `Você já acumulou ${points} pontos. Escaneie, descubra o material, veja a lixeira correta e complete sua coleção.`;
  const values={1:scans,2:scans,3:scans,4:scans,5:Number(state.ecoPointSearches||0),6:scans,7:categories,8:definedDestination};
  const targets={1:1,2:10,3:25,4:50,5:1,6:100,7:5,8:10};
  Object.entries(targets).forEach(([id,t])=>{
    const value=Math.min(values[id]||0,t);
    document.getElementById(`ach${id}`)?.classList.toggle('locked', value<t);
    const bar=document.getElementById(`achp${id}`); if(bar) bar.style.width=`${(value/t)*100}%`;
  });
}
function registerAchievementFromDetection(item) {
  const state=loadAchievementState();
  const counted=state.countedIds || [];
  const itemKey=String(item.id || `${item.name}-${item.detectedAt}`);
  if (counted.includes(itemKey)) return;
  counted.push(itemKey);
  state.countedIds=counted.slice(-300);
  state.bonusPoints=Number(state.bonusPoints||0) + (['Papel','Plástico','Vidro','Metal','Orgânico','Eletrônico'].includes(item.category)?5:0);
  saveAchievementState(state);
  playEcoSound('success');
}
function registerAchievementMapSearch() {
  const state=loadAchievementState();
  state.ecoPointSearches=Number(state.ecoPointSearches||0)+1;
  saveAchievementState(state);
}

async function maybeRefreshMapAchievement() { try { if (window.ECOSCAN_ENABLE_BACKEND !== true) return; const data = await apiFetch('/api/profile'); if (data.ecoPointSearches >= 1) document.getElementById('ach5')?.classList.remove('locked'); } catch {} }

function initMap() {
  if (!map) {
    map = L.map('ecoMap', { zoomControl: false, preferCanvas: true, attributionControl: true }).setView([-23.5505, -46.6333], 12);
    L.control.zoom({ position: 'bottomright' }).addTo(map);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom:19, attribution:'&copy; OpenStreetMap contributors' }).addTo(map);
  }
  setTimeout(()=>map.invalidateSize(),120);
}

async function queryEcoPointsDirect(latitude, longitude, radius = 3000) {
  const safeRadius = Math.min(Math.max(Number(radius) || 3000, 900), 3500);
  const queries = [
    `[out:json][timeout:8];node[amenity=waste_basket](around:${safeRadius},${latitude},${longitude});node[amenity=public_bin](around:${safeRadius},${latitude},${longitude});out tags;`,
    `[out:json][timeout:8];(node[amenity=recycling](around:${safeRadius},${latitude},${longitude});way[amenity=recycling](around:${safeRadius},${latitude},${longitude});node[amenity=waste_disposal](around:${safeRadius},${latitude},${longitude});way[amenity=waste_disposal](around:${safeRadius},${latitude},${longitude}););out center tags;`,
    `[out:json][timeout:8];(node[amenity=waste_transfer_station](around:${safeRadius},${latitude},${longitude});way[amenity=waste_transfer_station](around:${safeRadius},${latitude},${longitude});node[landuse=landfill](around:${safeRadius},${latitude},${longitude});way[landuse=landfill](around:${safeRadius},${latitude},${longitude}););out center tags;`
  ];
  const endpoints = [
    'https://overpass.kumi.systems/api/interpreter',
    'https://overpass.private.coffee/api/interpreter'
  ];
  const merged = [];
  for (const query of queries) {
    let success = false;
    for (const endpoint of endpoints) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 9000);
        const response = await fetch(`${endpoint}?data=${encodeURIComponent(query)}`, { signal:controller.signal, cache:'no-store' });
        clearTimeout(timeout);
        if (!response.ok) continue;
        const data = await response.json();
        for (const element of (data.elements || [])) {
          const eLat = element.lat ?? element.center?.lat; const eLon = element.lon ?? element.center?.lon;
          if (eLat == null || eLon == null) continue;
          const tags = element.tags || {}; const item = classifyEcoPlace(tags);
          merged.push({ name:item.name, type:item.type, category:item.category, lat:eLat, lon:eLon, distanceMeters:haversineMeters(latitude, longitude, eLat, eLon) });
        }
        success = true; break;
      } catch {}
    }
    if (!success) continue;
  }
  const unique = []; const keys = new Set();
  merged.sort((a,b)=>a.distanceMeters-b.distanceMeters).forEach(item => { const key=`${item.lat.toFixed(5)}|${item.lon.toFixed(5)}`; if(!keys.has(key)){keys.add(key); unique.push(item);} });
  if (unique.length) return unique.slice(0,50);
  return await queryEcoPointsNominatim(latitude, longitude);
}

async function queryEcoPointsNominatim(latitude, longitude) {
  const searches = ['lixeira', 'ecoponto', 'reciclagem', 'ponto de descarte'];
  const results = [];
  for (const q of searches) {
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=8&accept-language=pt-BR&q=${encodeURIComponent(q)}&viewbox=${(longitude-0.035).toFixed(6)},${(latitude+0.035).toFixed(6)},${(longitude+0.035).toFixed(6)},${(latitude-0.035).toFixed(6)}&bounded=1`;
      const response = await fetch(url, { headers:{'Accept':'application/json'}, cache:'no-store' });
      if (!response.ok) continue;
      const data = await response.json();
      for (const item of data) {
        const lat=Number(item.lat), lon=Number(item.lon); if(!Number.isFinite(lat)||!Number.isFinite(lon)) continue;
        const classification=classifyEcoSearchText(`${item.display_name || ''} ${item.type || ''} ${q}`);
        results.push({ name:item.name || item.display_name?.split(',')[0] || classification.name, type:classification.type, category:classification.category, lat, lon, distanceMeters:haversineMeters(latitude,longitude,lat,lon) });
      }
    } catch {}
    await sleep(180);
  }
  const unique=[]; const keys=new Set(); results.sort((a,b)=>a.distanceMeters-b.distanceMeters).forEach(item=>{const key=`${item.lat.toFixed(5)}|${item.lon.toFixed(5)}`;if(!keys.has(key)){keys.add(key);unique.push(item);}});
  return unique.slice(0,40);
}

function classifyEcoSearchText(text) {
  const value=normalizeKey(text);
  if(value.includes('lixeira') || value.includes('waste basket') || value.includes('public bin')) return {name:'Lixeira pública',type:'Lixeira pública',category:'Lixeira'};
  if(value.includes('ecoponto') || value.includes('reciclag')) return {name:'EcoPonto / reciclagem',type:'EcoPonto / reciclagem',category:'Reciclagem'};
  return {name:'Ponto de descarte',type:'Local para descarte',category:'Descarte'};
}

function classifyEcoPlace(tags) {
  const amenity = String(tags.amenity || '').toLowerCase();
  const recyclingType = String(tags.recycling_type || '').toLowerCase();
  const name = tags.name || tags.operator || tags.brand || '';
  if (amenity === 'waste_basket' || amenity === 'public_bin') return { name: name || 'Lixeira pública', type:'Lixeira pública', category:'Lixeira' };
  if (amenity === 'waste_disposal') return { name: name || 'Ponto de descarte', type:'Lixeira / descarte', category:'Descarte' };
  if (amenity === 'waste_transfer_station') return { name: name || 'Estação de resíduos', type:'Estação de resíduos', category:'Resíduos' };
  if (recyclingType === 'centre' || amenity === 'recycling') return { name: name || 'EcoPonto / reciclagem', type:'EcoPonto / reciclagem', category:'Reciclagem' };
  if (tags.landuse === 'landfill') return { name: name || 'Área de descarte de resíduos', type:'Destino de resíduos', category:'Resíduos' };
  return { name: name || 'Ponto de resíduos', type:'Ponto de descarte', category:'Descarte' };
}

function haversineMeters(lat1, lon1, lat2, lon2) {
  const r = 6371000;
  const p1 = lat1 * Math.PI / 180, p2 = lat2 * Math.PI / 180;
  const dp = (lat2 - lat1) * Math.PI / 180, dl = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dp/2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl/2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(a));
}

async function locateEcoPoints() {
  initMap();
  if (!navigator.geolocation) {
    document.getElementById('mapStatus').textContent='Seu navegador não oferece geolocalização.';
    return;
  }
  primeAudio();
  playEcoSound('search');
  locateBtn.disabled=true;
  locateBtn.classList.add('is-loading');
  document.getElementById('mapStatus').textContent='Obtendo sua localização...';
  navigator.geolocation.getCurrentPosition(async position => {
    const { latitude, longitude } = position.coords;
    window._ecoMapLocated = true;
    map.setView([latitude,longitude],16);
    map.setZoomAround([latitude,longitude],16);
    drawUserMarker(latitude, longitude);
    try {
      let items = [];
      if (window.ECOSCAN_ENABLE_BACKEND === true) {
        try {
          const data = await apiFetch(`/api/ecopoints?lat=${encodeURIComponent(latitude)}&lon=${encodeURIComponent(longitude)}&radius=8000`);
          items = data.items || [];
        } catch { items = await queryEcoPointsDirect(latitude, longitude, 5000); }
      } else {
        items = await queryEcoPointsDirect(latitude, longitude, 5000);
      }
      registerAchievementMapSearch();
      renderEcoPoints(items, latitude, longitude);
      if (window.ECOSCAN_ENABLE_BACKEND === true) {
        try { await apiFetch('/api/profile/ecopoint-search',{method:'POST',body:'{}'}); }
        catch { registerLocalEcoPointSearch(); }
      } else registerLocalEcoPointSearch();
      document.getElementById('ach5')?.classList.remove('locked');
      playEcoSound('success');
    } catch(error) {
      document.getElementById('mapStatus').textContent='Não foi possível carregar os pontos agora. Tente atualizar a busca em alguns segundos.';
      document.getElementById('mapList').innerHTML='<p class="empty">Não foi possível carregar os EcoPontos. Verifique a internet e tente novamente.</p>';
      playEcoSound('error');
    } finally {
      locateBtn.disabled=false;
      locateBtn.classList.remove('is-loading');
    }
  }, error => {
    const message = error?.code === 1 ? 'Permita a localização no navegador para encontrar pontos próximos.' : 'Não foi possível obter sua localização. Tente novamente.';
    document.getElementById('mapStatus').textContent=message;
    locateBtn.disabled=false;
    locateBtn.classList.remove('is-loading');
  }, { enableHighAccuracy:true, timeout:10000, maximumAge:120000 });
}

function drawUserMarker(latitude, longitude) {
  if (!map) return;
  if (window._ecoUserMarker) window._ecoUserMarker.remove();
  const pulse = L.divIcon({ className:'user-location-marker', html:'<span class="user-location-pulse"></span><span class="user-location-dot"></span>', iconSize:[28,28], iconAnchor:[14,14] });
  window._ecoUserMarker = L.marker([latitude,longitude], { icon:pulse, zIndexOffset:1000 }).addTo(map).bindPopup('<strong>Você está aqui</strong>');
}

function formatDistance(meters) {
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters/1000).toFixed(1).replace('.', ',')} km`;
}

function formatDuration(seconds) {
  const min = Math.max(1, Math.round(seconds/60));
  return min < 60 ? `${min} min` : `${Math.floor(min/60)}h ${min%60}min`;
}

async function showEcoRoute(item, latitude, longitude) {
  routeTarget = item;
  if (routeLayer) { routeLayer.remove(); routeLayer=null; }
  const routeInfo = document.getElementById('routeInfo');
  routeInfo.hidden = false;
  routeInfo.innerHTML = '<div class="route-info-loading"><span class="route-spinner"></span><div><strong>Calculando rota</strong><small>Abrindo o caminho até este local...</small></div></div>';
  document.querySelectorAll('.map-point-card').forEach(card => card.classList.toggle('selected', card.dataset.pointKey === pointKey(item)));
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${longitude},${latitude};${item.lon},${item.lat}?overview=full&geometries=geojson&steps=false`;
    const response = await fetch(url);
    if (!response.ok) throw new Error('rota indisponível');
    const data = await response.json();
    const route = data.routes?.[0];
    if (!route) throw new Error('nenhuma rota encontrada');
    const coords = route.geometry.coordinates.map(([lon,lat])=>[lat,lon]);
    routeLayer = L.polyline(coords, { color:'#52c76a', weight:6, opacity:.9, lineCap:'round', lineJoin:'round' }).addTo(map);
    map.fitBounds(routeLayer.getBounds(), { padding:[26,26] });
    routeInfo.innerHTML = `<div class="route-info-main"><div class="route-icon"><i data-lucide="route"></i></div><div><small>ROTA ATÉ O LOCAL</small><strong>${escapeHTML(item.name)}</strong><span class="muted">${escapeHTML(item.type)}</span></div></div><div class="route-metrics"><span><strong>${formatDistance(route.distance)}</strong><small>distância</small></span><span><strong>${formatDuration(route.duration)}</strong><small>tempo estimado</small></span></div><div class="route-actions"><button class="btn btn-primary" type="button" id="openMapsBtn">Abrir no Maps</button><button class="btn btn-outline route-close" type="button" id="closeRouteBtn">Fechar</button></div>`;
    document.getElementById('closeRouteBtn')?.addEventListener('click', clearRoute);
    document.getElementById('openMapsBtn')?.addEventListener('click', () => openExternalDirections(item, latitude, longitude));
    if (window.lucide) lucide.createIcons();
    playEcoSound('route');
  } catch {
    routeInfo.innerHTML = `<div class="route-info-main"><div class="route-icon"><i data-lucide="map-pin"></i></div><div><small>CAMINHO</small><strong>${escapeHTML(item.name)}</strong><span class="muted">Este ponto está a ${formatDistance(item.distanceMeters)} de você.</span></div></div><div class="route-actions"><button class="btn btn-primary" type="button" id="openMapsBtn">Abrir no Maps</button><button class="btn btn-outline route-close" type="button" id="closeRouteBtn">Fechar</button></div>`;
    document.getElementById('closeRouteBtn')?.addEventListener('click', clearRoute);
    document.getElementById('openMapsBtn')?.addEventListener('click', () => openExternalDirections(item, latitude, longitude));
    if (window.lucide) lucide.createIcons();
  }
}

function openExternalDirections(item, latitude, longitude) {
  const url = `https://www.google.com/maps/dir/?api=1&origin=${latitude},${longitude}&destination=${item.lat},${item.lon}&travelmode=driving`;
  window.open(url, '_blank', 'noopener,noreferrer');
}

function clearRoute() {
  if (routeLayer) { routeLayer.remove(); routeLayer=null; }
  routeTarget=null;
  const routeInfo=document.getElementById('routeInfo');
  if (routeInfo) { routeInfo.hidden=true; routeInfo.innerHTML=''; }
  document.querySelectorAll('.map-point-card').forEach(card=>card.classList.remove('selected'));
}

function pointKey(item) { return `${Number(item.lat).toFixed(5)}|${Number(item.lon).toFixed(5)}`; }

function renderEcoPoints(items, latitude, longitude) {
  mapMarkers.forEach(marker=>marker.remove()); mapMarkers=[]; clearRoute();
  mapItems = (items || []).map((item,index) => ({...item, _index:index}));
  window._ecoLastLocation = { latitude, longitude };
  drawUserMarker(latitude, longitude);
  renderMapList();
  const count = mapItems.length;
  document.getElementById('mapStatus').textContent = count ? `${count} local(is) encontrado(s) perto de você.` : 'Nenhum local encontrado ainda nesta área.';
  document.getElementById('nearbyCount').textContent = count;
  if (!count) { document.getElementById('mapList').innerHTML='<p class="empty">Não encontramos pontos mapeados próximos. Tente novamente em outra área ou abra o Maps para procurar mais locais.</p>'; return; }
  if (window.lucide) lucide.createIcons();
}

function getFilteredMapItems() {
  if (activeMapFilter === 'all') return mapItems;
  return mapItems.filter(item => item.category === activeMapFilter);
}

function renderMapList() {
  const list=document.getElementById('mapList'); if(!list) return;
  mapMarkers.forEach(marker=>marker.remove()); mapMarkers=[];
  const items=getFilteredMapItems();
  const loc=window._ecoLastLocation;
  if(!items.length) { list.innerHTML='<p class="empty">Nenhum local desta categoria foi encontrado perto de você.</p>'; if(document.getElementById('nearbyCount')) document.getElementById('nearbyCount').textContent='0'; return; }
  if(document.getElementById('nearbyCount')) document.getElementById('nearbyCount').textContent=items.length;
  list.innerHTML=items.slice(0,20).map((item,index)=>{
    const icon = item.category==='Lixeira' ? 'trash-2' : item.category==='Reciclagem' ? 'recycle' : 'trash';
    return `<article class="map-point-card" data-point-key="${pointKey(item)}" data-category="${escapeHTML(item.category)}"><div class="point-index"><i data-lucide="${icon}"></i></div><div class="point-copy"><h3>${escapeHTML(item.name)}</h3><p>${escapeHTML(item.type)}</p><div class="point-meta"><span><i data-lucide="navigation"></i>${formatDistance(item.distanceMeters)}</span><span><i data-lucide="route"></i>Ver caminho</span></div></div><button class="point-route-btn" type="button" aria-label="Mostrar rota"><i data-lucide="arrow-up-right"></i></button></article>`;
  }).join('');
  items.slice(0,20).forEach((item,index)=>{
    const marker=L.marker([item.lat,item.lon], { title:item.name, riseOnHover:true }).addTo(map).bindPopup(`<div class="popup-place"><strong>${escapeHTML(item.name)}</strong><span>${escapeHTML(item.type)}</span><b>${formatDistance(item.distanceMeters)} de você</b></div>`);
    marker.on('click',()=>{ if(loc) showEcoRoute(item,loc.latitude,loc.longitude); });
    mapMarkers.push(marker);
    list.children[index]?.addEventListener('click',()=>{ if(loc) { showEcoRoute(item,loc.latitude,loc.longitude); map.setView([item.lat,item.lon],17,{animate:true}); marker.openPopup(); }});
  });
  if (window.lucide) lucide.createIcons();
}

function renderCreators() {
  const list=document.getElementById('creatorsList'); const creators=window.ECOSCAN_CREATORS || [];
  list.innerHTML = creators.map(person => `<article class="creator-card"><div><h3>${escapeHTML(person.name)}</h3><p>${escapeHTML(person.role||'Colaborador')}</p></div><a href="${safeURL(person.github)}" target="_blank" rel="noopener noreferrer" class="creator-github">GitHub</a></article>`).join('');
}
function safeURL(url) { try { const parsed=new URL(url); return ['http:','https:'].includes(parsed.protocol) ? parsed.href : '#'; } catch { return '#'; } }
function escapeHTML(value) { return String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;'); }
function primeAudio() {
  if (!soundSwitch?.classList.contains('on')) return;
  try {
    audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
    if (audioContext.state === 'suspended') audioContext.resume();
  } catch {}
}

function playEcoSound(type='success') {
  if (!soundSwitch?.classList.contains('on')) return;
  try {
    primeAudio();
    if (!audioContext) return;
    const patterns = {
      start: [[330,.06,0],[494,.10,.07]],
      search: [[392,.05,0],[523,.08,.06]],
      detect: [[523,.05,0],[659,.09,.06]],
      success: [[392,.05,0],[523,.06,.06],[784,.13,.12]],
      route: [[440,.05,0],[587,.06,.06],[740,.11,.12]],
      error: [[330,.08,0],[247,.11,.09]]
    };
    const now = audioContext.currentTime;
    (patterns[type] || patterns.success).forEach(([freq,dur,delay])=>{
      const osc=audioContext.createOscillator(); const gain=audioContext.createGain();
      osc.type='sine'; osc.frequency.value=freq;
      gain.gain.setValueAtTime(.0001, now+delay);
      gain.gain.exponentialRampToValueAtTime(.055, now+delay+.015);
      gain.gain.exponentialRampToValueAtTime(.0001, now+delay+dur);
      osc.connect(gain); gain.connect(audioContext.destination);
      osc.start(now+delay); osc.stop(now+delay+dur+.02);
    });
  } catch {}
}

function sleep(ms) { return new Promise(resolve=>setTimeout(resolve,ms)); }
