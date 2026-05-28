# Demo login accounts (all roles)

There are **no built-in passwords** until you create these users. Use **one** of the two methods below.

**Shared demo password (all accounts):** `Demo@Gawaran2026`

| Role | Email | Dashboard after login |
|------|-------|---------------------|
| Admin | `admin@gawaranclinic.ph` | `/dashboard/admin` |
| Doctor | `doctor@gawaranclinic.ph` | `/dashboard/doctor` |
| Nurse | `nurse@gawaranclinic.ph` | `/dashboard/doctor` |
| Staff | `staff@gawaranclinic.ph` | `/dashboard/admin` |
| Patient | `patient@gawaranclinic.ph` | `/dashboard/patient` |

---

## Method A — Automatic (recommended)

1. Finish Supabase setup and put real keys in `.env`.
2. Run:

```powershell
cd "C:\Users\bryan longalong\Projects\GawaranMaternalClinic"
node scripts/create-demo-users.js
```

3. Log in at http://localhost:3000/login.html with any email above and password `Demo@Gawaran2026`.

---

## Method B — Manual (no script)

1. Open http://localhost:3000/signup.html five times (or use different browsers).
2. Register each email with password `Demo@Gawaran2026`.
3. In **Supabase → SQL Editor**, run:

```sql
UPDATE profiles SET role = 'admin'  WHERE email = 'admin@gawaranclinic.ph';
UPDATE profiles SET role = 'doctor' WHERE email = 'doctor@gawaranclinic.ph';
UPDATE profiles SET role = 'nurse'  WHERE email = 'nurse@gawaranclinic.ph';
UPDATE profiles SET role = 'staff'  WHERE email = 'staff@gawaranclinic.ph';
UPDATE profiles SET role = 'patient' WHERE email = 'patient@gawaranclinic.ph';
```

---

## Optional: test 2FA (OTP email)

```sql
UPDATE profiles SET two_factor_enabled = true WHERE email = 'admin@gawaranclinic.ph';
```

Login will email a 6-digit code to that account’s inbox (must be a real mailbox you control, or use your own email and change the role with SQL).

---

## Your real Gmail

`gawaranclinic@gmail.com` is only for **sending** clinic emails (SMTP), not one of the demo logins above. You can sign up with it as a **patient** if you want your own account.
