const express = require('express');
const { supabaseAdmin } = require('../lib/supabase');
const { sendAdminCreatedAccountEmail, sendAppointmentEmail, sendAppointmentRequestEmail, sendPasswordChangeCodeEmail } = require('../lib/email');
const {
  confirmLocalPasswordChange,
  createLocalAppointment,
  createLocalFeedback,
  createLocalMessage,
  createLocalMedicalRecord,
  createLocalNotification,
  createLocalPasswordChange,
  createLocalUser,
  createLocalWaitlist,
  deleteLocalMessage,
  deleteLocalUser,
  listLocalAppointments,
  listLocalDoctors,
  listLocalFeedback,
  listLocalLoginHistory,
  listLocalMessages,
  listLocalMedicalRecords,
  listLocalNotifications,
  listLocalPatients,
  listLocalStaff,
  listLocalUnavailableDays,
  listLocalUsersForMessages,
  listLocalWaitlist,
  localAppointmentConflict,
  markLocalNotificationRead,
  setLocalUnavailableDay,
  updateLocalFeedbackApproval,
  updateLocalProfile,
  updateLocalAppointmentStatus,
} = require('../lib/localAuth');
const { verifyToken } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');

const router = express.Router();
const pendingPasswordChanges = new Map();

function fullName(profile) {
  return `${profile?.first_name || ''} ${profile?.last_name || ''}`.trim() || profile?.email || 'Unknown';
}

function empty(source = 'database') {
  return { source };
}

function publicLocalFeedback() {
  return listLocalFeedback(null, { publicOnly: true }).slice(0, 12).map((item) => ({
    id: item.id,
    rating: item.rating,
    comment: item.comment,
    patientName: item.patient_name,
    doctorName: item.doctor_name,
    createdAt: item.created_at,
  }));
}

function databaseUnavailable(res, payload) {
  return res.json({ ...payload, source: 'database' });
}

function normalizeSlot(date) {
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return '';
  parsed.setSeconds(0, 0);
  return parsed.toISOString();
}

function sectionForNotification(type) {
  return {
    appointment: 'appointments',
    document: 'records',
    feedback: 'feedback',
    message: 'messages',
    security: 'profile',
  }[type] || 'overview';
}

function dateKey(value) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value || '').slice(0, 10);
  return parsed.toISOString().slice(0, 10);
}

function publicProfile(user) {
  return {
    id: user.id,
    email: user.email,
    firstName: user.first_name,
    middleName: user.middle_name,
    lastName: user.last_name,
    role: user.role,
    phone: user.phone,
    twoFactor: user.two_factor_enabled,
    profilePhotoUrl: user.profile_photo_url,
    mustChangePassword: user.must_change_password,
    temporaryPasswordExpiresAt: user.temporary_password_expires_at,
  };
}

function validationPassword(value) {
  if (typeof value !== 'string' || value.length < 8 || value.length > 72) return 'Password must be 8 to 72 characters.';
  if (!/[A-Z]/.test(value) || !/[0-9]/.test(value) || !/[^A-Za-z0-9]/.test(value)) {
    return 'Password must include at least one uppercase letter, one number, and one special character.';
  }
  return null;
}

const TEMPORARY_PASSWORD = 'Temporary@2026';
const ACCOUNT_ROLES = new Set(['patient', 'doctor', 'admin']);
const NAME_RE = /^[A-Za-z\s'-]{2,60}$/;
const PHONE_RE = /^09\d{9}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function cleanText(value) {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
}

function validateAdminAccount(body) {
  const firstName = cleanText(body.firstName);
  const middleName = cleanText(body.middleName);
  const lastName = cleanText(body.lastName);
  const phone = cleanText(body.phone);
  const email = cleanText(body.email).toLowerCase();
  const role = cleanText(body.role).toLowerCase();

  if (!ACCOUNT_ROLES.has(role)) return { error: 'Role must be patient, doctor, or admin.' };
  if (!NAME_RE.test(firstName)) return { error: 'First name must be 2 to 60 letters.' };
  if (middleName && !NAME_RE.test(middleName)) return { error: 'Middle name must contain letters only.' };
  if (!NAME_RE.test(lastName)) return { error: 'Last name must be 2 to 60 letters.' };
  if (!PHONE_RE.test(phone)) return { error: 'Phone number must be exactly 11 digits and start with 09.' };
  if (!EMAIL_RE.test(email) || email.length > 254) return { error: 'Enter a valid email address.' };

  return { values: { firstName, middleName, lastName, phone, email, role } };
}

router.get('/public/feedback', async (req, res) => {
  if (!supabaseAdmin) {
    return res.json({
      feedback: publicLocalFeedback(),
      source: 'local-database',
    });
  }
  const { data, error } = await supabaseAdmin
    .from('feedback')
    .select('id, rating, comment, created_at, patient:profiles!feedback_patient_id_fkey(first_name, last_name), doctor:profiles!feedback_doctor_id_fkey(first_name, last_name)')
    .eq('is_public', true)
    .eq('is_approved', true)
    .order('created_at', { ascending: false })
    .limit(12);
  if (error) {
    if (/feedback|schema cache|does not exist/i.test(error.message)) {
      return res.json({ feedback: publicLocalFeedback(), source: 'local-database' });
    }
    return res.status(500).json({ error: error.message });
  }
  const feedback = (data || []).map((item) => ({
      id: item.id,
      rating: item.rating,
      comment: item.comment,
      patientName: fullName(item.patient),
      doctorName: item.doctor ? fullName(item.doctor) : null,
      createdAt: item.created_at,
    }));
  res.json({
    feedback: feedback.length ? feedback : publicLocalFeedback(),
    source: feedback.length ? 'database' : 'local-database',
  });
});

router.get('/me', verifyToken, (req, res) => {
  res.json({ user: publicProfile(req.user) });
});

router.post('/admin/accounts', verifyToken, requireRole('admin'), async (req, res) => {
  const validated = validateAdminAccount(req.body || {});
  if (validated.error) return res.status(400).json({ error: validated.error });

  const { firstName, middleName, lastName, phone, email, role } = validated.values;
  const temporaryPasswordExpiresAt = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString();

  if (req.user.isLocal || !supabaseAdmin) {
    let user = null;
    try {
      user = createLocalUser({
        email,
        password: TEMPORARY_PASSWORD,
        firstName,
        middleName,
        lastName,
        phone,
        role,
        mustChangePassword: true,
        temporaryPasswordExpiresAt,
      });
      const emailResult = await sendAdminCreatedAccountEmail({
        to: email,
        firstName,
        role,
        temporaryPassword: TEMPORARY_PASSWORD,
        expiresAt: temporaryPasswordExpiresAt,
      });
      if (!emailResult.sent) {
        deleteLocalUser(user.id);
        return res.status(500).json({ error: 'Unable to send the account email. Account was not created.' });
      }
      return res.status(201).json({ user: publicProfile(user), message: 'Account created and temporary password email sent.', source: 'local-database' });
    } catch (err) {
      if (user?.id) deleteLocalUser(user.id);
      if (err.code === 'duplicate') return res.status(409).json({ error: err.message });
      return res.status(500).json({ error: err.message || 'Unable to create account.' });
    }
  }

  const { data: existingProfile } = await supabaseAdmin
    .from('profiles')
    .select('id')
    .eq('email', email)
    .maybeSingle();
  if (existingProfile) return res.status(409).json({ error: 'An account already exists with this email address.' });

  const { data: authData, error: createError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password: TEMPORARY_PASSWORD,
    email_confirm: true,
    user_metadata: {
      first_name: firstName,
      middle_name: middleName,
      last_name: lastName,
      phone,
    },
  });
  if (createError) return res.status(400).json({ error: createError.message });

  const userId = authData.user.id;
  const { data: profile, error: profileError } = await supabaseAdmin.from('profiles').upsert(
    {
      id: userId,
      email,
      first_name: firstName,
      middle_name: middleName || null,
      last_name: lastName,
      phone,
      role,
      is_locked: false,
      is_active: true,
      must_change_password: true,
      temporary_password_expires_at: temporaryPasswordExpiresAt,
    },
    { onConflict: 'id' }
  ).select('id, role, first_name, middle_name, last_name, email, phone, profile_photo_url, two_factor_enabled').single();

  if (profileError) {
    await supabaseAdmin.auth.admin.deleteUser(userId);
    return res.status(400).json({ error: profileError.message });
  }

  if (role === 'patient') {
    await supabaseAdmin.from('patients').insert({ profile_id: userId, status: 'outpatient' });
  }

  const emailResult = await sendAdminCreatedAccountEmail({
    to: email,
    firstName,
    role,
    temporaryPassword: TEMPORARY_PASSWORD,
    expiresAt: temporaryPasswordExpiresAt,
  }).catch((err) => ({ sent: false, error: err.message }));

  if (!emailResult.sent) {
    await supabaseAdmin.from('patients').delete().eq('profile_id', userId);
    await supabaseAdmin.from('profiles').delete().eq('id', userId);
    await supabaseAdmin.auth.admin.deleteUser(userId);
    return res.status(500).json({ error: 'Unable to send the account email. Account was not created.' });
  }

  await supabaseAdmin.from('audit_logs').insert({
    user_id: req.user.id,
    action: 'admin_account_created',
    details: { created_user_id: userId, email, role },
    ip_address: req.ip,
  });

  res.status(201).json({ user: publicProfile(profile), message: 'Account created and temporary password email sent.', source: 'database' });
});

