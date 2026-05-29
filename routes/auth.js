const express = require('express');
const { supabaseAdmin } = require('../lib/supabase');
const { sendOtpEmail } = require('../lib/email');
const {
  createLocalSession,
  createLocalUser,
  findLocalUserByEmail,
  recordLocalLogin,
  verifyLocalPassword,
} = require('../lib/localAuth');
const { getDashboardPath } = require('../middleware/rbac');
const { loadProfileForAuthUser, resolveUserRole, roleForRequest } = require('../lib/profile');

const router = express.Router();
const INCORRECT_LOGIN_MESSAGE = 'Incorrect Email or Password';

const NAME_RE = /^[A-Za-z\s'-]{2,60}$/;
const PHONE_RE = /^09\d{9}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function allowLocalFallback() {
  return process.env.USE_LOCAL_FALLBACK !== 'false' && process.env.NODE_ENV !== 'production';
}

function cleanText(value) {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
}

function normalizeEmail(value) {
  return cleanText(value).toLowerCase();
}

function validatePassword(value) {
  if (typeof value !== 'string' || value.length < 8 || value.length > 72) {
    return 'Password must be 8 to 72 characters.';
  }
  if (!/[A-Z]/.test(value) || !/[0-9]/.test(value) || !/[^A-Za-z0-9]/.test(value)) {
    return 'Password must include at least one uppercase letter, one number, and one special character.';
  }
  return null;
}

function validateRegistration(body) {
  const firstName = cleanText(body.firstName);
  const middleName = cleanText(body.middleName);
  const lastName = cleanText(body.lastName);
  const phone = cleanText(body.phone);
  const email = normalizeEmail(body.email);
  const password = typeof body.password === 'string' ? body.password : '';
  const errors = {};

  if (!NAME_RE.test(firstName)) errors.firstName = 'First name must be 2 to 60 letters.';
  if (middleName && !NAME_RE.test(middleName)) errors.middleName = 'Middle name must contain letters only.';
  if (!NAME_RE.test(lastName)) errors.lastName = 'Last name must be 2 to 60 letters.';
  if (!PHONE_RE.test(phone)) errors.phone = 'Phone number must be exactly 11 digits and start with 09.';
  if (!EMAIL_RE.test(email) || email.length > 254) errors.email = 'Enter a valid email address.';

  const passwordError = validatePassword(password);
  if (passwordError) errors.password = passwordError;
  if (!body.acceptTerms) errors.acceptTerms = 'You must accept the Terms of Service.';

  return {
    values: { firstName, middleName, lastName, phone, email, password },
    errors,
  };
}

function validationResponse(res, errors) {
  const firstError = Object.values(errors)[0] || 'Please check the form and try again.';
  return res.status(400).json({ error: firstError, errors });
}

async function logAudit(userId, action, details = {}, ip = null) {
  if (!supabaseAdmin) return;
  await supabaseAdmin.from('audit_logs').insert({
    user_id: userId,
    action,
    details,
    ip_address: ip,
  });
}

async function checkLockout(email) {
  const { data } = await supabaseAdmin
    .from('login_attempts')
    .select('attempt_count, locked_until')
    .eq('email', email.toLowerCase())
    .maybeSingle();

  if (data?.locked_until && new Date(data.locked_until) > new Date()) {
    const mins = Math.ceil((new Date(data.locked_until) - new Date()) / 60000);
    return { locked: true, minutes: mins };
  }
  return { locked: false, attempts: data?.attempt_count || 0 };
}

async function recordFailedLogin(email, ip) {
  const { data } = await supabaseAdmin
    .from('login_attempts')
    .select('attempt_count')
    .eq('email', email.toLowerCase())
    .maybeSingle();

  const count = (data?.attempt_count || 0) + 1;
  const lockedUntil =
    count >= MAX_ATTEMPTS
      ? new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000).toISOString()
      : null;

  await supabaseAdmin.from('login_attempts').upsert(
    {
      email: email.toLowerCase(),
      attempt_count: count,
      locked_until: lockedUntil,
      last_attempt_at: new Date().toISOString(),
    },
    { onConflict: 'email' }
  );

  if (lockedUntil) {
    await supabaseAdmin
      .from('profiles')
      .update({ is_locked: true })
      .eq('email', email.toLowerCase());
  }

  return { count, locked: !!lockedUntil };
}

