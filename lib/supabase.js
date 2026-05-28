const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceKey) {
  console.warn('Warning: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set. API routes may fail.');
}

const supabaseAdmin = supabaseUrl && serviceKey
  ? createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
  : null;

module.exports = { supabaseAdmin };