router.patch('/me', verifyToken, async (req, res) => {
  const firstName = String(req.body?.firstName || '').trim();
  const middleName = String(req.body?.middleName || '').trim();
  const lastName = String(req.body?.lastName || '').trim();
  const phone = String(req.body?.phone || '').trim();
  const profilePhotoUrl = String(req.body?.profilePhotoUrl || '').trim();

  if (firstName.length < 2 || lastName.length < 2) {
    return res.status(400).json({ error: 'First name and last name are required.' });
  }
  if (profilePhotoUrl && (!profilePhotoUrl.startsWith('data:image/') || profilePhotoUrl.length > 750000)) {
    return res.status(400).json({ error: 'Profile photo must be an image under 750 KB.' });
  }

  const changes = {
    first_name: firstName,
    middle_name: middleName || null,
    last_name: lastName,
    phone: phone || null,
    profile_photo_url: profilePhotoUrl || null,
  };

  if (req.user.isLocal || !supabaseAdmin) {
    const updated = updateLocalProfile(req.user.id, changes);
    if (!updated) return res.status(404).json({ error: 'Profile not found.' });
    return res.json({ user: publicProfile(updated), source: 'local-database' });
  }

  let { data, error } = await supabaseAdmin
    .from('profiles')
    .update(changes)
    .eq('id', req.user.id)
    .select('id, role, first_name, middle_name, last_name, email, phone, profile_photo_url, two_factor_enabled')
    .single();
  if (error && /profile_photo_url|schema cache|does not exist/i.test(error.message)) {
    const fallbackChanges = { ...changes };
    delete fallbackChanges.profile_photo_url;
    const fallback = await supabaseAdmin
      .from('profiles')
      .update(fallbackChanges)
      .eq('id', req.user.id)
      .select('id, role, first_name, middle_name, last_name, email, phone, two_factor_enabled')
      .single();
    data = fallback.data;
    error = fallback.error;
  }
  if (error) return res.status(400).json({ error: error.message });
  res.json({ user: publicProfile(data), source: 'database' });
});

router.post('/me/password-change/request', verifyToken, async (req, res) => {
  const newPassword = String(req.body?.newPassword || '');
  const passwordError = validationPassword(newPassword);
  if (passwordError) return res.status(400).json({ error: passwordError });

  if (req.user.isLocal || !supabaseAdmin) {
    const code = createLocalPasswordChange(req.user, newPassword);
    const emailResult = await sendPasswordChangeCodeEmail({
      to: req.user.email,
      code,
      firstName: req.user.first_name,
    }).catch((err) => ({ sent: false, error: err.message }));
    if (!emailResult.sent) {
      return res.status(500).json({ error: 'Unable to send the email code. Please check the clinic email setup.' });
    }
    createLocalNotification({
      user_id: req.user.id,
      title: 'Password change code generated',
      message: 'Use the confirmation code sent to your email to finish changing your password.',
      type: 'security',
    });
    return res.json({
      message: 'Check your email to finish changing your password.',
      source: 'local-database',
    });
  }

  const code = String(Math.floor(100000 + Math.random() * 900000));
  const expiresAt = Date.now() + 10 * 60 * 1000;
  pendingPasswordChanges.set(req.user.id, { newPassword, code, expiresAt });
  await supabaseAdmin.from('password_change_requests').upsert(
    { user_id: req.user.id, code, expires_at: new Date(expiresAt).toISOString() },
    { onConflict: 'user_id' }
  );
  const emailResult = await sendPasswordChangeCodeEmail({
    to: req.user.email,
    code,
    firstName: req.user.first_name,
  }).catch((err) => ({ sent: false, error: err.message }));
  if (!emailResult.sent) {
    return res.status(500).json({ error: 'Unable to send the email code. Please check the clinic email setup.' });
  }
  await supabaseAdmin.from('notifications').insert({
    user_id: req.user.id,
    title: 'Password change requested',
    message: 'Use the confirmation code sent to your email to finish changing your password.',
    type: 'security',
  });
  res.json({
    message: 'Check your email to finish changing your password.',
    emailSent: emailResult.sent,
    source: 'database',
  });
});

