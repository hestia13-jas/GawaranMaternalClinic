const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const STORE_PATH = path.join(DATA_DIR, 'local-users.json');
const SESSION_HOURS = 12;

function emptyStore() {
  return { users: [], sessions: [], appointments: [], notifications: [], waitlist: [], loginHistory: [], feedback: [], passwordChanges: [], medicalRecords: [], messages: [], unavailableDays: [] };
}

function readStore() {
  try {
    if (!fs.existsSync(STORE_PATH)) return emptyStore();
    return { ...emptyStore(), ...JSON.parse(fs.readFileSync(STORE_PATH, 'utf8')) };
  } catch {
    return emptyStore();
  }
}

function writeStore(store) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2));
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.pbkdf2Sync(password, salt, 120000, 32, 'sha256').toString('hex');
  return { salt, hash };
}

function safeEqual(a, b) {
  const left = Buffer.from(a || '', 'hex');
  const right = Buffer.from(b || '', 'hex');
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function findLocalUserByEmail(email) {
  const store = readStore();
  return store.users.find((user) => user.email === normalizeEmail(email)) || null;
}

function createLocalUser({ email, password, firstName, middleName, lastName, phone, role = 'patient', mustChangePassword = false, temporaryPasswordExpiresAt = null }) {
  const store = readStore();
  const cleanEmail = normalizeEmail(email);
  if (store.users.some((user) => user.email === cleanEmail)) {
    const err = new Error('An account already exists with this email address.');
    err.code = 'duplicate';
    throw err;
  }

  const passwordHash = hashPassword(password);
  const user = {
    id: crypto.randomUUID(),
    email: cleanEmail,
    passwordHash,
    first_name: firstName,
    middle_name: middleName || null,
    last_name: lastName,
    phone,
    role,
    is_locked: false,
    two_factor_enabled: false,
    must_change_password: !!mustChangePassword,
    temporary_password_expires_at: temporaryPasswordExpiresAt,
    created_at: new Date().toISOString(),
  };

  store.users.push(user);
  writeStore(store);
  return user;
}

function deleteLocalUser(userId) {
  const store = readStore();
  const before = store.users.length;
  store.users = store.users.filter((user) => user.id !== userId);
  store.sessions = (store.sessions || []).filter((session) => session.user_id !== userId);
  writeStore(store);
  return store.users.length < before;
}

function createLocalSession(user) {
  const store = readStore();
  const rawToken = crypto.randomBytes(32).toString('base64url');
  const expiresAt = Date.now() + SESSION_HOURS * 60 * 60 * 1000;
  store.sessions = store.sessions.filter((session) => session.expires_at > Date.now());
  store.sessions.push({ token: rawToken, user_id: user.id, expires_at: expiresAt });
  writeStore(store);

  return {
    access_token: `local:${rawToken}`,
    token_type: 'bearer',
    expires_in: SESSION_HOURS * 60 * 60,
    expires_at: Math.floor(expiresAt / 1000),
    user: { id: user.id, email: user.email },
  };
}

function createLocalAppointment(user, { type, date, notes, doctorId, doctorName }) {
  const store = readStore();
  const conflict = localAppointmentConflict({ appointmentId: null, doctorId, date });
  if (conflict) {
    const err = new Error('This slot is already taken. Please choose another.');
    err.code = 'slot_taken';
    throw err;
  }
  const appointment = {
    id: crypto.randomUUID(),
    patient_id: user.id,
    patient_name: `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.email,
    patient_email: user.email,
    type,
    date,
    notes: notes || null,
    status: 'pending',
    doctor_id: doctorId || null,
    doctor: doctorName || 'Unassigned',
    decision_reason: null,
    decided_by: null,
    decided_at: null,
    created_at: new Date().toISOString(),
  };
  store.appointments.push(appointment);
  createLocalNotificationRecord(store, {
    user_id: user.id,
    title: 'Appointment request submitted',
    message: `Your ${type} request for ${new Date(date).toLocaleString()} is pending review.`,
    type: 'appointment',
    section: 'appointments',
    target_id: appointment.id,
  });
  if (doctorId) {
    createLocalNotificationRecord(store, {
      user_id: doctorId,
      title: 'New appointment request',
      message: `${appointment.patient_name} requested ${type} on ${new Date(date).toLocaleString()}.`,
      type: 'appointment',
      section: 'appointments',
      target_id: appointment.id,
    });
  } else {
    (store.users || [])
      .filter((item) => ['admin', 'doctor'].includes(item.role))
      .forEach((recipient) => {
        createLocalNotificationRecord(store, {
          user_id: recipient.id,
          title: 'New appointment request',
          message: `${appointment.patient_name} requested ${type} on ${new Date(date).toLocaleString()}.`,
          type: 'appointment',
          section: 'appointments',
          target_id: appointment.id,
        });
      });
  }
  writeStore(store);
  return appointment;
}

function createLocalWaitlist(user, { type, date, notes, doctorId, doctorName }) {
  const store = readStore();
  const item = {
    id: crypto.randomUUID(),
    patient_id: user.id,
    patient_name: `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.email,
    patient_email: user.email,
    type,
    date,
    notes: notes || null,
    status: 'waiting',
    doctor_id: doctorId || null,
    doctor: doctorName || 'Unassigned',
    created_at: new Date().toISOString(),
  };
  store.waitlist = store.waitlist || [];
  store.waitlist.push(item);
  createLocalNotificationRecord(store, {
    user_id: user.id,
    title: 'Added to waitlist',
    message: `You were added to the waitlist for ${new Date(date).toLocaleString()}.`,
    type: 'appointment',
    section: 'appointments',
    target_id: item.id,
  });
  writeStore(store);
  return item;
}

function listLocalWaitlist(user) {
  const store = readStore();
  const rows = store.waitlist || [];
  if (user.role === 'patient') return rows.filter((item) => item.patient_id === user.id);
  return rows;
}

function createLocalFeedback(user, { rating, comment, doctorId, isPublic }) {
  const store = readStore();
  const feedback = {
    id: crypto.randomUUID(),
    patient_id: user.id,
    patient_name: `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.email,
    doctor_id: doctorId || null,
    doctor_name: doctorId
      ? listLocalDoctors().find((doctor) => doctor.id === doctorId)?.name || null
      : null,
    rating,
    comment,
    is_public: !!isPublic,
    is_approved: true,
    created_at: new Date().toISOString(),
  };
  store.feedback = store.feedback || [];
  store.feedback.unshift(feedback);
  writeStore(store);
  return feedback;
}

function listLocalFeedback(user, { publicOnly = false } = {}) {
  const store = readStore();
  let rows = store.feedback || [];
  if (publicOnly) rows = rows.filter((item) => item.is_public && item.is_approved !== false);
  else if (user?.role === 'patient') rows = rows.filter((item) => item.patient_id === user.id);
  return rows.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}

function updateLocalFeedbackApproval(feedbackId, isApproved) {
  const store = readStore();
  const feedback = (store.feedback || []).find((item) => item.id === feedbackId);
  if (!feedback) return null;
  feedback.is_approved = !!isApproved;
  feedback.updated_at = new Date().toISOString();
  writeStore(store);
  return feedback;
}

function listLocalAppointments(user) {
  const store = readStore();
  const rows = store.appointments || [];
  if (user.role === 'patient') {
    return rows.filter((appointment) => appointment.patient_id === user.id);
  }
  if (user.role === 'doctor') {
    return rows.filter((appointment) => appointment.doctor_id === user.id || !appointment.doctor_id);
  }
  return rows;
}

function normalizeSlot(date) {
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return '';
  parsed.setSeconds(0, 0);
  return parsed.toISOString();
}

function localAppointmentConflict({ appointmentId, doctorId, date }) {
  if (!doctorId) return null;
  const slot = normalizeSlot(date);
  const store = readStore();
  return (store.appointments || []).find((appointment) => (
    appointment.id !== appointmentId &&
    appointment.doctor_id === doctorId &&
    ['pending', 'confirmed', 'moved'].includes(appointment.status) &&
    normalizeSlot(appointment.date) === slot
  )) || null;
}

function updateLocalAppointmentStatus({ appointmentId, status, reason, actor, date }) {
  const store = readStore();
  const appointment = (store.appointments || []).find((item) => item.id === appointmentId);
  if (!appointment) return null;
  const isDoctorClaim = actor?.role === 'doctor' && !appointment.doctor_id && ['confirmed', 'moved'].includes(status);
  if (isDoctorClaim) {
    appointment.doctor_id = actor.id;
    appointment.doctor = `${actor.first_name || ''} ${actor.last_name || ''}`.trim() || actor.email;
  }
  if (status === 'moved') {
    if (!date) {
      const err = new Error('Choose a valid new appointment date.');
      err.code = 'invalid_date';
      throw err;
    }
    appointment.date = date;
  }

  if (['confirmed', 'moved'].includes(status)) {
    const conflict = localAppointmentConflict({
      appointmentId,
      doctorId: appointment.doctor_id,
      date: appointment.date,
    });
    if (conflict) {
      const err = new Error('This slot is already taken. Please choose another.');
      err.code = 'slot_conflict';
      throw err;
    }
  }

  appointment.status = status;
  appointment.decision_reason = reason || null;
  appointment.decided_by = actor?.id || null;
  appointment.decided_at = new Date().toISOString();
  appointment.updated_at = appointment.decided_at;

  createLocalNotificationRecord(store, {
    user_id: appointment.patient_id,
    title: status === 'confirmed'
      ? 'Appointment approved'
      : status === 'done'
        ? 'Appointment completed'
        : status === 'moved'
          ? 'Appointment moved'
          : 'Appointment cancelled',
    message: status === 'confirmed'
      ? `Your ${appointment.type} appointment on ${new Date(appointment.date).toLocaleString()} was approved.`
      : status === 'done'
        ? `Your ${appointment.type} appointment was marked completed.`
        : status === 'moved'
          ? `Your ${appointment.type} appointment was moved to ${new Date(appointment.date).toLocaleString()}.`
          : `Your ${appointment.type} appointment was cancelled. Reason: ${reason}`,
    type: 'appointment',
    section: 'appointments',
    target_id: appointment.id,
  });

  writeStore(store);
  return appointment;
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

function createLocalNotificationRecord(store, { user_id, title, message, type = 'general', section = null, target_id = null }) {
  store.notifications = store.notifications || [];
  store.notifications.unshift({
    id: crypto.randomUUID(),
    user_id,
    title,
    message,
    type,
    section: section || sectionForNotification(type),
    target_id: target_id || null,
    is_read: false,
    created_at: new Date().toISOString(),
  });
}

function createLocalNotification(input) {
  const store = readStore();
  createLocalNotificationRecord(store, input);
  writeStore(store);
}

function listLocalNotifications(user) {
  const store = readStore();
  return (store.notifications || [])
    .filter((notification) => notification.user_id === user.id)
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}

function markLocalNotificationRead(user, notificationId) {
  const store = readStore();
  const notification = (store.notifications || []).find((item) => item.id === notificationId && item.user_id === user.id);
  if (!notification) return null;
  notification.is_read = true;
  writeStore(store);
  return notification;
}

function listLocalDoctors() {
  const store = readStore();
  return (store.users || [])
    .filter((user) => user.role === 'doctor')
    .map((user) => ({ id: user.id, name: `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.email, email: user.email }));
}

