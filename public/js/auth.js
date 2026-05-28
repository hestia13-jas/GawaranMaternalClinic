function showFormError(msg) {
  const el = document.getElementById('formError');
  if (!el) return;
  el.textContent = msg;
  el.classList.toggle('visible', !!msg);
}

function showFormSuccess(msg) {
  const el = document.getElementById('formSuccess');
  if (!el) return;
  el.textContent = msg;
  el.classList.toggle('visible', !!msg);
}

async function readJsonResponse(res) {
  try {
    return await res.json();
  } catch {
    return {};
  }
}

let pendingOtp = null;

function initSignupForm() {
  setupSignupLiveValidation();
  setupTermsModal();

  document.getElementById('signupForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    showFormError('');
    showFormSuccess('');

    if (!validateSignupForm()) return;

    const payload = {
      firstName: document.getElementById('firstName').value.trim(),
      middleName: document.getElementById('middleName').value.trim(),
      lastName: document.getElementById('lastName').value.trim(),
      phone: document.getElementById('phone').value.trim(),
      email: document.getElementById('email').value.trim(),
      password: document.getElementById('password').value,
      acceptTerms: document.getElementById('acceptTerms').checked,
    };

    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true;

    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await readJsonResponse(res);
      if (!res.ok) {
        if (data.errors) {
          Object.entries(data.errors).forEach(([field, message]) => showFieldError(field, message));
        }
        showFormError(data.error || 'Registration failed.');
        return;
      }
      showFormSuccess('Account created! Redirecting to login...');
      setTimeout(() => {
        window.location.href = data.redirect || '/login.html';
      }, 1500);
    } catch {
      showFormError('Network error. Please try again.');
    } finally {
      btn.disabled = false;
    }
  });
}

function setupTermsModal() {
  const modal = document.getElementById('termsModal');
  const checkbox = document.getElementById('acceptTerms');
  const open = () => {
    if (modal) modal.hidden = false;
  };
  const close = () => {
    if (modal) modal.hidden = true;
  };
  document.getElementById('termsOpen')?.addEventListener('click', open);
  document.getElementById('termsClose')?.addEventListener('click', close);
  document.getElementById('termsAccept')?.addEventListener('click', () => {
    if (checkbox) checkbox.checked = true;
    close();
  });
  modal?.addEventListener('click', (event) => {
    if (event.target === modal) close();
  });
}

function initLoginForm() {
  loadConfig?.().catch(() => {});
  document.getElementById('loginForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    showFormError('');

    if (!validateLoginForm()) return;

    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    const rememberDevice = document.getElementById('rememberDevice').checked;

    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true;

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, rememberDevice }),
      });
      const data = await readJsonResponse(res);

      if (!res.ok) {
        let msg = data.error || 'Login failed.';
        if (data.attemptsRemaining !== undefined) {
          msg += ` (${data.attemptsRemaining} attempt(s) remaining)`;
        }
        showFormError(msg);
        return;
      }

      if (data.requiresOtp) {
        pendingOtp = {
          userId: data.userId || data.session?.user?.id,
          session: data.session,
        };
        document.getElementById('loginForm').style.display = 'none';
        document.getElementById('otpSection')?.classList.add('visible');

        if (data.emailSent) {
          showFormSuccess(data.message || 'Verification code sent to your email.');
          showFormError('');
        } else if (data.devOtp) {
          showFormSuccess(`Development mode — your code is: ${data.devOtp}`);
        } else {
          showFormSuccess(data.message || 'Enter your verification code.');
        }
        return;
      }

      saveSession(data.session);
      window.location.href = data.redirect || '/dashboard/patient';
    } catch {
      showFormError('Network error. Please try again.');
    } finally {
      btn.disabled = false;
    }
  });

  document.getElementById('verifyOtpBtn')?.addEventListener('click', async () => {
    const code = document.getElementById('otpCode')?.value?.trim();
    if (!code || code.length !== 6) {
      showWarning('otpCode', 'otpWarning', true);
      return;
    }
    showWarning('otpCode', 'otpWarning', false);

    if (!pendingOtp) {
      showFormError('Session expired. Please sign in again.');
      return;
    }

    try {
      const res = await fetch('/api/auth/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({
          userId: pendingOtp.userId,
          code,
          session: pendingOtp.session,
        }),
      });
      const data = await readJsonResponse(res);
      if (!res.ok) {
        showFormError(data.error || 'Verification failed.');
        return;
      }
      saveSession(data.session);
      window.location.href = data.redirect || '/dashboard/patient';
    } catch {
      showFormError('Network error during verification.');
    }
  });

  document.getElementById('resendOtpBtn')?.addEventListener('click', async () => {
    if (!pendingOtp?.userId) {
      showFormError('Session expired. Please sign in again.');
      return;
    }

    const btn = document.getElementById('resendOtpBtn');
    btn.disabled = true;

    try {
      const res = await fetch('/api/auth/resend-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ userId: pendingOtp.userId }),
      });
      const data = await readJsonResponse(res);
      if (!res.ok) {
        showFormError(data.error || 'Could not resend code.');
        return;
      }
      if (data.devOtp) {
        showFormSuccess(`New code (dev): ${data.devOtp}`);
      } else {
        showFormSuccess(data.message || 'A new code was sent.');
      }
      showFormError('');
    } catch {
      showFormError('Network error. Please try again.');
    } finally {
      btn.disabled = false;
    }
  });
}

