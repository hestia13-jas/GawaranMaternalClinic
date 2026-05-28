let appConfig = null;
let supabaseClient = null;

async function loadConfig() {
  if (appConfig) return appConfig;
  const res = await fetch('/api/config');
  appConfig = await res.json();
  if (appConfig.csrfToken) {
    sessionStorage.setItem('gmc_csrf', appConfig.csrfToken);
  }
  return appConfig;
}

async function getSupabase() {
  if (supabaseClient) return supabaseClient;
  const config = await loadConfig();
  if (!config.supabaseUrl || !config.supabaseAnonKey) {
    console.warn('Supabase not configured');
    return null;
  }
  if (typeof supabase !== 'undefined') {
    supabaseClient = supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);
  }
  return supabaseClient;
}

function saveSession(session) {
  if (!session) return;
  sessionStorage.setItem('gmc_session', JSON.stringify(session));
  sessionStorage.setItem('gmc_last_activity', String(Date.now()));
}

function getSession() {
  try {
    return JSON.parse(sessionStorage.getItem('gmc_session') || 'null');
  } catch {
    return null;
  }
}

function clearSession() {
  sessionStorage.removeItem('gmc_session');
  sessionStorage.removeItem('gmc_pending_otp');
  sessionStorage.removeItem('gmc_last_activity');
}

function getAuthHeaders() {
  const session = getSession();
  const headers = {};
  const csrf = sessionStorage.getItem('gmc_csrf');
  if (csrf) headers['X-CSRF-Token'] = csrf;
  if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;
  return headers;
}

async function setupAutoLogout(onLogout) {
  const config = await loadConfig().catch(() => ({ inactivityMinutes: 30 }));
  const limitMs = (Number(config.inactivityMinutes) || 30) * 60 * 1000;
  const refresh = () => sessionStorage.setItem('gmc_last_activity', String(Date.now()));
  ['click', 'keydown', 'mousemove', 'touchstart'].forEach((eventName) => {
    window.addEventListener(eventName, refresh, { passive: true });
  });
  refresh();
  setInterval(() => {
    const last = Number(sessionStorage.getItem('gmc_last_activity') || Date.now());
    if (getSession()?.access_token && Date.now() - last > limitMs) {
      clearSession();
      if (typeof onLogout === 'function') onLogout();
      else window.location.href = '/login.html';
    }
  }, 30000);
}

async function requireAuth(allowedRoles) {
  const session = getSession();
  if (!session?.access_token) {
    window.location.href = '/login.html';
    return null;
  }
  const res = await fetch('/api/me', { headers: getAuthHeaders() });
  if (res.status === 401 || res.status === 423) {
    clearSession();
    window.location.href = '/login.html';
    return null;
  }
  return res.ok;
}