router.post('/me/password-change/confirm', verifyToken, async (req, res) => {
  const code = String(req.body?.code || '').trim();
  if (!/^\d{6}$/.test(code)) return res.status(400).json({ error: 'Enter the 6-digit confirmation code.' });

  if (req.user.isLocal || !supabaseAdmin) {
    const ok = confirmLocalPasswordChange(req.user, code);
    if (!ok) return res.status(401).json({ error: 'Invalid or expired confirmation code.' });
    return res.json({ message: 'Password changed successfully.', source: 'local-database' });
  }

  const pending = pendingPasswordChanges.get(req.user.id);
  const { data: row } = await supabaseAdmin
    .from('password_change_requests')
    .select('code, expires_at')
    .eq('user_id', req.user.id)
    .maybeSingle();

  if (!pending || !row || pending.code !== code || row.code !== code || pending.expiresAt < Date.now() || new Date(row.expires_at) < new Date()) {
    return res.status(401).json({ error: 'Invalid or expired confirmation code.' });
  }

  const { error } = await supabaseAdmin.auth.admin.updateUserById(req.user.id, { password: pending.newPassword });
  if (error) return res.status(400).json({ error: error.message });
  pendingPasswordChanges.delete(req.user.id);
  await supabaseAdmin.from('password_change_requests').delete().eq('user_id', req.user.id);
  await supabaseAdmin.from('profiles').update({ must_change_password: false, temporary_password_expires_at: null }).eq('id', req.user.id);
  await supabaseAdmin.from('audit_logs').insert({ user_id: req.user.id, action: 'password_changed', details: {}, ip_address: req.ip });
  res.json({ message: 'Password changed successfully.', source: 'database' });
});

router.get('/me/login-history', verifyToken, async (req, res) => {
  if (req.user.isLocal || !supabaseAdmin) {
    return res.json({ logins: listLocalLoginHistory(req.user), source: 'local-database' });
  }
  const { data, error } = await supabaseAdmin
    .from('login_history')
    .select('id, success, ip_address, device, created_at')
    .eq('user_id', req.user.id)
    .order('created_at', { ascending: false })
    .limit(10);
  if (error) {
    if (/login_history|schema cache|does not exist/i.test(error.message)) {
      return res.json({ logins: [], source: 'database' });
    }
    return res.status(500).json({ error: error.message });
  }
  res.json({ logins: data || [], source: 'database' });
});

router.get('/patients', verifyToken, requireRole('admin', 'doctor', 'nurse', 'staff'), async (req, res) => {
  if (!supabaseAdmin || req.user.isLocal) {
    return res.json({ patients: listLocalPatients(), source: 'local-database' });
  }

  const { data: patientRows, error } = await supabaseAdmin
    .from('patients')
    .select('id, profile_id, status, admitted_at, profiles(first_name, last_name, email, phone)')
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) return res.status(500).json({ error: error.message });

  const { data: profileRows, error: profileError } = await supabaseAdmin
    .from('profiles')
    .select('id, first_name, last_name, email, phone')
    .eq('role', 'patient')
    .order('last_name', { ascending: true })
    .limit(200);

  if (profileError) return res.status(500).json({ error: profileError.message });

  const { data: appointmentRows } = await supabaseAdmin
    .from('appointments')
    .select('patient_id, doctor_name, appointment_date, created_at')
    .order('appointment_date', { ascending: false })
    .limit(500);

  const { data: extendedPatientRows } = await supabaseAdmin
    .from('patients')
    .select('id, room, trimester, provider:profiles!patients_provider_id_fkey(first_name, last_name, email)')
    .limit(100);

  const extendedByPatientId = new Map();
  for (const row of extendedPatientRows || []) {
    extendedByPatientId.set(row.id, row);
  }

  const latestProviderByPatient = new Map();
  for (const appointment of appointmentRows || []) {
    if (!appointment.patient_id || latestProviderByPatient.has(appointment.patient_id)) continue;
    latestProviderByPatient.set(appointment.patient_id, appointment.doctor_name || null);
  }

  const patientsByProfileId = new Map();
  for (const row of patientRows || []) {
    if (row.profile_id) patientsByProfileId.set(row.profile_id, row);
  }

  const merged = (profileRows || []).map((profile) => {
    const patient = patientsByProfileId.get(profile.id);
    const extended = patient ? extendedByPatientId.get(patient.id) : null;
    return {
      id: profile.id,
      profile_id: profile.id,
      name: fullName(profile),
      email: profile.email,
      phone: profile.phone,
      status: patient?.status || 'outpatient',
      room: extended?.room || null,
      trimester: extended?.trimester || null,
      doctor: extended?.provider ? fullName(extended.provider) : latestProviderByPatient.get(profile.id) || null,
      admitted_at: patient?.admitted_at || null,
    };
  });

  for (const patient of patientRows || []) {
    if (patient.profile_id || !patient.profiles) continue;
    const extended = extendedByPatientId.get(patient.id);
    merged.push({
      id: patient.id,
      profile_id: patient.profile_id || patient.id,
      name: fullName(patient.profiles),
      email: patient.profiles?.email,
      phone: patient.profiles?.phone,
      status: patient.status || 'outpatient',
      room: extended?.room || null,
      trimester: extended?.trimester || null,
      doctor: extended?.provider ? fullName(extended.provider) : null,
      admitted_at: patient.admitted_at,
    });
  }

  res.json({
    patients: merged,
    ...empty(),
  });
});

router.get('/appointments', verifyToken, async (req, res) => {
  if (req.user.isLocal || !supabaseAdmin) {
    return res.json({ appointments: listLocalAppointments(req.user), source: 'local-database' });
  }

  let query = supabaseAdmin.from('appointments').select('*').order('appointment_date', { ascending: true });
  if (req.user.role === 'patient') query = query.eq('patient_id', req.user.id);
  if (req.user.role === 'doctor') query = query.eq('doctor_id', req.user.id);

  const { data, error } = await query.limit(100);
  if (error) {
    if (/feedback|schema cache|does not exist/i.test(error.message)) {
      return res.json({ feedback: [], source: 'database' });
    }
    return res.status(500).json({ error: error.message });
  }

  res.json({
    appointments: (data || []).map((a) => ({
      id: a.id,
      patient_name: a.patient_name || 'Patient',
      type: a.type || 'Appointment',
      date: a.appointment_date,
      status: a.status || 'pending',
      doctor: a.doctor_name || 'Unassigned',
      doctor_id: a.doctor_id,
      notes: a.notes,
    })),
    ...empty(),
  });
});