function createLocalMedicalRecord(user, { patientId, recordType, diagnosis, treatment, fileName, fileData }) {
  const store = readStore();
  const patient = (store.users || []).find((item) => item.id === patientId && item.role === 'patient');
  if (!patient) {
    const err = new Error('Patient not found.');
    err.code = 'patient_not_found';
    throw err;
  }
  const record = {
    id: crypto.randomUUID(),
    patient_id: patient.id,
    patient_name: `${patient.first_name || ''} ${patient.last_name || ''}`.trim() || patient.email,
    type: recordType || 'Medical Result',
    diagnosis: diagnosis || 'Medical result',
    treatment: treatment || null,
    file_name: fileName || null,
    file_data: fileData || null,
    provider: `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.email,
    created_by: user.id,
    created_at: new Date().toISOString(),
  };
  store.medicalRecords = store.medicalRecords || [];
  store.medicalRecords.unshift(record);
  createLocalNotificationRecord(store, {
    user_id: patient.id,
    title: 'New medical result',
    message: `${record.provider} added a medical result to your portal.`,
    type: 'document',
    section: 'records',
    target_id: record.id,
  });
  writeStore(store);
  return record;
}

function listLocalMedicalRecords(user) {
  const store = readStore();
  let rows = store.medicalRecords || [];
  if (user.role === 'patient') rows = rows.filter((record) => record.patient_id === user.id);
  return rows.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}

function listLocalUsersForMessages(user) {
  const store = readStore();
  if (user.role === 'patient') {
    const doctorIds = [...new Set((store.appointments || [])
      .filter((appointment) => appointment.patient_id === user.id && appointment.doctor_id)
      .map((appointment) => appointment.doctor_id))];
    return (store.users || [])
      .filter((item) => doctorIds.includes(item.id))
      .map((item) => ({
        id: item.id,
        name: `${item.first_name || ''} ${item.last_name || ''}`.trim() || item.email,
        email: item.email,
        role: item.role,
      }));
  }
  return (store.users || [])
    .filter((item) => item.id !== user.id)
    .map((item) => ({
      id: item.id,
      name: `${item.first_name || ''} ${item.last_name || ''}`.trim() || item.email,
      email: item.email,
      role: item.role,
    }));
}

function listLocalMessages(user, peerId = null) {
  const store = readStore();
  let rows = (store.messages || []).filter((message) => message.sender_id === user.id || message.recipient_id === user.id);
  if (peerId) {
    rows = rows.filter((message) => message.sender_id === peerId || message.recipient_id === peerId);
  }
  return rows.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
}

function createLocalMessage(user, { recipientId, body }) {
  const store = readStore();
  const recipient = (store.users || []).find((item) => item.id === recipientId);
  if (!recipient) {
    const err = new Error('Recipient not found.');
    err.code = 'recipient_not_found';
    throw err;
  }
  const message = {
    id: crypto.randomUUID(),
    sender_id: user.id,
    recipient_id: recipient.id,
    sender_name: `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.email,
    recipient_name: `${recipient.first_name || ''} ${recipient.last_name || ''}`.trim() || recipient.email,
    subject: 'Message',
    body,
    is_read: false,
    created_at: new Date().toISOString(),
  };
  store.messages = store.messages || [];
  store.messages.push(message);
  createLocalNotificationRecord(store, {
    user_id: recipient.id,
    title: `New message from ${message.sender_name}`,
    message: body.length > 90 ? `${body.slice(0, 87)}...` : body,
    type: 'message',
    section: 'messages',
    target_id: user.id,
  });
  writeStore(store);
  return message;
}

