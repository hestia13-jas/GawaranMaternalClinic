/**
 * Prints auth.users vs profiles (id + role) and fixes role on profiles.id = auth.users.id
 * Usage: node scripts/sync-profile-roles.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { createClient } = require('@supabase/supabase-js');

const DEMO_EMAILS = [
  'admin@clinicgawaran.ph',
  'doctor@clinicgawaran.ph',
  'nurse@clinicgawaran.ph',
  'staff@clinicgawaran.ph',
  'patient@clinicgawaran.ph',
];

const ROLE_BY_PREFIX = {
  admin: 'admin',
  doctor: 'doctor',
  nurse: 'nurse',
  staff: 'staff',
  patient: 'patient',
};

function expectedRole(email) {
  const local = email.split('@')[0];
  return ROLE_BY_PREFIX[local] || 'patient';
}

async function main() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env');
    process.exit(1);
  }

  const supabase = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: listData, error: listError } = await supabase.auth.admin.listUsers({ perPage: 200 });
  if (listError) {
    console.error(listError.message);
    process.exit(1);
  }

  console.log('\nEmail                          | auth id (short) | profile role | expected | OK');
  console.log('-'.repeat(85));

  for (const email of DEMO_EMAILS) {
    const authUser = listData.users.find((u) => u.email?.toLowerCase() === email);
    if (!authUser) {
      console.log(`${email.padEnd(30)} | (no auth user)`.padEnd(50));
      continue;
    }

    const want = expectedRole(email);
    const { data: profile } = await supabase.from('profiles').select('id, role, email').eq('id', authUser.id).maybeSingle();

    const ok = profile?.role === want;
    console.log(
      `${email.padEnd(30)} | ${authUser.id.slice(0, 8)}… | ${String(profile?.role || 'MISSING').padEnd(12)} | ${want.padEnd(8)} | ${ok ? 'yes' : 'NO'}`
    );

    if (!ok) {
      const { error } = await supabase.from('profiles').upsert(
        {
          id: authUser.id,
          email,
          first_name: profile?.first_name || want.charAt(0).toUpperCase() + want.slice(1),
          last_name: profile?.last_name || 'Gawaran',
          role: want,
          is_active: true,
          is_locked: false,
        },
        { onConflict: 'id' }
      );
      if (error) console.error(`  → fix failed: ${error.message}`);
      else console.log(`  → updated role to ${want}`);
    }
  }

  console.log('\nDone. Sign out, then log in again.\n');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