router.get('/appointments/availability', verifyToken, async (req, res) => {
  const doctorId = String(req.query?.doctorId || '').trim();
  const from = String(req.query?.from || '').trim();
  const to = String(req.query?.to || '').trim();
  const start = Number.isNaN(Date.parse(from)) ? new Date() : new Date(from);
  const end = Number.isNaN(Date.parse(to)) ? new Date(start.getTime() + 45 * 24 * 60 * 60 * 1000) : new Date(to);
  start.setHours(0, 0, 0, 0);
  end.setHours(23, 59, 59, 999);

  if (req.user.isLocal || !supabaseAdmin) {
    const unavailableDays = listLocalUnavailableDays(doctorId || null);
    const rows = listLocalAppointments({ role: 'admin' }).filter((appointment) => {
      const date = new Date(appointment.date);
      return !Number.isNaN(date.getTime())
        && date >= start
        && date <= end
        && (!doctorId || appointment.doctor_id === doctorId)
        && ['pending', 'confirmed'].includes(appointment.status);
    });
    return res.json({ appointments: rows, unavailableDays, source: 'local-database' });
  }

  let query = supabaseAdmin
    .from('appointments')
    .select('id, doctor_id, appointment_date, status')
    .gte('appointment_date', start.toISOString())
    .lte('appointment_date', end.toISOString())
    .in('status', ['pending', 'confirmed']);
  if (doctorId) query = query.eq('doctor_id', doctorId);
  const [{ data, error }, unavailableResult] = await Promise.all([
    query.limit(500),
    supabaseAdmin
      .from('doctor_unavailable_days')
      .select('doctor_id, unavailable_date')
      .gte('unavailable_date', start.toISOString().slice(0, 10))
      .lte('unavailable_date', end.toISOString().slice(0, 10))
      .then((result) => result, () => ({ data: [], error: null })),
  ]);
  if (error) return res.status(500).json({ error: error.message });
  res.json({
    appointments: (data || []).map((item) => ({
      id: item.id,
      doctor_id: item.doctor_id,
      date: item.appointment_date,
      status: item.status,
    })),
    unavailableDays: (unavailableResult.data || [])
      .filter((item) => !doctorId || item.doctor_id === doctorId)
      .map((item) => ({ doctor_id: item.doctor_id, date: item.unavailable_date })),
    source: 'database',
  });
});

router.patch('/doctor/unavailable-days', verifyToken, requireRole('doctor'), async (req, res) => {
  const date = String(req.body?.date || '').slice(0, 10);
  const unavailable = req.body?.unavailable === true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: 'Choose a valid calendar date.' });

  if (req.user.isLocal || !supabaseAdmin) {
    const result = setLocalUnavailableDay(req.user, date, unavailable);
    return res.json({ day: result, source: 'local-database' });
  }

  if (unavailable) {
    const { data, error } = await supabaseAdmin
      .from('doctor_unavailable_days')
      .upsert({ doctor_id: req.user.id, unavailable_date: date }, { onConflict: 'doctor_id,unavailable_date' })
      .select()
      .single();
    if (error) return res.status(400).json({ error: error.message });
    return res.json({ day: data, source: 'database' });
  }

  const { error } = await supabaseAdmin
    .from('doctor_unavailable_days')
    .delete()
    .eq('doctor_id', req.user.id)
    .eq('unavailable_date', date);
  if (error) return res.status(400).json({ error: error.message });
  res.json({ day: { doctor_id: req.user.id, date, unavailable: false }, source: 'database' });
});

router.post('/appointments', verifyToken, async (req, res) => {
  const type = String(req.body?.type || '').trim();
  const date = String(req.body?.date || '').trim();
  const notes = String(req.body?.notes || '').trim();
  const doctorId = String(req.body?.doctorId || '').trim() || null;
  const doctorName = String(req.body?.doctorName || '').trim() || null;

  if (!type || !date) return res.status(400).json({ error: 'Type and date are required.' });
  if (Number.isNaN(Date.parse(date))) return res.status(400).json({ error: 'Enter a valid appointment date.' });
  if (new Date(date) < new Date()) return res.status(400).json({ error: 'Appointment date must be in the future.' });

  if (req.user.isLocal || !supabaseAdmin) {
    if (doctorId && listLocalUnavailableDays(doctorId).some((item) => item.date === dateKey(date))) {
      return res.status(409).json({
        error: 'This doctor is unavailable on that date. Please choose another day.',
        slotTaken: true,
      });
    }
    try {
      const appointment = createLocalAppointment(req.user, { type, date, notes, doctorId, doctorName });
      return res.status(201).json({ appointment, source: 'local-database' });
    } catch (err) {
      if (err.code === 'slot_taken') {
        return res.status(409).json({
          error: 'This slot is already taken. Please choose another.',
          slotTaken: true,
        });
      }
      return res.status(500).json({ error: err.message || 'Unable to book appointment.' });
    }
  }

  const slot = normalizeSlot(date);
  if (doctorId) {
    const unavailable = await supabaseAdmin
      .from('doctor_unavailable_days')
      .select('id')
      .eq('doctor_id', doctorId)
      .eq('unavailable_date', dateKey(date))
      .maybeSingle();
    if (unavailable.data) {
      return res.status(409).json({
        error: 'This doctor is unavailable on that date. Please choose another day.',
        slotTaken: true,
      });
    }
    const { data: confirmed, error: conflictReadError } = await supabaseAdmin
      .from('appointments')
      .select('id, appointment_date')
      .eq('doctor_id', doctorId)
      .in('status', ['pending', 'confirmed']);
    if (conflictReadError) return res.status(500).json({ error: conflictReadError.message });
    const conflict = (confirmed || []).find((item) => normalizeSlot(item.appointment_date) === slot);
    if (conflict) {
      return res.status(409).json({
        error: 'This slot is already taken. Please choose another.',
        slotTaken: true,
      });
    }
  }

  const { data, error } = await supabaseAdmin
    .from('appointments')
    .insert({
      patient_id: req.user.id,
      appointment_date: date,
      type,
      notes: notes || null,
      status: 'pending',
      patient_name: fullName(req.user),
      doctor_id: doctorId,
      doctor_name: doctorName || 'Unassigned',
    })
    .select()
    .single();

  if (error) {
    if (error.code === '23505') {
      return res.status(409).json({
        error: 'This slot is already taken. Please choose another.',
        slotTaken: true,
      });
    }
    return res.status(400).json({ error: error.message });
  }

  const notificationTargets = [];
  if (doctorId) {
    notificationTargets.push(doctorId);
  } else {
    const { data: admins } = await supabaseAdmin.from('profiles').select('id, email, first_name, last_name').eq('role', 'admin');
    notificationTargets.push(...(admins || []).map((admin) => admin.id));
    for (const admin of admins || []) {
      await sendAppointmentRequestEmail({
        to: admin.email,
        recipientName: fullName(admin),
        appointment: { ...data, date, patient_name: fullName(req.user), type },
      });
    }
  }

  if (doctorId) {
    const { data: doctor } = await supabaseAdmin.from('profiles').select('id, email, first_name, last_name').eq('id', doctorId).maybeSingle();
    if (doctor) {
      await sendAppointmentRequestEmail({
        to: doctor.email,
        recipientName: fullName(doctor),
        appointment: { ...data, date, patient_name: fullName(req.user), type },
      });
    }
  }

  if (notificationTargets.length) {
    await supabaseAdmin.from('notifications').insert(notificationTargets.map((userId) => ({
      user_id: userId,
      title: 'New appointment request',
      message: `${fullName(req.user)} requested ${type} on ${new Date(date).toLocaleString()}.`,
    })));
  }

  res.status(201).json({ appointment: data, source: 'database' });
});

