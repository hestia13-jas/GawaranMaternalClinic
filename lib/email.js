const nodemailer = require('nodemailer');

let transporter = null;

function isEmailConfigured() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

function getTransporter() {
  if (!isEmailConfigured()) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }
  return transporter;
}

function clinicFrom() {
  return process.env.SMTP_FROM || 'Gawaran Maternal Clinic <noreply@clinicgawaran.ph>';
}

function emailShell({ title, subtitle, body }) {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:Arial,'Segoe UI',sans-serif;background:#f6f8fb;margin:0;padding:24px;color:#182230;">
  <div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #d8dee8;border-radius:8px;overflow:hidden;">
    <div style="padding:24px 28px;border-bottom:1px solid #e6ebf2;background:#f9fbfd;">
      <h1 style="font-size:20px;margin:0;color:#0f2a3d;">Gawaran Maternal Clinic</h1>
      <p style="font-size:14px;margin:6px 0 0;color:#667085;">${subtitle || title}</p>
    </div>
    <div style="padding:28px;font-size:15px;line-height:1.6;">
      <h2 style="font-size:18px;margin:0 0 16px;color:#182230;">${title}</h2>
      ${body}
    </div>
    <div style="padding:18px 28px;border-top:1px solid #e6ebf2;color:#667085;font-size:12px;">
      This is an automated clinic notification. Please contact the clinic directly for urgent medical concerns.
    </div>
  </div>
</body>
</html>`;
}

function otpEmailHtml(code, firstName) {
  const name = firstName ? ` ${firstName}` : '';
  return emailShell({
    title: 'Two-factor verification',
    subtitle: 'Secure sign-in code',
    body: `
      <p>Hello${name},</p>
      <p>Your one-time verification code is:</p>
      <p style="font-size:30px;font-weight:700;letter-spacing:8px;text-align:center;margin:24px 0;color:#0f766e;">${code}</p>
      <p>This code expires in <strong>10 minutes</strong>. Do not share it with anyone.</p>`,
  });
}

async function sendMailSafe({ to, subject, text, html }) {
  const transport = getTransporter();
  if (!transport) {
    if (process.env.NODE_ENV === 'development') {
      console.log(`\n[DEV EMAIL] ${subject}\nTo: ${to}\n${text}\n`);
    }
    return { sent: false, devMode: true };
  }

  await transport.sendMail({ from: clinicFrom(), to, subject, text, html });
  return { sent: true };
}

async function sendOtpEmail({ to, code, firstName }) {
  const subject = `${code} is your Gawaran Clinic verification code`;
  const text = `Hello${firstName ? ` ${firstName}` : ''},\n\nYour verification code is: ${code}\n\nValid for 10 minutes.\n\nGawaran Maternal Clinic`;
  return sendMailSafe({ to, subject, text, html: otpEmailHtml(code, firstName) });
}

async function sendAppointmentEmail({ to, patientName, status, appointment, reason }) {
  if (!to) return { sent: false, skipped: true };
  const approved = status === 'confirmed';
  const moved = status === 'moved';
  const completed = status === 'done' || status === 'completed';
  const cancelled = status === 'cancelled' || status === 'denied';
  const title = approved
    ? 'Appointment approved'
    : moved
      ? 'Appointment moved'
      : completed
        ? 'Appointment completed'
        : cancelled
          ? 'Appointment cancelled'
          : 'Appointment update';
  const date = appointment?.date || appointment?.appointment_date;
  const formattedDate = date ? new Date(date).toLocaleString() : 'the requested schedule';
  const subject = `Gawaran Clinic ${title.toLowerCase()}`;
  const statusLine = approved
    ? `has been approved for ${formattedDate}`
    : moved
      ? `has been moved to ${formattedDate}`
      : completed
        ? 'has been marked completed'
        : `was cancelled${reason ? `.\nReason: ${reason}` : ''}`;
  const text = `Hello ${patientName || 'Patient'},\n\nYour ${appointment.type || 'appointment'} ${statusLine}.\n\nGawaran Maternal Clinic`;
  const html = emailShell({
    title,
    subtitle: 'Appointment update',
    body: `
      <p>Hello ${patientName || 'Patient'},</p>
      <p>Your <strong>${appointment.type || 'appointment'}</strong> ${approved ? `request for <strong>${formattedDate}</strong> has been <strong>approved</strong>.` : moved ? `has been <strong>moved</strong> to <strong>${formattedDate}</strong>.` : completed ? 'has been <strong>marked completed</strong>.' : 'has been <strong>cancelled</strong>.'}</p>
      ${approved || moved ? '<p>Please arrive 10 minutes before your scheduled time.</p>' : reason ? `<p><strong>Reason:</strong> ${reason}</p>` : ''}
      <p>Thank you for using the Gawaran Maternal Clinic portal.</p>`,
  });
  return sendMailSafe({ to, subject, text, html });
}

async function sendAppointmentRequestEmail({ to, recipientName, appointment }) {
  if (!to) return { sent: false, skipped: true };
  const formattedDate = appointment?.date ? new Date(appointment.date).toLocaleString() : 'the requested schedule';
  const subject = 'New appointment request in Gawaran Clinic';
  const text = `Hello ${recipientName || 'Team'},\n\nA new appointment request was submitted.\nPatient: ${appointment.patient_name || 'Patient'}\nType: ${appointment.type || 'Appointment'}\nSchedule: ${formattedDate}\n\nPlease review it in the clinic portal.\n\nGawaran Maternal Clinic`;
  const html = emailShell({
    title: 'New appointment request',
    subtitle: 'Clinic scheduling approval',
    body: `
      <p>Hello ${recipientName || 'Team'},</p>
      <p>A new appointment request is waiting for review.</p>
      <table style="width:100%;border-collapse:collapse;font-size:14px;">
        <tr><td style="padding:8px;border-bottom:1px solid #e6ebf2;color:#667085;">Patient</td><td style="padding:8px;border-bottom:1px solid #e6ebf2;">${appointment.patient_name || 'Patient'}</td></tr>
        <tr><td style="padding:8px;border-bottom:1px solid #e6ebf2;color:#667085;">Type</td><td style="padding:8px;border-bottom:1px solid #e6ebf2;">${appointment.type || 'Appointment'}</td></tr>
        <tr><td style="padding:8px;border-bottom:1px solid #e6ebf2;color:#667085;">Schedule</td><td style="padding:8px;border-bottom:1px solid #e6ebf2;">${formattedDate}</td></tr>
      </table>
      <p>Please approve or decline this request in the portal.</p>`,
  });
  return sendMailSafe({ to, subject, text, html });
}

async function sendPasswordChangeCodeEmail({ to, code, firstName }) {
  const subject = `${code} is your Gawaran Clinic password confirmation code`;
  const text = `Hello${firstName ? ` ${firstName}` : ''},\n\nUse this code to confirm your password change: ${code}\n\nValid for 10 minutes.\n\nGawaran Maternal Clinic`;
  const html = emailShell({
    title: 'Confirm password change',
    subtitle: 'Account security verification',
    body: `
      <p>Hello${firstName ? ` ${firstName}` : ''},</p>
      <p>Use this code to confirm your password change:</p>
      <p style="font-size:30px;font-weight:700;letter-spacing:8px;text-align:center;margin:24px 0;color:#0f766e;">${code}</p>
      <p>This code expires in <strong>10 minutes</strong>. If you did not request this, contact the clinic administrator.</p>`,
  });
  return sendMailSafe({ to, subject, text, html });
}

async function sendAdminCreatedAccountEmail({ to, firstName, role, temporaryPassword, expiresAt }) {
  if (!to) return { sent: false, skipped: true };
  const formattedExpiry = new Date(expiresAt).toLocaleString();
  const subject = 'Your Gawaran Clinic portal account was created';
  const text = `Hello${firstName ? ` ${firstName}` : ''},\n\nYour Gawaran Maternal Clinic ${role} account has been created.\n\nYour password is ${temporaryPassword} as your temporary password. This password is only valid for 15 days and expires on ${formattedExpiry}.\n\nYou must change your password because it is only valid for 15 days.\n\nGawaran Maternal Clinic`;
  const html = emailShell({
    title: 'Portal account created',
    subtitle: 'Temporary password notice',
    body: `
      <p>Hello${firstName ? ` ${firstName}` : ''},</p>
      <p>Your Gawaran Maternal Clinic <strong>${role}</strong> account has been created.</p>
      <p style="padding:14px 16px;background:#f9fbfd;border:1px solid #d8dee8;border-radius:8px;"><strong>Your password is ${temporaryPassword}</strong> as your temporary password.</p>
      <p>This password is only valid for <strong>15 days</strong> and expires on <strong>${formattedExpiry}</strong>.</p>
      <p><strong>You must change your password because it is only valid for 15 days.</strong></p>`,
  });
  return sendMailSafe({ to, subject, text, html });
}

async function sendAppointmentReminderEmail({ to, patientName, appointment }) {
  if (!to) return { sent: false, skipped: true };
  const formattedDate = appointment?.date || appointment?.appointment_date
    ? new Date(appointment.date || appointment.appointment_date).toLocaleString()
    : 'your scheduled time';
  const subject = 'Upcoming appointment reminder';
  const text = `Hello ${patientName || 'Patient'},\n\nReminder: your ${appointment.type || 'appointment'} is scheduled for ${formattedDate}.\n\nGawaran Maternal Clinic`;
  const html = emailShell({
    title: 'Upcoming appointment reminder',
    subtitle: 'Clinic appointment reminder',
    body: `
      <p>Hello ${patientName || 'Patient'},</p>
      <p>This is a reminder for your <strong>${appointment.type || 'appointment'}</strong> on <strong>${formattedDate}</strong>.</p>
      <p>Please arrive 10 minutes early and bring any recent records or test results.</p>`,
  });
  return sendMailSafe({ to, subject, text, html });
}

module.exports = {
  sendOtpEmail,
  sendPasswordChangeCodeEmail,
  sendAdminCreatedAccountEmail,
  sendAppointmentEmail,
  sendAppointmentReminderEmail,
  sendAppointmentRequestEmail,
  isEmailConfigured,
};
