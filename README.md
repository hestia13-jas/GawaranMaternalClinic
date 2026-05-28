# Gawaran Maternal Clinic

Full-stack maternity clinic web application with **Node.js**, **HTML/CSS**, and **Supabase**.

## Features

- **Landing page** — Hero, 9 service cards, PRC/HIPAA/RA 10173 badges, footer
- **Authentication** — Login, signup, forgot password, reset password, inline validation
- **Email** — Supabase password-reset emails + SMTP OTP for 2FA
- **Dashboards** — Admin, Doctor, and Patient portals with widgets and charts
- **Security** — RBAC, audit logs, 2FA/OTP, account lockout, Helmet, rate limiting

## Quick Start

### 1. Supabase setup

1. Create a project at [supabase.com](https://supabase.com).
2. Open **SQL Editor** and run `supabase/schema.sql`.
3. Copy **Project URL**, **anon key**, and **service_role key** from Settings → API.

### 2. Configure environment

```powershell
cd "C:\Users\bryan longalong\Projects\GawaranMaternalClinic"
copy .env.example .env
```

Or double-click **`start-clinic.bat`** — see **`HOW_TO_RUN.md`** for full steps.

Edit `.env` with your Supabase credentials and `APP_URL`.

For **2FA OTP emails**, add `SMTP_*` settings (see `supabase/EMAIL_SETUP.md`).

For **password reset emails**, configure Supabase Auth SMTP and redirect URLs (same guide).

### 3. Install & run

```bash
npm install
npm start
```

Open [http://localhost:3000](http://localhost:3000).

### 4. Create an admin user

1. Sign up at `/signup.html` (creates a **patient** role).
2. In Supabase SQL Editor:

```sql
UPDATE profiles SET role = 'admin', two_factor_enabled = true WHERE email = 'your@email.com';
```

3. Log in — if 2FA is on, check your email for the OTP (or the server console in dev without SMTP).

## Email & Password Recovery

| Page | URL |
|------|-----|
| Forgot password | `/forgot-password.html` |
| Reset password (from email link) | `/reset-password.html` |

**Forgot password** uses Supabase Auth (`resetPasswordForEmail`). Configure redirect URLs in the Supabase dashboard.

**2FA OTP** is sent via nodemailer using `SMTP_*` in `.env`. Full setup: [`supabase/EMAIL_SETUP.md`](supabase/EMAIL_SETUP.md).

```sql
-- Enable 2FA for testing
UPDATE profiles SET two_factor_enabled = true WHERE email = 'your@email.com';
```

## Project Structure

```
├── server.js              # Express API + static files
├── routes/                # Auth, dashboard API, audit logs
├── middleware/            # JWT verify, RBAC
├── supabase/schema.sql    # Database tables & RLS
└── public/
    ├── index.html         # Landing page
    ├── login.html / signup.html / forgot-password.html / reset-password.html
    ├── css/main.css
    ├── js/                # Validation, auth, dashboards
    └── dashboards/        # admin, doctor, patient
```

## Validation Rules (Signup)

| Field | Rule |
|-------|------|
| Names | Letters only (spaces, hyphens allowed) |
| Phone | Numbers only |
| Email | Valid email format |
| Password | Min 8 characters; must match confirm |

Warnings appear inline inside each form group on blur/invalid input.

## Security

- **RBAC**: `admin`, `doctor`, `nurse`, `staff`, `patient`
- **Lockout**: 5 failed attempts → 15 min lock (configurable in `.env`)
- **2FA**: Enable `two_factor_enabled` on a profile for OTP step at login
- **Audit**: `GET /api/audit` (admin only)
- **Transport**: Use HTTPS in production; Supabase provides AES-256 at rest

## Production

- Deploy behind HTTPS (Railway, Render, Azure, etc.)
- Set `NODE_ENV=production`
- Never expose `SUPABASE_SERVICE_ROLE_KEY` to the browser
