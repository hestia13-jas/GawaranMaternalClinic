/**
 * Creates demo users for each role in Supabase.
 * Requires .env with SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
 *
 * Usage: node scripts/create-demo-users.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { createClient } = require('@supabase/supabase-js');

const DEMO_PASSWORD = 'Demo@Gawaran2026';

const USERS = [
  { email: 'admin@gawaranclinic.ph', role: 'admin', firstName: 'Admin', lastName: 'Gawaran' },
  { email: 'doctor@gawaranclinic.ph', role: 'doctor', firstName: 'Maria', lastName: 'Santos' },
  { email: 'nurse@gawaranclinic.ph', role: 'nurse', firstName: 'Ana', lastName: 'Reyes' },
  { email: 'staff@gawaranclinic.ph', role: 'staff', firstName: 'Juan', lastName: 'Cruz' },
  { email: 'patient@gawaranclinic.ph', role: 'patient', firstName: 'Jane', lastName: 'Dela Cruz' },
];

async function main() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key || url.includes('your-project')) {
    console.error('\n❌ Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env first.\n');
    process.exit(1);
  }

  const supabase = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  console.log('\nCreating demo users...\n');
  console.log(`Password for all accounts: ${DEMO_PASSWORD}\n`);

  for (const u of USERS) {
    const { data: existing } = await supabase.auth.admin.listUsers();
    const found = existing?.users?.find((x) => x.email === u.email);

    let userId = found?.id;

    if (!userId) {
      const { data, error } = await supabase.auth.admin.createUser({
        email: u.email,
        password: DEMO_PASSWORD,
        email_confirm: true,
        user_metadata: { first_name: u.firstName, last_name: u.lastName },
      });
      if (error) {
        console.error(`  ✗ ${u.email}: ${error.message}`);
        continue;
      }
      userId = data.user.id;
      console.log(`  ✓ Created auth user: ${u.email}`);
    } else {
      await supabase.auth.admin.updateUserById(userId, { password: DEMO_PASSWORD });
      console.log(`  ✓ Updated password: ${u.email}`);
    }

    await supabase.from('profiles').upsert(
      {
        id: userId,
        email: u.email,
        first_name: u.firstName,
        last_name: u.lastName,
        phone: '09171234567',
        role: u.role,
        is_active: true,
        is_locked: false,
        two_factor_enabled: false,
      },
      { onConflict: 'id' }
    );

    console.log(`    → role: ${u.role}`);
  }

  console.log('\n✅ Done. Log in at http://localhost:3000/login.html\n');
  console.log('See TEST_ACCOUNTS.md for the email list.\n');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