function deleteLocalMessage(user, messageId) {
  const store = readStore();
  const before = (store.messages || []).length;
  store.messages = (store.messages || []).filter((message) => {
    const belongsToUser = message.sender_id === user.id || message.recipient_id === user.id;
    return !(message.id === messageId && belongsToUser);
  });
  if (store.messages.length === before) return false;
  writeStore(store);
  return true;
}

function listLocalUnavailableDays(doctorId = null) {
  const store = readStore();
  let rows = store.unavailableDays || [];
  if (doctorId) rows = rows.filter((item) => item.doctor_id === doctorId);
  return rows;
}

function setLocalUnavailableDay(user, date, unavailable) {
  const store = readStore();
  store.unavailableDays = store.unavailableDays || [];
  const dateKey = String(date || '').slice(0, 10);
  store.unavailableDays = store.unavailableDays.filter((item) => !(item.doctor_id === user.id && item.date === dateKey));
  if (unavailable) {
    store.unavailableDays.push({
      id: crypto.randomUUID(),
      doctor_id: user.id,
      doctor_name: `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.email,
      date: dateKey,
      created_at: new Date().toISOString(),
    });
  }
  writeStore(store);
  return { doctor_id: user.id, date: dateKey, unavailable: !!unavailable };
}

function listLocalPatients() {
  const store = readStore();
  const appointments = store.appointments || [];
  return (store.users || [])
    .filter((user) => user.role === 'patient')
    .map((user) => {
      const latestAppointment = appointments
        .filter((appointment) => appointment.patient_id === user.id)
        .sort((a, b) => new Date(b.created_at || b.date) - new Date(a.created_at || a.date))[0];
      return {
        id: user.id,
        name: `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.email,
        email: user.email,
        phone: user.phone || null,
        status: 'outpatient',
        room: null,
        trimester: null,
        doctor: latestAppointment?.doctor || null,
        admitted_at: null,
      };
    });
}