router.get('/waitlist', verifyToken, async (req, res) => {
  if (req.user.isLocal || !supabaseAdmin) {
    return res.json({ waitlist: listLocalWaitlist(req.user), source: 'local-database' });
  }

  let query = supabaseAdmin
    .from('waitlist')
    .select('*, patient:profiles!waitlist_patient_id_fkey(first_name, last_name, email), doctor:profiles!waitlist_doctor_id_fkey(first_name, last_name, email)')
    .order('created_at', { ascending: true });
  if (req.user.role === 'patient') query = query.eq('patient_id', req.user.id);
  if (req.user.role === 'doctor') query = query.eq('doctor_id', req.user.id);

  const { data, error } = await query.limit(100);
  if (error) {
    if (/waitlist|schema cache|does not exist/i.test(error.message)) {
      return res.json({ waitlist: [], source: 'database' });
    }
    return res.status(500).json({ error: error.message });
  }
  res.json({
    waitlist: (data || []).map((item) => ({
      id: item.id,
      patient_name: fullName(item.patient),
      doctor: item.doctor ? fullName(item.doctor) : 'Unassigned',
      doctor_id: item.doctor_id,
      type: item.type,
      date: item.appointment_time,
      status: item.status,
      notes: item.notes,
      created_at: item.created_at,
    })),
    source: 'database',
  });
});

router.get('/doctors', verifyToken, async (req, res) => {
  if (req.user.isLocal || !supabaseAdmin) return res.json({ doctors: listLocalDoctors(), source: 'local-database' });

  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select('id, first_name, last_name, email')
    .eq('role', 'doctor')
    .eq('is_active', true)
    .order('last_name', { ascending: true });

  if (error) return res.status(500).json({ error: error.message });
  res.json({
    doctors: (data || []).map((doctor) => ({ id: doctor.id, name: fullName(doctor), email: doctor.email })),
    source: 'database',
  });
});

router.patch('/appointments/:id/status', verifyToken, requireRole('admin', 'doctor'), async (req, res) => {
  const appointmentId = req.params.id;
  const status = String(req.body?.status || '').trim();
  const reason = String(req.body?.reason || '').trim();

  if (!['confirmed', 'denied'].includes(status)) {
    return res.status(400).json({ error: 'Status must be confirmed or denied.' });
  }
  if (status === 'denied' && reason.length < 5) {
    return res.status(400).json({ error: 'A clear denial reason is required.' });
  }

  if (req.user.isLocal || !supabaseAdmin) {
    try {
      const appointment = updateLocalAppointmentStatus({ appointmentId, status, reason, actor: req.user });
      if (!appointment) return res.status(404).json({ error: 'Appointment not found.' });
      await sendAppointmentEmail({
        to: appointment.patient_email,
        patientName: appointment.patient_name,
        status,
        appointment,
        reason,
      });
      return res.json({ appointment, source: 'local-database' });
    } catch (err) {
      return res.status(err.code === 'slot_conflict' ? 409 : 500).json({ error: err.message });
    }
  }

  const { data: appointment, error: readError } = await supabaseAdmin
    .from('appointments')
    .select('*, profiles!appointments_patient_id_fkey(email, first_name, last_name)')
    .eq('id', appointmentId)
    .single();

  if (readError || !appointment) return res.status(404).json({ error: 'Appointment not found.' });

  if (status === 'confirmed' && appointment.doctor_id) {
    const slot = normalizeSlot(appointment.appointment_date);
    const { data: sameDoctor, error: conflictError } = await supabaseAdmin
      .from('appointments')
      .select('id, appointment_date')
      .eq('doctor_id', appointment.doctor_id)
      .eq('status', 'confirmed');

    if (conflictError) return res.status(500).json({ error: conflictError.message });
    const conflict = (sameDoctor || []).find((item) => item.id !== appointment.id && normalizeSlot(item.appointment_date) === slot);
    if (conflict) {
      return res.status(409).json({ error: 'This slot is already taken. Please choose another.', slotTaken: true });
    }
  }

  const updateNotes = status === 'denied'
    ? [appointment.notes, `Denied reason: ${reason}`].filter(Boolean).join('\n')
    : appointment.notes;

  const { data: updated, error: updateError } = await supabaseAdmin
    .from('appointments')
    .update({ status, notes: updateNotes })
    .eq('id', appointmentId)
    .select()
    .single();

  if (updateError) {
    if (updateError.code === '23505') {
      return res.status(409).json({ error: 'This slot is already taken. Please choose another.', slotTaken: true });
    }
    return res.status(400).json({ error: updateError.message });
  }

  await supabaseAdmin.from('notifications').insert({
    user_id: appointment.patient_id,
    title: status === 'confirmed' ? 'Appointment approved' : 'Appointment cancelled',
    message: status === 'confirmed'
      ? `Your ${appointment.type || 'appointment'} appointment was approved.`
      : `Your ${appointment.type || 'appointment'} appointment was cancelled. Reason: ${reason}`,
    type: 'appointment',
  });

  await sendAppointmentEmail({
    to: appointment.profiles?.email,
    patientName: fullName(appointment.profiles),
    status,
    appointment: { ...appointment, date: appointment.appointment_date },
    reason,
  });

  res.json({ appointment: updated, source: 'database' });
});

