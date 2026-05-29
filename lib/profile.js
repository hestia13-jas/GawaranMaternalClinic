const VALID_ROLES = new Set(['admin', 'doctor', 'nurse', 'staff', 'patient']);
const ROLE_PRIORITY = { admin: 5, doctor: 4, nurse: 3, staff: 2, patient: 1 };

/** Demo / clinic accounts — email always wins over a stale patient role in DB */
const CLINIC_ROLE_BY_EMAIL = {
  'admin@clinicgawaran.ph': 'admin',
  'doctor@clinicgawaran.ph': 'doctor',
  'nurse@clinicgawaran.ph': 'nurse',
  'staff@clinicgawaran.ph': 'staff',
  'patient@clinicgawaran.ph': 'patient',
};

const PROFILE_SELECT_FULL =
  'id, role, first_name, middle_name, last_name, email, phone, profile_photo_url, is_locked, two_factor_enabled, must_change_password, temporary_password_expires_at';
const PROFILE_SELECT_BASIC =
  'id, role, first_name, middle_name, last_name, email, phone, is_locked, two_factor_enabled';
const PROFILE_SELECT_MINIMAL = 'id, role, first_name, middle_name, last_name, email, phone, is_locked, two_factor_enabled';

function normalizeRole(role) {
  if (role == null) return null;
  const value = String(role).trim().toLowerCase();
  return VALID_ROLES.has(value) ? value : null;
}

function higherRole(a, b) {
  const ra = normalizeRole(a);
  const rb = normalizeRole(b);
  if (!ra) return rb;
  if (!rb) return ra;
  return (ROLE_PRIORITY[ra] || 0) >= (ROLE_PRIORITY[rb] || 0) ? ra : rb;
}

function roleFromClinicEmail(email) {
  const e = String(email || '').trim().toLowerCase();
  if (!e) return null;
  if (CLINIC_ROLE_BY_EMAIL[e]) return CLINIC_ROLE_BY_EMAIL[e];
  if (!e.endsWith('@clinicgawaran.ph')) return null;
  const local = e.split('@')[0];
  return VALID_ROLES.has(local) ? local : null;
}

function resolveUserRole(profile, email) {
  const fromEmail = roleFromClinicEmail(email);
  if (fromEmail) return fromEmail;
  const fromDb = normalizeRole(profile?.role);
  return fromDb || 'patient';
}

/** Role for API authorization — clinic demo emails always win over stale DB values. */
function roleForRequest(user, email) {
  const normalizedEmail = String(email || user?.email || user?.user_metadata?.email || '').trim().toLowerCase();
  return resolveUserRole(user, normalizedEmail);
}

async function fetchProfileRow(supabaseAdmin, select, filter) {
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select(select)
    .eq(filter.field, filter.value)
    .maybeSingle();
  return { data, error };
}

async function persistProfileRole(supabaseAdmin, userId, profile, targetRole, email) {
  const payload = {
    id: userId,
    email: profile?.email || email,
    first_name: profile?.first_name || 'User',
    middle_name: profile?.middle_name ?? null,
    last_name: profile?.last_name || 'User',
    phone: profile?.phone ?? null,
    role: targetRole,
    is_locked: profile?.is_locked ?? false,
    is_active: profile?.is_active !== false,
  };

  const { error } = await supabaseAdmin.from('profiles').upsert(payload, { onConflict: 'id' });
  if (error) {
    console.warn(`Could not persist profile role for ${email || userId}: ${error.message}`);
    return { ...profile, ...payload, id: userId, role: targetRole };
  }

  const { data } = await fetchProfileRow(supabaseAdmin, PROFILE_SELECT_MINIMAL, { field: 'id', value: userId });
  return data ? { ...data, role: resolveUserRole(data, email) } : { ...payload, id: userId, role: targetRole };
}

async function syncProfileRoleForAuthUser(supabaseAdmin, authUser) {
  if (!supabaseAdmin || !authUser?.id) return null;

  const userId = authUser.id;
  const email = typeof authUser.email === 'string' ? authUser.email.trim().toLowerCase() : '';

  let profileById = null;
  for (const select of [PROFILE_SELECT_FULL, PROFILE_SELECT_BASIC, PROFILE_SELECT_MINIMAL]) {
    const { data, error } = await fetchProfileRow(supabaseAdmin, select, { field: 'id', value: userId });
    if (!error && data) {
      profileById = data;
      break;
    }
  }

  let profileByEmail = null;
  if (email) {
    const { data, error } = await supabaseAdmin
      .from('profiles')
      .select(PROFILE_SELECT_MINIMAL)
      .ilike('email', email)
      .maybeSingle();
    if (!error && data) profileByEmail = data;
  }

  const merged = profileById || profileByEmail;
  const targetRole = resolveUserRole(merged, email);

  if (!profileById && profileByEmail) {
    return persistProfileRole(supabaseAdmin, userId, profileByEmail, targetRole, email);
  }

  if (profileById && normalizeRole(profileById.role) !== targetRole) {
    return persistProfileRole(supabaseAdmin, userId, profileById, targetRole, email);
  }

  if (merged) {
    return { ...merged, id: userId, email: merged.email || email, role: targetRole };
  }

  if (roleFromClinicEmail(email)) {
    return persistProfileRole(supabaseAdmin, userId, null, targetRole, email);
  }

  return null;
}

async function loadProfileForAuthUser(supabaseAdmin, authUser) {
  return syncProfileRoleForAuthUser(supabaseAdmin, authUser);
}

async function ensureProfileForAuthUser(supabaseAdmin, authUser) {
  const existing = await syncProfileRoleForAuthUser(supabaseAdmin, authUser);
  if (existing) return existing;

  const email = authUser.email?.trim().toLowerCase();
  const meta = authUser.user_metadata || {};
  const targetRole = roleFromClinicEmail(email) || normalizeRole(meta.role) || 'patient';

  const { data: createdProfile, error } = await supabaseAdmin
    .from('profiles')
    .insert({
      id: authUser.id,
      email,
      first_name: meta.first_name || 'User',
      middle_name: meta.middle_name || null,
      last_name: meta.last_name || 'Patient',
      phone: meta.phone || null,
      role: targetRole,
      is_locked: false,
      is_active: true,
    })
    .select(PROFILE_SELECT_MINIMAL)
    .maybeSingle();

  if (error) {
    if (/duplicate|unique|already exists/i.test(error.message)) {
      return syncProfileRoleForAuthUser(supabaseAdmin, authUser);
    }
    console.warn(`Could not create profile for ${email || authUser.id}: ${error.message}`);
    return null;
  }

  await supabaseAdmin
    .from('patients')
    .insert({ profile_id: authUser.id, status: 'outpatient' })
    .then(() => null, () => null);

  return createdProfile;
}

function buildAuthUser(authUser, profile) {
  const email = profile?.email || authUser.email;
  const role = roleForRequest(profile, email);
  return {
    id: authUser.id,
    email,
    user_metadata: authUser.user_metadata || {},
    ...profile,
    id: authUser.id,
    role,
    isLocal: false,
  };
}

module.exports = {
  VALID_ROLES,
  CLINIC_ROLE_BY_EMAIL,
  normalizeRole,
  roleFromClinicEmail,
  resolveUserRole,
  roleForRequest,
  syncProfileRoleForAuthUser,
  loadProfileForAuthUser,
  ensureProfileForAuthUser,
  buildAuthUser,
};
