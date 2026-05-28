# Email Setup (OTP + Password Reset)

## Password reset (Supabase Auth email)

Supabase sends password-reset emails automatically when you call `resetPasswordForEmail`.

### 1. Redirect URLs

In **Supabase Dashboard → Authentication → URL Configuration**, add:

| Environment | Redirect URL |
|-------------|--------------|
| Local | `http://localhost:3000/reset-password.html` |
| Production | `https://your-domain.com/reset-password.html` |

Set **Site URL** to your app root (e.g. `http://localhost:3000`).

### 2. Custom SMTP (recommended for production)

**Authentication → SMTP Settings → Enable Custom SMTP**

Use your provider (Resend, SendGrid, Gmail, etc.) and copy the same values into your app `.env` for OTP emails:

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=gawaranclinic@gmail.com
SMTP_PASS=your-google-app-password
SMTP_FROM=Gawaran Maternal Clinic <gawaranclinic@gmail.com>
```

Use a [Google App Password](https://myaccount.google.com/apppasswords) (2-Step Verification must be on).

### 3. Email templates

**Authentication → Email Templates → Reset Password**

Customize the subject/body. The link must use `{{ .ConfirmationURL }}` (default).

### 4. Test forgot password

1. Set `APP_URL=http://localhost:3000` in `.env`
2. Run `npm start`
3. Open `/forgot-password.html`, enter a registered email
4. Click the link in the email → lands on `/reset-password.html`

---

## 2FA OTP emails (Node.js + nodemailer)

When `two_factor_enabled = true` on a profile, login sends a 6-digit code via SMTP.

### Enable 2FA for a user

```sql
UPDATE profiles SET two_factor_enabled = true WHERE email = 'your@email.com';
```

### Development without SMTP

If `SMTP_*` is not set, the OTP is printed in the **server console** and shown in the login UI (dev only).

### Production

Configure `SMTP_*` in `.env` (same SMTP as Supabase Auth is fine).

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| No reset email | Check spam; verify SMTP in Supabase; confirm email exists in Auth |
| Reset link invalid | Add exact redirect URL to Supabase allow list |
| OTP not received | Verify `SMTP_*` in `.env`; check server logs |
| Link opens but form errors | Ensure `PUBLIC_SUPABASE_*` keys match your project |