router.get('/notifications', verifyToken, async (req, res) => {
  if (req.user.isLocal || !supabaseAdmin) {
    const notifications = listLocalNotifications(req.user);
    return res.json({
      notifications,
      unread: notifications.filter((item) => !item.is_read).length,
      source: 'local-database',
    });
  }

  const { data, error } = await supabaseAdmin
    .from('notifications')
    .select('*')
    .eq('user_id', req.user.id)
    .order('created_at', { ascending: false })
    .limit(20);

  if (error) return res.status(500).json({ error: error.message });
  res.json({
    notifications: (data || []).map((item) => ({
      ...item,
      section: item.section || sectionForNotification(item.type),
    })),
    unread: (data || []).filter((item) => !item.is_read).length,
    source: 'database',
  });
});

router.patch('/notifications/:id/read', verifyToken, async (req, res) => {
  if (req.user.isLocal || !supabaseAdmin) {
    const notification = markLocalNotificationRead(req.user, req.params.id);
    if (!notification) return res.status(404).json({ error: 'Notification not found.' });
    return res.json({ notification, source: 'local-database' });
  }

  const { data, error } = await supabaseAdmin
    .from('notifications')
    .update({ is_read: true })
    .eq('id', req.params.id)
    .eq('user_id', req.user.id)
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });
  res.json({ notification: data, source: 'database' });
});

router.get('/patient/summary', verifyToken, async (req, res) => {
  if (req.user.role !== 'patient') return res.status(403).json({ error: 'Patient summary is only available to patients.' });
  if (!supabaseAdmin || req.user.isLocal) {
    return res.json({ pregnancy: null, tips: [], source: 'database' });
  }

  const { data, error } = await supabaseAdmin
    .from('medical_records')
    .select('record_type, diagnosis, treatment, created_at')
    .eq('patient_id', req.user.id)
    .order('created_at', { ascending: false })
    .limit(20);

  if (error) return res.status(500).json({ error: error.message });

  const records = data || [];
  const pregnancyRecord = records.find((record) => /pregnan|prenatal|trimester|gestation|due date/i.test(`${record.record_type} ${record.diagnosis} ${record.treatment}`));
  if (!pregnancyRecord) {
    return res.json({ pregnancy: null, tips: [], source: 'database' });
  }

  const text = `${pregnancyRecord.diagnosis || ''} ${pregnancyRecord.treatment || ''}`;
  const dueDateMatch = text.match(/due date[:\s]+([A-Za-z0-9,\-\s]+)/i);
  const trimesterMatch = text.match(/(first|second|third|1st|2nd|3rd)\s+trimester/i);
  const cycleMatch = text.match(/cycle[:\s]+([A-Za-z0-9,\-\s]+)/i);

  res.json({
    pregnancy: {
      dueDate: dueDateMatch?.[1]?.trim() || null,
      trimester: trimesterMatch?.[0] || null,
      cycle: cycleMatch?.[1]?.trim() || null,
      diagnosis: pregnancyRecord.diagnosis,
      treatment: pregnancyRecord.treatment,
      lastUpdated: pregnancyRecord.created_at,
    },
    tips: [
      'Follow the care plan approved by your doctor.',
      'Contact the clinic promptly for bleeding, severe headache, fever, or reduced fetal movement.',
      'Bring previous lab results and medications to your next appointment.',
    ],
    source: 'database',
  });
});

router.get('/records', verifyToken, async (req, res) => {
  if (!supabaseAdmin || req.user.isLocal) {
    return res.json({ records: listLocalMedicalRecords(req.user), source: 'local-database' });
  }

  let query = supabaseAdmin
    .from('medical_records')
    .select('*, patient:profiles!medical_records_patient_id_fkey(first_name, last_name, email), provider:profiles!medical_records_created_by_fkey(first_name, last_name, email)')
    .order('created_at', { ascending: false });
  if (req.user.role === 'patient') query = query.eq('patient_id', req.user.id);

  const { data, error } = await query.limit(100);
  if (error) {
    if (/feedback|schema cache|does not exist/i.test(error.message)) {
      return res.json({ feedback: [], source: 'database' });
    }
    return res.status(500).json({ error: error.message });
  }

  res.json({
    records: (data || []).map((r) => ({
      id: r.id,
      patient_name: fullName(r.patient),
      type: r.record_type,
      diagnosis: r.diagnosis,
      treatment: r.treatment,
      file_name: r.file_name,
      file_data: r.file_data,
      date: r.created_at,
      provider: fullName(r.provider),
    })),
    ...empty(),
  });
});

router.post('/records', verifyToken, requireRole('doctor'), async (req, res) => {
  const patientId = String(req.body?.patientId || '').trim();
  const recordType = String(req.body?.recordType || 'Medical Result').trim();
  const diagnosis = String(req.body?.diagnosis || 'Medical Result').trim();
  const treatment = String(req.body?.treatment || '').trim();
  const fileName = String(req.body?.fileName || '').trim();
  const fileData = String(req.body?.fileData || '').trim();

  if (!patientId) return res.status(400).json({ error: 'Please choose a patient.' });
  if (fileData && (!fileData.startsWith('data:application/pdf') || fileData.length > 8 * 1024 * 1024)) {
    return res.status(400).json({ error: 'Upload a PDF file smaller than 8 MB.' });
  }

  if (!supabaseAdmin || req.user.isLocal) {
    try {
      const record = createLocalMedicalRecord(req.user, { patientId, recordType, diagnosis, treatment, fileName, fileData });
      return res.status(201).json({ record, source: 'local-database' });
    } catch (err) {
      return res.status(err.code === 'patient_not_found' ? 404 : 500).json({ error: err.message || 'Unable to save medical result.' });
    }
  }

  const payload = {
    patient_id: patientId,
    record_type: recordType,
    diagnosis,
    treatment: treatment || null,
    created_by: req.user.id,
    file_name: fileName || null,
    file_data: fileData || null,
  };
  let { data, error } = await supabaseAdmin.from('medical_records').insert(payload).select().single();
  if (error && /file_name|file_data|schema cache|does not exist/i.test(error.message)) {
    const fallback = { ...payload };
    delete fallback.file_name;
    delete fallback.file_data;
    const fallbackResult = await supabaseAdmin.from('medical_records').insert(fallback).select().single();
    data = fallbackResult.data;
    error = fallbackResult.error;
  }
  if (error) return res.status(400).json({ error: error.message });

  await supabaseAdmin.from('notifications').insert({
    user_id: patientId,
    title: 'New medical result',
    message: `${fullName(req.user)} added a medical result to your portal.`,
    type: 'document',
  });
  res.status(201).json({ record: data, source: 'database' });
});

