const Validators = {
  name(value) {
    if (!value || !value.trim()) return false;
    return /^[A-Za-z\s'-]{2,60}$/.test(value.trim().replace(/\s+/g, ' '));
  },

  phone(value) {
    if (!value || !value.trim()) return false;
    return /^09\d{9}$/.test(value.trim());
  },

  email(value) {
    if (!value || !value.trim()) return false;
    const email = value.trim();
    return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
  },

  password(value, min = 8) {
    return (
      typeof value === 'string' &&
      value.length >= min &&
      value.length <= 72 &&
      /[A-Z]/.test(value) &&
      /[0-9]/.test(value) &&
      /[^A-Za-z0-9]/.test(value)
    );
  },

  passwordsMatch(password, confirm) {
    return password === confirm && password.length > 0;
  },
};

function showWarning(inputId, warningId, show) {
  const input = document.getElementById(inputId);
  const warning = document.getElementById(warningId);
  if (!warning) return false;
  if (show) {
    warning.classList.add('visible');
    input?.classList.add('invalid');
  } else {
    warning.classList.remove('visible');
    input?.classList.remove('invalid');
  }
  return show;
}

function showFieldError(fieldId, message) {
  const warning = document.getElementById(`${fieldId}Warning`);
  if (warning && message) warning.textContent = message;
  showWarning(fieldId, `${fieldId}Warning`, !!message);
}

function bindLiveValidation(fieldId, warningId, validatorFn) {
  const el = document.getElementById(fieldId);
  if (!el) return null;
  const validate = () => {
    const invalid = !validatorFn(el.value);
    showWarning(fieldId, warningId, invalid && el.value.length > 0);
    return !invalid;
  };
  el.addEventListener('blur', validate);
  el.addEventListener('input', validate);
  return validate;
}

function validateSignupForm() {
  const firstName = document.getElementById('firstName')?.value || '';
  const middleName = document.getElementById('middleName')?.value || '';
  const lastName = document.getElementById('lastName')?.value || '';
  const phone = document.getElementById('phone')?.value || '';
  const email = document.getElementById('email')?.value || '';
  const password = document.getElementById('password')?.value || '';
  const confirmPassword = document.getElementById('confirmPassword')?.value || '';
  const acceptTerms = document.getElementById('acceptTerms')?.checked;

  let valid = true;

  valid = !showWarning('firstName', 'firstNameWarning', !Validators.name(firstName)) && valid;
  valid = !showWarning('middleName', 'middleNameWarning', middleName && !Validators.name(middleName)) && valid;
  valid = !showWarning('lastName', 'lastNameWarning', !Validators.name(lastName)) && valid;
  valid = !showWarning('phone', 'phoneWarning', !Validators.phone(phone)) && valid;
  valid = !showWarning('email', 'emailWarning', !Validators.email(email)) && valid;
  valid = !showWarning('password', 'passwordWarning', !Validators.password(password)) && valid;
  valid =
    !showWarning('confirmPassword', 'confirmPasswordWarning', !Validators.passwordsMatch(password, confirmPassword)) &&
    valid;

  const termsWarning = document.getElementById('termsWarning');
  if (!acceptTerms) {
    termsWarning?.classList.add('visible');
    valid = false;
  } else {
    termsWarning?.classList.remove('visible');
  }

  return valid;
}

function validateLoginForm() {
  const email = document.getElementById('email')?.value || '';
  const password = document.getElementById('password')?.value || '';
  let valid = true;
  valid = !showWarning('email', 'emailWarning', !Validators.email(email)) && valid;
  valid = !showWarning('password', 'passwordWarning', !password) && valid;
  return valid;
}

function setupSignupLiveValidation() {
  ['firstName', 'middleName', 'lastName'].forEach((fieldId) => {
    const input = document.getElementById(fieldId);
    input?.addEventListener('input', () => {
      input.value = input.value.replace(/[^A-Za-z\s'-]/g, '');
    });
  });

  const phone = document.getElementById('phone');
  phone?.addEventListener('input', () => {
    phone.value = phone.value.replace(/\D/g, '').slice(0, 11);
  });

  bindLiveValidation('firstName', 'firstNameWarning', Validators.name);
  bindLiveValidation('middleName', 'middleNameWarning', (v) => !v || Validators.name(v));
  bindLiveValidation('lastName', 'lastNameWarning', Validators.name);
  bindLiveValidation('phone', 'phoneWarning', Validators.phone);
  bindLiveValidation('email', 'emailWarning', Validators.email);
  bindLiveValidation('password', 'passwordWarning', Validators.password);

  const confirm = document.getElementById('confirmPassword');
  const validateConfirm = () => {
    const p = document.getElementById('password')?.value || '';
    const c = confirm?.value || '';
    showWarning('confirmPassword', 'confirmPasswordWarning', c.length > 0 && !Validators.passwordsMatch(p, c));
  };
  confirm?.addEventListener('blur', validateConfirm);
  confirm?.addEventListener('input', validateConfirm);
}