function initForgotPasswordForm() {
  document.getElementById('forgotPasswordForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    showFormError('');
    showFormSuccess('');

    const email = document.getElementById('email')?.value?.trim() || '';
    if (!Validators.email(email)) {
      showWarning('email', 'emailWarning', true);
      return;
    }
    showWarning('email', 'emailWarning', false);

    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true;

    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await readJsonResponse(res);
      if (!res.ok) {
        showFormError(data.error || 'Request failed.');
        return;
      }
      showFormSuccess(data.message);
      document.getElementById('email').disabled = true;
      btn.disabled = true;
    } catch {
      showFormError('Network error. Please try again.');
      btn.disabled = false;
    }
  });
}

function initResetPasswordForm() {
  const form = document.getElementById('resetPasswordForm');
  const loading = document.getElementById('loadingState');
  let recoveryReady = false;

  async function establishRecoverySession() {
    const client = await getSupabase();
    if (!client) {
      loading.textContent = 'Server not configured. Check Supabase settings.';
      showFormError('Supabase is not configured.');
      return false;
    }

    const hash = window.location.hash.substring(1);
    const params = new URLSearchParams(hash);
    const accessToken = params.get('access_token');
    const refreshToken = params.get('refresh_token');
    const type = params.get('type');

    if (type === 'recovery' && accessToken && refreshToken) {
      const { error } = await client.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });
      if (error) {
        loading.textContent = 'Invalid or expired reset link.';
        showFormError(error.message);
        return false;
      }
      history.replaceState(null, '', window.location.pathname);
      return true;
    }

    const { data } = await client.auth.getSession();
    if (data?.session) return true;

    loading.textContent = 'Invalid or expired reset link.';
    showFormError('Request a new reset link from the forgot password page.');
    return false;
  }

  establishRecoverySession().then((ok) => {
    recoveryReady = ok;
    if (ok) {
      loading.style.display = 'none';
      form.style.display = 'block';
    }
  });

  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    showFormError('');
    showFormSuccess('');

    if (!recoveryReady) {
      showFormError('Reset session not ready. Refresh the page or request a new link.');
      return;
    }

    const password = document.getElementById('password')?.value || '';
    const confirmPassword = document.getElementById('confirmPassword')?.value || '';

    let valid = true;
    valid = !showWarning('password', 'passwordWarning', !Validators.password(password)) && valid;
    valid =
      !showWarning('confirmPassword', 'confirmPasswordWarning', !Validators.passwordsMatch(password, confirmPassword)) &&
      valid;
    if (!valid) return;

    const client = await getSupabase();
    if (!client) {
      showFormError('Supabase is not configured.');
      return;
    }

    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true;

    try {
      const { error } = await client.auth.updateUser({ password });
      if (error) {
        showFormError(error.message);
        btn.disabled = false;
        return;
      }

      await fetch('/api/auth/password-updated', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({}),
      }).catch(() => {});

      showFormSuccess('Password updated! Redirecting to sign in...');
      await client.auth.signOut();
      setTimeout(() => {
        window.location.href = '/login.html';
      }, 2000);
    } catch {
      showFormError('Network error. Please try again.');
      btn.disabled = false;
    }
  });
}