router.get('/lab', verifyToken, async (req, res) => {
  if (!supabaseAdmin || req.user.isLocal) return databaseUnavailable(res, { results: [] });

  let query = supabaseAdmin
    .from('lab_results')
    .select('*, patient:profiles!lab_results_patient_id_fkey(first_name, last_name, email)')
    .order('created_at', { ascending: false });
  if (req.user.role === 'patient') query = query.eq('patient_id', req.user.id);

  const { data, error } = await query.limit(100);
  if (error) return res.status(500).json({ error: error.message });

  res.json({
    results: (data || []).map((l) => ({
      id: l.id,
      patient_name: fullName(l.patient),
      test_name: l.test_name,
      status: l.status || 'pending',
      result: l.result,
      date: l.created_at,
    })),
    ...empty(),
  });
});

router.get('/staff', verifyToken, requireRole('admin', 'staff'), async (req, res) => {
  if (!supabaseAdmin || req.user.isLocal) return res.json({ staff: listLocalStaff(), source: 'local-database' });

  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select('id, first_name, last_name, role, is_active, staff_schedules(shift_date, shift_type, department)')
    .in('role', ['doctor', 'nurse', 'staff', 'admin'])
    .order('last_name', { ascending: true });

  if (error) return res.status(500).json({ error: error.message });

  res.json({
    staff: (data || []).map((s) => {
      const schedule = s.staff_schedules?.[0];
      return {
        id: s.id,
        name: fullName(s),
        role: s.role,
        department: schedule?.department || null,
        shift: schedule?.shift_type || null,
        status: s.is_active ? 'active' : 'inactive',
      };
    }),
    ...empty(),
  });
});

router.get('/messages', verifyToken, async (req, res) => {
  const peerId = String(req.query?.peerId || '').trim();
  if (!supabaseAdmin || req.user.isLocal) {
    return res.json({ messages: listLocalMessages(req.user, peerId), source: 'local-database' });
  }

  let query = supabaseAdmin
    .from('messages')
    .select('*, sender:profiles!messages_sender_id_fkey(first_name, last_name, email), recipient:profiles!messages_recipient_id_fkey(first_name, last_name, email)')
    .order('created_at', { ascending: false });
  query = query.or(`sender_id.eq.${req.user.id},recipient_id.eq.${req.user.id}`);

  const { data, error } = await query.limit(100);
  if (error) return res.status(500).json({ error: error.message });

  let rows = data || [];
  if (peerId) rows = rows.filter((m) => m.sender_id === peerId || m.recipient_id === peerId);
  res.json({
    messages: rows.reverse().map((m) => ({
      id: m.id,
      sender_id: m.sender_id,
      recipient_id: m.recipient_id,
      sender_name: fullName(m.sender),
      recipient_name: fullName(m.recipient),
      from: fullName(m.sender),
      subject: m.subject,
      body: m.body,
      created_at: m.created_at,
      is_read: m.is_read,
    })),
    ...empty(),
  });
});

router.get('/messages/contacts', verifyToken, async (req, res) => {
  if (!supabaseAdmin || req.user.isLocal) {
    return res.json({ contacts: listLocalUsersForMessages(req.user), source: 'local-database' });
  }
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select('id, first_name, last_name, email, role')
    .neq('id', req.user.id)
    .eq('is_active', true)
    .order('last_name', { ascending: true });
  if (error) return res.status(500).json({ error: error.message });
  res.json({
    contacts: (data || []).map((item) => ({
      id: item.id,
      name: fullName(item),
      email: item.email,
      role: item.role,
    })),
    source: 'database',
  });
});

router.post('/messages', verifyToken, async (req, res) => {
  const recipientId = String(req.body?.recipientId || '').trim();
  const body = String(req.body?.body || '').trim();
  if (!recipientId) return res.status(400).json({ error: 'Choose who to message.' });
  if (body.length < 1) return res.status(400).json({ error: 'Write a message first.' });
  if (body.length > 2000) return res.status(400).json({ error: 'Message is too long.' });

  if (!supabaseAdmin || req.user.isLocal) {
    try {
      const message = createLocalMessage(req.user, { recipientId, body });
      return res.status(201).json({ message, source: 'local-database' });
    } catch (err) {
      return res.status(err.code === 'recipient_not_found' ? 404 : 500).json({ error: err.message || 'Unable to send message.' });
    }
  }

  const { data, error } = await supabaseAdmin
    .from('messages')
    .insert({
      sender_id: req.user.id,
      recipient_id: recipientId,
      subject: 'Message',
      body,
      is_read: false,
    })
    .select()
    .single();
  if (error) return res.status(400).json({ error: error.message });

  await supabaseAdmin.from('notifications').insert({
    user_id: recipientId,
    title: `New message from ${fullName(req.user)}`,
    message: body.length > 90 ? `${body.slice(0, 87)}...` : body,
    type: 'message',
    section: 'messages',
    target_id: req.user.id,
  }).then(() => null, () => null);

  res.status(201).json({ message: data, source: 'database' });
});

router.delete('/messages/:id', verifyToken, async (req, res) => {
  const messageId = String(req.params.id || '').trim();
  if (!messageId) return res.status(400).json({ error: 'Message not found.' });

  if (!supabaseAdmin || req.user.isLocal) {
    const deleted = deleteLocalMessage(req.user, messageId);
    if (!deleted) return res.status(404).json({ error: 'Message not found.' });
    return res.json({ message: 'Message deleted.', source: 'local-database' });
  }

  const { error } = await supabaseAdmin
    .from('messages')
    .delete()
    .eq('id', messageId)
    .or(`sender_id.eq.${req.user.id},recipient_id.eq.${req.user.id}`);
  if (error) return res.status(400).json({ error: error.message });
  res.json({ message: 'Message deleted.', source: 'database' });
});