async function recordLoginHistory({ userId = null, email, success, req }) {
  const device = req.get('user-agent') || null;
  if (!supabaseAdmin) return;
  const { error } = await supabaseAdmin.from('login_history').insert({
    user_id: userId,
    email: email?.toLowerCase(),
    success,
    ip_address: req.ip,
    device,
  });
  if (error) console.warn(`Login history not recorded: ${error.message}`);
}

async function clearLoginAttempts(email) {
  await supabaseAdmin.from('login_attempts').delete().eq('email', email.toLowerCase());
  await supabaseAdmin.from('profiles').update({ is_locked: false }).eq('email', email.toLowerCase());
}

function getAppUrl() {
  return process.env.APP_URL || `http://localhost:${process.env.PORT || 3000}`;
}

async function createAndSendOtp(userId, email, firstName) {
  const otp = String(Math.floor(100000 + Math.random() * 900000));
  const expires = new Date(Date.now() + 10 * 60 * 1000).toISOString();

  await supabaseAdmin.from('otp_codes').upsert(
    { user_id: userId, code: otp, expires_at: expires },
    { onConflict: 'user_id' }
  );

  let emailResult = { sent: false };
  try {
    emailResult = await sendOtpEmail({ to: email, code: otp, firstName });
  } catch (err) {
    if (process.env.NODE_ENV !== 'development') {
      throw err;
    }
    emailResult = { sent: false, devMode: true, error: err.message };
  }

  return { otp, emailResult };
}

router.post('/register', async (req, res) => {
  const { values, errors } = validateRegistration(req.body || {});
  if (Object.keys(errors).length) {
    return validationResponse(res, errors);
  }

  try {
    if (supabaseAdmin) {
      const { data: existingProfile } = await supabaseAdmin
        .from('profiles')
        .select('id')
        .eq('email', values.email)
        .maybeSingle();

      if (existingProfile) {
        return res.status(409).json({ error: 'An account already exists with this email address.' });
      }

      const { data: authData, error: signUpError } = await supabaseAdmin.auth.admin.createUser({
        email: values.email,
        password: values.password,
        email_confirm: true,
        user_metadata: {
          first_name: values.firstName,
          middle_name: values.middleName,
          last_name: values.lastName,
          phone: values.phone,
        },
      });

      if (!signUpError) {
        const userId = authData.user.id;
        const { error: profileError } = await supabaseAdmin.from('profiles').upsert(
          {
            id: userId,
            email: values.email,
            first_name: values.firstName,
            middle_name: values.middleName || null,
            last_name: values.lastName,
            phone: values.phone,
            role: 'patient',
            is_locked: false,
            is_active: true,
          },
          { onConflict: 'id' }
        );

        if (profileError) {
          await supabaseAdmin.auth.admin.deleteUser(userId);
          const rls = /row-level security|rls/i.test(profileError.message);
          return res.status(400).json({
            error: rls
              ? 'Profile could not be saved (database security policy). Run supabase/fix-profiles-rls-signup.sql in Supabase SQL Editor, and confirm SUPABASE_SERVICE_ROLE_KEY in .env is the service_role key (not anon).'
              : profileError.message,
          });
        }

        const { data: existingPatient, error: patientLookupError } = await supabaseAdmin
          .from('patients')
          .select('id')
          .eq('profile_id', userId)
          .maybeSingle();

        if (patientLookupError) {
          await supabaseAdmin.auth.admin.deleteUser(userId);
          return res.status(400).json({ error: patientLookupError.message });
        }

        const { error: patientError } = existingPatient
          ? { error: null }
          : await supabaseAdmin.from('patients').insert({ profile_id: userId, status: 'outpatient' });

        if (patientError) {
          await supabaseAdmin.auth.admin.deleteUser(userId);
          return res.status(400).json({ error: patientError.message });
        }

        await logAudit(userId, 'account_created', { email: values.email }, req.ip);
        return res.status(201).json({ message: 'Account created successfully.', redirect: '/login.html' });
      }

      const duplicate = /already|registered|exists/i.test(signUpError.message);
      if (duplicate) {
        return res.status(409).json({ error: signUpError.message });
      }

      if (!allowLocalFallback()) {
        return res.status(502).json({ error: `Supabase signup failed: ${signUpError.message}` });
      }

      console.warn(`Supabase signup failed, using local account fallback: ${signUpError.message}`);
    }

    if (!allowLocalFallback()) {
      return res.status(503).json({ error: 'Supabase is required, but the database is not configured.' });
    }

    const existingLocal = findLocalUserByEmail(values.email);
    if (existingLocal) {
      return res.status(409).json({ error: 'An account already exists with this email address.' });
    }

    createLocalUser(values);
    return res.status(201).json({ message: 'Account created successfully.', redirect: '/login.html' });
  } catch (err) {
    if (err.code === 'duplicate') {
      return res.status(409).json({ error: err.message });
    }
    console.error('Registration error:', err);
    return res.status(500).json({ error: 'Account creation failed. Please try again.' });
  }
});

