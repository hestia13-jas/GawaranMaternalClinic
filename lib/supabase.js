const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.SUPABASE_ANON_KEY || process.env.PUBLIC_SUPABASE_ANON_KEY;

function jwtRole(key) {
  if (!key || typeof key !== 'string') return null;
  try {
    const payload = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString('utf8'));
    return payload.role || null;
  } catch {
    return null;
  }
}

if (!supabaseUrl || !serviceKey) {
  console.warn('Warning: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set. API routes may fail.');
} else if (anonKey && serviceKey === anonKey) {
  console.error(
    'ERROR: SUPABASE_SERVICE_ROLE_KEY must be the service_role key, not the anon key. ' +
      'Signup will fail with RLS errors until you fix .env (Supabase → Settings → API).'
  );
} else {
  const role = jwtRole(serviceKey);
  if (role && role !== 'service_role') {
    console.warn(
      `Warning: SUPABASE_SERVICE_ROLE_KEY JWT role is "${role}", expected "service_role". Signup may fail.`
    );
  }
}

const supabaseAdmin =
  supabaseUrl && serviceKey
    ? createClient(supabaseUrl, serviceKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      })
    : null;

module.exports = { supabaseAdmin };
