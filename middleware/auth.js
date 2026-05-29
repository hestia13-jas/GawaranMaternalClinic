const { verifyLocalToken } = require('../lib/localAuth');
const {
  normalizeRole,
  resolveUserRole,
  roleFromClinicEmail,
  loadProfileForAuthUser,
  ensureProfileForAuthUser,
  buildAuthUser,
  syncProfileRoleForAuthUser,
} = require('../lib/profile');
const { supabaseAdmin } = require('../lib/supabase');

function attachSessionRole(user, fallbackEmail = '') {
  const email = String(user?.email || fallbackEmail || user?.user_metadata?.email || '').trim().toLowerCase();
  const role = resolveUserRole(user, email);
  return { ...user, email, role };
}

async function verifyToken(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required.' });
  }

  const token = authHeader.slice(7);
  if (token.startsWith('local:')) {
    const localUser = verifyLocalToken(token);
    if (!localUser) {
      return res.status(401).json({ error: 'Invalid or expired session.' });
    }
    if (localUser.is_locked) {
      return res.status(423).json({ error: 'Account is locked. Contact administration.' });
    }
    req.user = attachSessionRole({
      id: localUser.id,
      email: localUser.email,
      first_name: localUser.first_name,
      middle_name: localUser.middle_name,
      last_name: localUser.last_name,
      phone: localUser.phone,
      profile_photo_url: localUser.profile_photo_url,
      must_change_password: localUser.must_change_password,
      temporary_password_expires_at: localUser.temporary_password_expires_at,
      is_locked: false,
      two_factor_enabled: false,
      isLocal: true,
      role: localUser.role,
    }, localUser.email);
    return next();
  }

  if (!supabaseAdmin) {
    return res.status(503).json({ error: 'Server configuration incomplete.' });
  }

  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data?.user) {
    return res.status(401).json({ error: 'Invalid or expired session.' });
  }

  let profile = await loadProfileForAuthUser(supabaseAdmin, data.user);
  if (!profile) {
    profile = await ensureProfileForAuthUser(supabaseAdmin, data.user);
  } else {
    const synced = await syncProfileRoleForAuthUser(supabaseAdmin, data.user);
    if (synced) profile = synced;
  }

  if (profile?.is_locked) {
    return res.status(423).json({ error: 'Account is locked. Contact administration.' });
  }

  req.user = attachSessionRole(buildAuthUser(data.user, profile), data.user.email);
  next();
}

module.exports = { verifyToken, normalizeRole, attachSessionRole };