router.post('/login', async (req, res) => {
  const { email, password, rememberDevice } = req.body;
  const cleanEmail = normalizeEmail(email);

  if (!EMAIL_RE.test(cleanEmail) || !password) {
    return res.status(400).json({ error: INCORRECT_LOGIN_MESSAGE });
  }

  let localUser = null;
  if (allowLocalFallback()) {
    try {
      localUser = verifyLocalPassword(cleanEmail, password);
    } catch (err) {
      if (err.code === 'temporary_password_expired') {
        return res.status(423).json({ error: err.message });
      }
      throw err;
    }
  }

  if (!supabaseAdmin) {
    if (!allowLocalFallback()) {
      return res.status(503).json({ error: 'Supabase is required, but the database is not configured.' });
    }
    if (!localUser) {
      recordLocalLogin({ email: cleanEmail, success: false, ip: req.ip, device: req.get('user-agent') });
      return res.status(401).json({ error: INCORRECT_LOGIN_MESSAGE });
    }
    recordLocalLogin({ user: localUser, email: cleanEmail, success: true, ip: req.ip, device: req.get('user-agent') });
    const session = createLocalSession(localUser);
      const localRole = roleForRequest(localUser, cleanEmail);
      return res.json({ session, role: localRole, redirect: getDashboardPath(localRole) });
  }

  const { data, error } = await supabaseAdmin.auth.signInWithPassword({ email: cleanEmail, password });

  if (error) {
    if (localUser) {
      await clearLoginAttempts(cleanEmail);
      recordLocalLogin({ user: localUser, email: cleanEmail, success: true, ip: req.ip, device: req.get('user-agent') });
      const session = createLocalSession(localUser);
      const localRole = roleForRequest(localUser, cleanEmail);
      return res.json({ session, role: localRole, redirect: getDashboardPath(localRole) });
    }

    await recordLoginHistory({ email: cleanEmail, success: false, req });
    await logAudit(null, 'login_failed', { email: cleanEmail }, req.ip);
    return res.status(401).json({ error: INCORRECT_LOGIN_MESSAGE });
  }

  await clearLoginAttempts(cleanEmail);

  const profile = await loadProfileForAuthUser(supabaseAdmin, data.user);
  const role = roleForRequest(profile, cleanEmail);

  if (profile?.temporary_password_expires_at && new Date(profile.temporary_password_expires_at) < new Date()) {
    return res.status(423).json({ error: 'Temporary password expired. Please contact the clinic administrator.' });
  }

  await logAudit(data.user.id, 'login_success', { rememberDevice: !!rememberDevice }, req.ip);
  await recordLoginHistory({ userId: data.user.id, email: cleanEmail, success: true, req });

  if (profile?.two_factor_enabled) {
    const { data: userProfile } = await supabaseAdmin
      .from('profiles')
      .select('first_name, email')
      .eq('id', data.user.id)
      .single();

    const { otp, emailResult } = await createAndSendOtp(
      data.user.id,
      userProfile?.email || email,
      userProfile?.first_name
    );

    await logAudit(data.user.id, 'otp_sent', { emailSent: emailResult.sent }, req.ip);

    return res.json({
      requiresOtp: true,
      userId: data.user.id,
      session: data.session,
      emailSent: emailResult.sent,
      message: emailResult.sent
        ? 'A verification code was sent to your email.'
        : 'Enter the verification code (check server console in development).',
      devOtp:
        process.env.NODE_ENV === 'development' && !emailResult.sent ? otp : undefined,
    });
  }

  res.json({
    session: data.session,
    role,
    redirect: getDashboardPath(role),
  });
});