router.get('/medications', verifyToken, async (req, res) => {
  if (!supabaseAdmin || req.user.isLocal) return databaseUnavailable(res, { medications: [] });

  let query = supabaseAdmin
    .from('medications')
    .select('*, patient:profiles!medications_patient_id_fkey(first_name, last_name, email)')
    .order('created_at', { ascending: false });
  if (req.user.role === 'patient') query = query.eq('patient_id', req.user.id);

  const { data, error } = await query.limit(100);
  if (error) return res.status(500).json({ error: error.message });

  res.json({
    medications: (data || []).map((m) => ({
      id: m.id,
      name: m.name,
      dosage: [m.dosage, m.frequency].filter(Boolean).join(', '),
      patient_name: fullName(m.patient),
      status: m.status || 'active',
    })),
    ...empty(),
  });
});

router.get('/feedback', verifyToken, async (req, res) => {
  if (!supabaseAdmin || req.user.isLocal) {
    return res.json({ feedback: listLocalFeedback(req.user), source: 'local-database' });
  }
  let query = supabaseAdmin
    .from('feedback')
    .select('*, patient:profiles!feedback_patient_id_fkey(first_name, last_name, email), doctor:profiles!feedback_doctor_id_fkey(first_name, last_name, email)')
    .order('created_at', { ascending: false });
  if (req.user.role === 'patient') query = query.eq('patient_id', req.user.id);
  const { data, error } = await query.limit(100);
  if (error) return res.status(500).json({ error: error.message });
  res.json({
    feedback: (data || []).map((item) => ({
      id: item.id,
      patient_name: fullName(item.patient),
      doctor_name: item.doctor ? fullName(item.doctor) : null,
      rating: item.rating,
      comment: item.comment,
      is_public: item.is_public,
      is_approved: item.is_approved,
      created_at: item.created_at,
    })),
    source: 'database',
  });
});

router.post('/feedback', verifyToken, requireRole('patient'), async (req, res) => {
  const rating = Number(req.body?.rating);
  const comment = String(req.body?.comment || '').trim();
  const doctorId = String(req.body?.doctorId || '').trim() || null;
  const isPublic = req.body?.isPublic === true;
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return res.status(400).json({ error: 'Rating must be 1 to 5.' });
  if (comment.length < 10) return res.status(400).json({ error: 'Please write at least 10 characters.' });

  if (!supabaseAdmin || req.user.isLocal) {
    const feedback = createLocalFeedback(req.user, { rating, comment, doctorId, isPublic });
    return res.status(201).json({ feedback, source: 'local-database' });
  }

  const { data, error } = await supabaseAdmin
    .from('feedback')
    .insert({
      patient_id: req.user.id,
      doctor_id: doctorId,
      rating,
      comment,
      is_public: isPublic,
      is_approved: true,
    })
    .select()
    .single();
  if (error) return res.status(400).json({ error: error.message });
  res.status(201).json({ feedback: data, source: 'database' });
});

router.patch('/feedback/:id/approval', verifyToken, requireRole('admin'), async (req, res) => {
  const isApproved = req.body?.isApproved === true;
  if (!supabaseAdmin || req.user.isLocal) {
    const feedback = updateLocalFeedbackApproval(req.params.id, isApproved);
    if (!feedback) return res.status(404).json({ error: 'Feedback not found.' });
    return res.json({ feedback, source: 'local-database' });
  }
  const { data, error } = await supabaseAdmin
    .from('feedback')
    .update({ is_approved: isApproved })
    .eq('id', req.params.id)
    .select()
    .single();
  if (error) return res.status(400).json({ error: error.message });
  res.json({ feedback: data, source: 'database' });
});

router.get('/deliveries', verifyToken, requireRole('admin', 'doctor', 'nurse', 'staff'), async (req, res) => {
  if (!supabaseAdmin) return databaseUnavailable(res, { deliveries: [] });

  const { data, error } = await supabaseAdmin
    .from('deliveries')
    .select('*, patient:profiles!deliveries_patient_id_fkey(first_name, last_name, email)')
    .order('delivery_date', { ascending: false })
    .limit(100);

  if (error) return res.status(500).json({ error: error.message });

  res.json({
    deliveries: (data || []).map((d) => ({
      id: d.id,
      patient_name: fullName(d.patient),
      date: d.delivery_date,
      type: d.delivery_type,
      status: d.notes || 'recorded',
    })),
    ...empty(),
  });
});

router.get('/reports/summary', verifyToken, requireRole('admin', 'doctor', 'staff'), async (req, res) => {
  if (!supabaseAdmin) {
    return databaseUnavailable(res, {
      monthlyVisits: [],
      deliveryTypes: { normal: 0, cesarean: 0, assisted: 0 },
      satisfaction: 0,
      occupancy: 0,
    });
  }

  const [appointments, admitted, patients, deliveries, feedback] = await Promise.all([
    supabaseAdmin.from('appointments').select('id, appointment_date', { count: 'exact' }).limit(1000),
    supabaseAdmin.from('patients').select('id', { count: 'exact', head: true }).eq('status', 'admitted'),
    supabaseAdmin.from('patients').select('id', { count: 'exact', head: true }),
    supabaseAdmin.from('deliveries').select('delivery_type', { count: 'exact' }).limit(1000),
    supabaseAdmin.from('feedback').select('rating').eq('is_approved', true).limit(1000),
  ]);

  const monthlyMap = new Map();
  for (const appointment of appointments.data || []) {
    const date = new Date(appointment.appointment_date);
    if (!Number.isNaN(date.getTime())) {
      const key = date.toLocaleString('en', { month: 'short' });
      monthlyMap.set(key, (monthlyMap.get(key) || 0) + 1);
    }
  }

  const deliveryCounts = { normal: 0, cesarean: 0, assisted: 0 };
  for (const delivery of deliveries.data || []) {
    const type = String(delivery.delivery_type || '').toLowerCase();
    if (type.includes('cesarean') || type.includes('c-section')) deliveryCounts.cesarean += 1;
    else if (type.includes('assist')) deliveryCounts.assisted += 1;
    else deliveryCounts.normal += 1;
  }

  const totalPatients = patients.count || 0;
  const admittedPatients = admitted.count || 0;
  const ratings = feedback.data || [];
  const avgRating = ratings.length ? ratings.reduce((sum, item) => sum + Number(item.rating || 0), 0) / ratings.length : 0;

  res.json({
    monthlyVisits: Array.from(monthlyMap.values()),
    monthlyLabels: Array.from(monthlyMap.keys()),
    deliveryTypes: deliveryCounts,
    satisfaction: avgRating ? Math.round((avgRating / 5) * 100) : 0,
    occupancy: totalPatients ? Math.round((admittedPatients / totalPatients) * 100) : 0,
    source: 'database',
  });
});

module.exports = router;
