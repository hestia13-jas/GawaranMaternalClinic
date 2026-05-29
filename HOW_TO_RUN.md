# How to Run Gawaran Maternal Clinic in Your Browser

## Quick start (Windows)

1. **Open this folder in Cursor** (or File Explorer):
   `C:\Users\bryan longalong\Desktop\GawaranMaternalClinic`

2. **Double-click** `start-clinic.bat`  
   OR open PowerShell in this folder and run:
   ```powershell
   npm start
   ```

3. **Open your browser** and go to:
   ```
   http://localhost:3000
   ```

4. **Stop the server:** press `Ctrl + C` in the terminal window.

---

## Pages to try

| Page | URL |
|------|-----|
| Home (landing) | http://localhost:3000 |
| Sign up | http://localhost:3000/signup.html |
| Login | http://localhost:3000/login.html |
| **Clinic portal** (all roles) | http://localhost:3000/portal.html |
| Forgot password | http://localhost:3000/forgot-password.html |

After login you are taken to the portal with role-based menus: patients, appointments, lab, records, messages, reports, security, and more.

---

## Before login works (Supabase required)

Sign-up and login need a Supabase project:

1. Go to [supabase.com](https://supabase.com) → create a project (free).
2. **SQL Editor** → paste and run `supabase/schema.sql`, then `supabase/schema-extensions.sql`.
   - If your database already exists, run `supabase/2026-05-29-calendar-personalization-emergency.sql`, then `supabase/2026-05-29-clinic-schedule-services.sql` for appointment slots, services, and care tips from the database.
   - If signup says `Database error creating new user`, run `supabase/2026-05-29-disable-auth-signup-triggers.sql`. The server already creates the profile after Auth creates the user, so the Auth trigger is not needed.
3. **Settings → API** → copy URL, anon key, and service_role key.
4. Edit `.env` in this folder and replace the three `your-*` Supabase values.
5. **Authentication → URL Configuration** → add:
   - `http://localhost:3000/reset-password.html`
6. Restart the server (`Ctrl+C`, then `npm start` again).

---

## Gmail (already configured in `.env`)

OTP emails for 2FA use `gawaranclinic@gmail.com`.  
Enable 2FA on a user in Supabase SQL:

```sql
UPDATE profiles SET two_factor_enabled = true WHERE email = 'your-test@email.com';
```

---

## Folder rename note

If you still have the old folder `gawaran-maternal-clinic`, close Cursor, delete or rename it, and use **GawaranMaternalClinic** only.