router.post('/verify-otp', async (req, res) => {
  if (!supabaseAdmin) {
    return res.status(503).json({ error: 'Database not configured.' });
  }

  const { userId, code, session } = req.body;

  const { data: otpRow } = await supabaseAdmin
    .from('otp_codes')
    .select('code, expires_at')
    .eq('user_id', userId)
    .single();

  if (!otpRow || otpRow.code !== code || new Date(otpRow.expires_at) < new Date()) {
    return res.status(401).json({ error: 'Invalid or expired verification code.' });
  }

  await supabaseAdmin.from('otp_codes').delete().eq('user_id', userId);

  const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(userId);
  const profile = await loadProfileForAuthUser(supabaseAdmin, authUser?.user || { id: userId, email: session?.user?.email });
  const role = roleForRequest(profile, authUser?.user?.email || session?.user?.email);

  await logAudit(userId, 'otp_verified', {}, req.ip);

  res.json({
    session,
    role,
    redirect: getDashboardPath(role),
  });
});

router.post('/resend-otp', async (req, res) => {
  if (!supabaseAdmin) {
    return res.status(503).json({ error: 'Database not configured.' });
  }

  const { userId } = req.body;
  if (!userId) {
    return res.status(400).json({ error: 'User ID is required.' });
  }

  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('email, first_name, two_factor_enabled')
    .eq('id', userId)
    .single();

  if (!profile?.two_factor_enabled) {
    return res.status(400).json({ error: 'Two-factor authentication is not enabled for this account.' });
  }

  try {
    const { otp, emailResult } = await createAndSendOtp(userId, profile.email, profile.first_name);
    await logAudit(userId, 'otp_resent', { emailSent: emailResult.sent }, req.ip);

    res.json({
      message: emailResult.sent ? 'A new code was sent to your email.' : 'New code generated.',
      emailSent: emailResult.sent,
      devOtp: process.env.NODE_ENV === 'development' && !emailResult.sent ? otp : undefined,
    });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to send verification email.' });
  }
});

router.post('/password-updated', async (req, res) => {
  res.json({ message: 'Password updated successfully.' });
});

router.post('/forgot-password', async (req, res) => {
  if (!supabaseAdmin) {
    return res.status(503).json({ error: 'Database not configured.' });
  }

  const { email } = req.body;
  if (!email?.trim()) {
    return res.status(400).json({ error: 'Email is required.' });
  }

  const redirectTo = `${getAppUrl()}/reset-password.html`;

  const { error } = await supabaseAdmin.auth.resetPasswordForEmail(email.trim(), {
    redirectTo,
  });

  if (error) {
    console.error('Password reset error:', error.message);
  }

  await logAudit(null, 'password_reset_requested', { email: email.toLowerCase() }, req.ip);

  res.json({
    message:
      'If an account exists with that email, you will receive a password reset link shortly. Check your inbox and spam folder.',
    redirectTo,
  });
});

module.exports = router;