function listLocalStaff() {
  const store = readStore();
  return (store.users || [])
    .filter((user) => ['admin', 'doctor', 'nurse', 'staff'].includes(user.role))
    .map((user) => ({
      id: user.id,
      name: `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.email,
      role: user.role,
      department: null,
      shift: null,
      status: user.is_active === false ? 'inactive' : 'active',
    }));
}

function verifyLocalPassword(email, password) {
  const user = findLocalUserByEmail(email);
  if (!user) return null;
  if (user.temporary_password_expires_at && new Date(user.temporary_password_expires_at) < new Date()) {
    const err = new Error('Temporary password expired. Please contact the clinic administrator.');
    err.code = 'temporary_password_expired';
    throw err;
  }
  const attempted = hashPassword(password, user.passwordHash.salt);
  if (!safeEqual(attempted.hash, user.passwordHash.hash)) return null;
  return user;
}

function updateLocalProfile(userId, changes) {
  const store = readStore();
  const user = store.users.find((item) => item.id === userId);
  if (!user) return null;
  Object.assign(user, changes, { updated_at: new Date().toISOString() });
  writeStore(store);
  return user;
}

function recordLocalLogin({ user, email, success, ip, device }) {
  const store = readStore();
  store.loginHistory = store.loginHistory || [];
  store.loginHistory.unshift({
    id: crypto.randomUUID(),
    user_id: user?.id || null,
    email: normalizeEmail(email || user?.email),
    success: !!success,
    ip_address: ip || null,
    device: device || null,
    created_at: new Date().toISOString(),
  });
  store.loginHistory = store.loginHistory.slice(0, 300);
  writeStore(store);
}

function listLocalLoginHistory(user) {
  const store = readStore();
  return (store.loginHistory || []).filter((item) => item.user_id === user.id).slice(0, 10);
}

function createLocalPasswordChange(user, newPassword) {
  const store = readStore();
  const code = String(Math.floor(100000 + Math.random() * 900000));
  const passwordHash = hashPassword(newPassword);
  store.passwordChanges = (store.passwordChanges || []).filter((item) => item.user_id !== user.id);
  store.passwordChanges.push({
    user_id: user.id,
    code,
    passwordHash,
    expires_at: Date.now() + 10 * 60 * 1000,
  });
  writeStore(store);
  return code;
}

function confirmLocalPasswordChange(user, code) {
  const store = readStore();
  const request = (store.passwordChanges || []).find((item) => item.user_id === user.id);
  if (!request || request.code !== code || request.expires_at < Date.now()) return false;
  const row = store.users.find((item) => item.id === user.id);
  if (!row) return false;
  row.passwordHash = request.passwordHash;
  row.must_change_password = false;
  row.temporary_password_expires_at = null;
  store.passwordChanges = store.passwordChanges.filter((item) => item.user_id !== user.id);
  writeStore(store);
  return true;
}

function verifyLocalToken(token) {
  const rawToken = String(token || '').replace(/^local:/, '');
  if (!rawToken) return null;

  const store = readStore();
  const session = store.sessions.find((item) => item.token === rawToken && item.expires_at > Date.now());
  if (!session) return null;
  return store.users.find((user) => user.id === session.user_id) || null;
}

module.exports = {
  createLocalSession,
  createLocalAppointment,
  createLocalNotification,
  createLocalPasswordChange,
  createLocalFeedback,
  createLocalMessage,
  createLocalMedicalRecord,
  createLocalWaitlist,
  confirmLocalPasswordChange,
  createLocalUser,
  deleteLocalMessage,
  deleteLocalUser,
  findLocalUserByEmail,
  listLocalLoginHistory,
  listLocalFeedback,
  listLocalDoctors,
  listLocalMessages,
  listLocalMedicalRecords,
  listLocalPatients,
  listLocalStaff,
  listLocalUnavailableDays,
  listLocalUsersForMessages,
  listLocalAppointments,
  listLocalNotifications,
  listLocalWaitlist,
  localAppointmentConflict,
  markLocalNotificationRead,
  recordLocalLogin,
  updateLocalProfile,
  updateLocalFeedbackApproval,
  updateLocalAppointmentStatus,
  setLocalUnavailableDay,
  verifyLocalPassword,
  verifyLocalToken,
};
