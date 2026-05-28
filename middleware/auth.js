const { supabaseAdmin } = require('../lib/supabase');
const { verifyLocalToken } = require('../lib/localAuth');

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
    req.user = {
      id: localUser.id,
      email: localUser.email,
      role: localUser.role || 'patient',
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
    };
    return next();
  }

  if (!supabaseAdmin) {
    return res.status(503).json({ error: 'Server configuration incomplete.' });
  }

  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data?.user) {
    return res.status(401).json({ error: 'Invalid or expired session.' });
  }

  let { data: profile, error: profileError } = await supabaseAdmin
    .from('profiles')
    .select('id, role, first_name, middle_name, last_name, email, phone, profile_photo_url, is_locked, two_factor_enabled, must_change_password, temporary_password_expires_at')
    .eq('id', data.user.id)
    .single();

  if (profileError && /profile_photo_url|must_change_password|temporary_password_expires_at|schema cache|does not exist/i.test(profileError.message)) {
    const fallback = await supabaseAdmin
      .from('profiles')
      .select('id, role, first_name, middle_name, last_name, email, phone, is_locked, two_factor_enabled, must_change_password, temporary_password_expires_at')
      .eq('id', data.user.id)
      .single();
    profile = fallback.data;
  }

  if (profile?.is_locked) {
    return res.status(423).json({ error: 'Account is locked. Contact administration.' });
  }

  req.user = {
    id: data.user.id,
    email: data.user.email,
    ...profile,
  };
  next();
}

module.exports = { verifyToken };
