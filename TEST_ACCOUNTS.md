# Demo login accounts (all roles)

There are **no built-in passwords** until you create these users. Use **one** of the two methods below.

**Shared demo password (all accounts):** `Demo@Gawaran2026`

| Role | Email | Dashboard after login |
|------|-------|---------------------|
| Admin | `admin@clinicgawaran.ph` | `/portal.html` |
| Doctor | `doctor@clinicgawaran.ph` | `/portal.html` |
| Nurse | `nurse@clinicgawaran.ph` | `/portal.html` |
| Staff | `staff@clinicgawaran.ph` | `/portal.html` |
| Patient | `patient@clinicgawaran.ph` | `/portal.html` |

---

## Stuck on PATIENT portal after setting roles?

Your **auth user id** must match `profiles.id`, and `profiles.role` must be set on that row.

1. Run in Supabase SQL Editor: `supabase/sync-profile-roles-by-email.sql`  
   **or** from the project folder:
   ```powershell
   node scripts/sync-profile-roles.js
   ```
2. **Sign out** completely, then log in again (old session keeps the old role).

---

## Signup blocked by RLS?

If signup shows **"new row violates row-level security policy for table profiles"**:

1. In Supabase → **SQL Editor**, run the file `supabase/fix-profiles-rls-signup.sql`.
2. In `.env`, set `SUPABASE_SERVICE_ROLE_KEY` to the **service_role** key (not the anon key).

---

## Method A — Automatic (recommended)

1. Finish Supabase setup and put real keys in `.env`.
2. Run:

```powershell
cd "C:\Users\bryan longalong\Desktop\GawaranMaternalClinic"
node scripts/create-demo-users.js
```

3. Log in at http://localhost:3000/login.html with any email above and password `Demo@Gawaran2026`.

---

## Method B — Manual (no script)

1. Open http://localhost:3000/signup.html five times (or use different browsers).
2. Register each email with password `Demo@Gawaran2026`.
3. In **Supabase → SQL Editor**, run:

```sql
UPDATE profiles SET role = 'admin'  WHERE email = 'admin@clinicgawaran.ph';
UPDATE profiles SET role = 'doctor' WHERE email = 'doctor@clinicgawaran.ph';
UPDATE profiles SET role = 'nurse'  WHERE email = 'nurse@clinicgawaran.ph';
UPDATE profiles SET role = 'staff'  WHERE email = 'staff@clinicgawaran.ph';
UPDATE profiles SET role = 'patient' WHERE email = 'patient@clinicgawaran.ph';
```

---

## Optional: test 2FA (OTP email)

```sql
UPDATE profiles SET two_factor_enabled = true WHERE email = 'admin@clinicgawaran.ph';
```

Login will email a 6-digit code to that account’s inbox (must be a real mailbox you control, or use your own email and change the role with SQL).

---

## Your real Gmail

`gawaranclinic@gmail.com` is only for **sending** clinic emails (SMTP), not one of the demo logins above. You can sign up with it as a **patient** if you want your own account.
