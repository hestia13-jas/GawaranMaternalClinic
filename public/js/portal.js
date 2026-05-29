/* ─── Modal alert helper (replaces all window.alert) ─── */
function showAlert(message, type = 'info') {
  let modal = document.getElementById('gmcAlertModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'gmcAlertModal';
    modal.className = 'modal-backdrop';
    modal.innerHTML = `
      <div class="confirm-modal" role="alertdialog" aria-modal="true" aria-labelledby="gmcAlertTitle" style="max-width:420px">
        <div id="gmcAlertIcon" style="font-size:2rem;text-align:center;margin-bottom:.5rem"></div>
        <h2 id="gmcAlertTitle" style="text-align:center;margin-bottom:.75rem"></h2>
        <p id="gmcAlertMsg" style="text-align:center;color:var(--gray-500);margin-bottom:1.25rem;line-height:1.5"></p>
        <div class="confirm-actions" style="justify-content:center">
          <button type="button" class="btn btn-primary" id="gmcAlertOk" style="min-width:100px">OK</button>
        </div>
      </div>`;
    document.body.appendChild(modal);
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.hidden = true; });
  }
  const icons = { info: 'ℹ️', success: '✅', error: '❌', warning: '⚠️' };
  document.getElementById('gmcAlertIcon').textContent = icons[type] || icons.info;
  document.getElementById('gmcAlertTitle').textContent =
    type === 'error' ? 'Error' : type === 'success' ? 'Success' : type === 'warning' ? 'Warning' : 'Notice';
  document.getElementById('gmcAlertMsg').textContent = message;
  modal.hidden = false;
  const ok = document.getElementById('gmcAlertOk');
  const close = () => { modal.hidden = true; ok.removeEventListener('click', close); };
  ok.addEventListener('click', close);
}

const NAV = {
  admin: [
    { id: 'overview', label: 'Overview', icon: 'dashboard' },
    { id: 'patients', label: 'Patients', icon: 'users' },
    { id: 'appointments', label: 'Appointments', icon: 'calendar' },
    { id: 'deliveries', label: 'Deliveries', icon: 'baby' },
    { id: 'records', label: 'Medical Records', icon: 'file' },
    { id: 'staff', label: 'Staff', icon: 'staff' },
    { id: 'messages', label: 'Messages', icon: 'message' },
    { id: 'reports', label: 'Reports', icon: 'chart' },
    { id: 'security', label: 'Security', icon: 'shield' },
    { id: 'feedback', label: 'Feedback', icon: 'heart' },
    { id: 'profile', label: 'Settings', icon: 'settings' },
  ],
  staff: [
    { id: 'overview', label: 'Overview', icon: 'dashboard' },
    { id: 'patients', label: 'Patients', icon: 'users' },
    { id: 'appointments', label: 'Appointments', icon: 'calendar' },
    { id: 'records', label: 'Records', icon: 'file' },
    { id: 'messages', label: 'Messages', icon: 'message' },
    { id: 'reports', label: 'Reports', icon: 'chart' },
    { id: 'profile', label: 'Settings', icon: 'settings' },
  ],
  doctor: [
    { id: 'overview', label: 'Overview', icon: 'dashboard' },
    { id: 'patients', label: 'My Patients', icon: 'users' },
    { id: 'appointments', label: 'Schedule', icon: 'calendar' },
    { id: 'deliveries', label: 'Deliveries', icon: 'baby' },
    { id: 'records', label: 'Records', icon: 'file' },
    { id: 'messages', label: 'Messages', icon: 'message' },
    { id: 'profile', label: 'Settings', icon: 'settings' },
  ],
  nurse: [
    { id: 'overview', label: 'Overview', icon: 'dashboard' },
    { id: 'patients', label: 'Ward Patients', icon: 'users' },
    { id: 'appointments', label: 'Schedule', icon: 'calendar' },
    { id: 'deliveries', label: 'Deliveries', icon: 'baby' },
    { id: 'lab', label: 'Laboratory', icon: 'lab' },
    { id: 'messages', label: 'Messages', icon: 'message' },
    { id: 'profile', label: 'Settings', icon: 'settings' },
  ],
  patient: [
    { id: 'overview', label: 'Home', icon: 'dashboard' },
    { id: 'appointments', label: 'Appointments', icon: 'calendar' },
    { id: 'records', label: 'Medical Records', icon: 'file' },
    { id: 'messages', label: 'Messages', icon: 'message' },
    { id: 'feedback', label: 'Feedback', icon: 'heart' },
    { id: 'profile', label: 'Settings', icon: 'settings' },
  ],
};

let state = {
  user: null,
  section: 'overview',
  stats: null,
  chart: null,
  doctors: [],
  notifications: [],
  unread: 0,
  selectedMessagePeer: null,
  messageSearch: '',
  pendingRecordId: null,
  clinicSchedule: null,
  calendarMonth: null,
};

const CALENDAR_MONTHS_AHEAD = 18;

async function api(path, options = {}) {
  const res = await fetch('/api' + path, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders(), ...options.headers },
  });
  if (res.status === 401 || res.status === 423) {
    clearSession();
    window.location.href = '/login.html';
    return null;
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { error: data.error || 'Unable to load data.' };
  return data;
}

function navForRole(role) {
  const r = String(role || '').toLowerCase().trim();
  return NAV[r] || NAV.patient;
}

function normalizedRole(role) {
  const r = String(role || '').toLowerCase().trim();
  return NAV[r] ? r : 'patient';
}

function effectiveRole(user) {
  const role = normalizedRole(user?.role);
  const fromEmail = typeof roleFromClinicEmail === 'function' ? roleFromClinicEmail(user?.email) : null;
  if (fromEmail && NAV[fromEmail] && (!role || role === 'patient')) return fromEmail;
  return role || fromEmail || 'patient';
}

function roleLabel(role) {
  const value = normalizedRole(role);
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function displayName(user) {
  const name = `${user?.firstName || ''} ${user?.lastName || ''}`.trim();
  return name || user?.email || 'Clinic user';
}

function badge(status) {
  const value = status || 'pending';
  const s = value.toLowerCase().replace(/\s/g, '_');
  return `<span class="badge badge-${s}">${value}</span>`;
}

function fmtDate(d) {
  if (!d) return '-';
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return d;
  return date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function fmtTime(d) {
  if (!d) return '-';
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return d;
  return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

function emptyTableRow(cols, message = 'No records found in the database yet.') {
  return `<tr><td colspan="${cols}" class="empty-state">${message}</td></tr>`;
}

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[char]));
}

function sourceText(data) {
  if (data?.error) return `<span class="source-error">${data.error}</span>`;
  return `<span class="source-note">database data</span>`;
}

function notificationSection(item) {
  return item?.section || {
    appointment: 'appointments',
    document: 'records',
    feedback: 'feedback',
    message: 'messages',
    security: 'profile',
  }[item?.type] || 'overview';
}

function normalizeSearch(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

async function refreshNotifications() {
  const data = await api('/notifications');
  state.notifications = data?.notifications || [];
  state.unread = data?.unread || 0;
  renderNotificationDropdown();
}

function renderNotificationDropdown() {
  const host = document.getElementById('notificationMenu');
  if (!host) return;
  const rows = state.notifications.slice(0, 8);
  host.innerHTML = rows.length
    ? rows.map((n) => `
      <button type="button" class="notification-item ${n.is_read ? '' : 'unread'}" data-notification-id="${n.id}" data-section="${notificationSection(n)}" data-target-id="${n.target_id || ''}">
        <strong>${n.title || 'Notification'}</strong>
        <span>${n.message || ''}</span>
        <small>${fmtDate(n.created_at)}</small>
      </button>`).join('')
    : '<div class="empty-state compact">No notifications yet.</div>';

  document.querySelectorAll('[data-notification-id]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await api(`/notifications/${btn.dataset.notificationId}/read`, { method: 'PATCH', body: JSON.stringify({}) });
      await refreshNotifications();
      if (btn.dataset.section === 'messages' && btn.dataset.targetId) state.selectedMessagePeer = btn.dataset.targetId;
      if (btn.dataset.section === 'records' && btn.dataset.targetId) state.pendingRecordId = btn.dataset.targetId;
      await navigate(btn.dataset.section || 'overview');
    });
  });

  const count = document.getElementById('notificationCount');
  if (count) {
    count.textContent = state.unread;
    count.hidden = state.unread === 0;
  }
}

function renderShell() {
  state.user.role = normalizedRole(state.user.role);
  const nav = navForRole(state.user.role);
  const name = displayName(state.user);

  document.getElementById('portalSidebar').innerHTML = `
    <a href="/" class="portal-brand">
      <img src="/assets/logo.jpg" width="40" height="40" alt="" />
      <span>Gawaran Clinic</span>
    </a>
    <div class="portal-user">
      <button type="button" class="portal-avatar portal-avatar-button" id="profilePhotoShortcut" aria-label="Open settings">${state.user.profilePhotoUrl ? `<img src="${state.user.profilePhotoUrl}" alt="" />` : name.slice(0, 1).toUpperCase()}</button>
      <div class="portal-user-name">${name}</div>
      <span class="portal-user-role">${roleLabel(state.user.role)}</span>
    </div>
    <ul class="portal-nav">
      ${nav.map((n) => `
        <li><button type="button" class="nav-btn ${state.section === n.id ? 'active' : ''}" data-section="${n.id}">
          ${icon(n.icon)} ${n.label}
        </button></li>`).join('')}
    </ul>
    <div class="portal-sidebar-footer">
      <button type="button" class="logout-btn" id="portalLogout">${icon('logout')} <span>Sign out</span></button>
    </div>`;

  document.querySelectorAll('.nav-btn[data-section]').forEach((btn) => {
    btn.addEventListener('click', () => navigate(btn.dataset.section));
  });
  document.getElementById('profilePhotoShortcut')?.addEventListener('click', () => navigate('profile'));
  document.getElementById('portalLogout')?.addEventListener('click', () => {
    showLogoutModal();
  });
  renderEmergencyButton();
}

function renderEmergencyButton() {
  document.getElementById('patientEmergencyBtn')?.remove();
  if (state.user?.role !== 'patient') return;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.id = 'patientEmergencyBtn';
  btn.className = 'emergency-fab';
  btn.title = 'Send urgent emergency alert to the clinic team';
  btn.innerHTML = `${icon('emergency')} <span>Emergency</span>`;
  btn.addEventListener('click', showEmergencyModal);
  document.body.appendChild(btn);
}

function showEmergencyModal() {
  let modal = document.getElementById('emergencyModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'emergencyModal';
    modal.className = 'modal-backdrop';
    modal.innerHTML = `
      <div class="confirm-modal emergency-modal" role="dialog" aria-modal="true" aria-labelledby="emergencyTitle" style="max-width:480px">
        <div style="text-align:center;margin-bottom:.5rem">
          <span style="font-size:2.5rem">🚨</span>
        </div>
        <h2 id="emergencyTitle" style="text-align:center;color:#dc2626;margin-bottom:.25rem">Emergency Alert</h2>
        <p style="text-align:center;color:var(--gray-500);font-size:.9rem;margin-bottom:1.25rem">
          This will immediately notify all doctors and clinic admins by email. Use only for genuine emergencies.
        </p>
        <div style="margin-bottom:1rem">
          <label for="emergencyDetails" style="font-weight:600;display:block;margin-bottom:.4rem">
            Reason for emergency <span style="color:#dc2626">*</span>
          </label>
          <textarea id="emergencyDetails" rows="4" placeholder="Describe the emergency (e.g. sudden labor, severe pain, heavy bleeding, high fever, difficulty breathing)…" style="width:100%;box-sizing:border-box;padding:.6rem .75rem;border:1.5px solid var(--gray-300,#d1d5db);border-radius:.5rem;font-size:.95rem;font-family:inherit;resize:vertical"></textarea>
          <p id="emergencyDetailsError" style="color:#dc2626;font-size:.82rem;margin:.25rem 0 0;display:none">Please describe the emergency before sending.</p>
        </div>
        <p id="emergencyMsg" class="form-inline-msg"></p>
        <div class="confirm-actions">
          <button type="button" class="btn btn-outline" id="emergencyCancel">Cancel</button>
          <button type="button" class="btn btn-danger" id="emergencySend">${icon('emergency')} Send Emergency Alert</button>
        </div>
        <p style="text-align:center;color:var(--gray-400,#9ca3af);font-size:.78rem;margin-top:.75rem">
          Doctors and admins will receive an email notification immediately.
        </p>
      </div>`;
    document.body.appendChild(modal);
    document.getElementById('emergencyCancel')?.addEventListener('click', () => {
      modal.hidden = true;
    });
    modal.addEventListener('click', (event) => {
      if (event.target === modal) modal.hidden = true;
    });
    document.getElementById('emergencySend')?.addEventListener('click', sendEmergencyAlert);
  }
  document.getElementById('emergencyDetails').value = '';
  document.getElementById('emergencyMsg').textContent = '';
  document.getElementById('emergencyMsg').className = 'form-inline-msg';
  document.getElementById('emergencyDetailsError').style.display = 'none';
  document.getElementById('emergencySend').disabled = false;
  modal.hidden = false;
  document.getElementById('emergencyDetails')?.focus();
}

async function sendEmergencyAlert() {
  const msg = document.getElementById('emergencyMsg');
  const sendBtn = document.getElementById('emergencySend');
  const errEl = document.getElementById('emergencyDetailsError');
  const details = (document.getElementById('emergencyDetails')?.value || '').trim();

  if (!details) {
    errEl.style.display = 'block';
    document.getElementById('emergencyDetails')?.focus();
    return;
  }
  errEl.style.display = 'none';

  sendBtn.disabled = true;
  msg.textContent = 'Sending emergency alert…';
  msg.className = 'form-inline-msg';

  const res = await api('/emergency-alerts', {
    method: 'POST',
    body: JSON.stringify({ message: details }),
  });

  if (res?.error) {
    msg.textContent = res.error;
    msg.className = 'form-inline-msg error';
    sendBtn.disabled = false;
    return;
  }

  msg.textContent = res?.message || '✅ Emergency alert sent! Doctors and admins have been notified by email.';
  msg.className = 'form-inline-msg success';
  sendBtn.disabled = true;
  await refreshNotifications();
  setTimeout(() => {
    const modal = document.getElementById('emergencyModal');
    if (modal) modal.hidden = true;
  }, 2500);
}


function showLogoutModal() {
  let modal = document.getElementById('logoutModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'logoutModal';
    modal.className = 'modal-backdrop';
    modal.innerHTML = `
      <div class="confirm-modal" role="dialog" aria-modal="true" aria-labelledby="logoutTitle">
        <h2 id="logoutTitle">Are you sure?</h2>
        <div class="confirm-actions">
          <button type="button" class="btn btn-outline" id="logoutNo">No</button>
          <button type="button" class="btn btn-danger" id="logoutYes">Yes</button>
        </div>
      </div>`;
    document.body.appendChild(modal);
    document.getElementById('logoutNo')?.addEventListener('click', () => {
      modal.hidden = true;
    });
    document.getElementById('logoutYes')?.addEventListener('click', () => {
      clearSession();
      window.location.href = '/login.html';
    });
  }
  modal.hidden = false;
}

function setTopbar(title, subtitle) {
  document.getElementById('portalTopbar').innerHTML = `
    <div>
      <h1>${title}</h1>
      ${subtitle ? `<p>${subtitle}</p>` : ''}
    </div>
    <div class="portal-topbar-meta">
      <span>${new Date().toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</span>
      <div class="notification-wrap">
        <button type="button" class="notification-btn" id="notificationToggle" aria-label="Notifications">
          ${icon('message')}
          <span id="notificationCount" class="notification-count" ${state.unread ? '' : 'hidden'}>${state.unread}</span>
        </button>
        <div class="notification-menu" id="notificationMenu" hidden></div>
      </div>
    </div>`;

  document.getElementById('notificationToggle')?.addEventListener('click', () => {
    const menu = document.getElementById('notificationMenu');
    menu.hidden = !menu.hidden;
  });
  renderNotificationDropdown();
}

async function navigate(section) {
  state.section = section;
  renderShell();
  const titles = {
    overview: ['Dashboard', 'Clinical operations at a glance'],
    patients: ['Patient Management', 'Admissions, records, and care coordination'],
    appointments: ['Appointments', 'Scheduling and approval calendar'],
    deliveries: ['Deliveries', 'Labor and delivery tracking'],
    records: ['Medical Records', 'Clinical documentation'],
    lab: ['Laboratory', 'Diagnostics and results'],
    staff: ['Staff Management', 'Providers and duty coordination'],
    messages: ['Messages', 'Internal communications'],
    reports: ['Reports & Analytics', 'Performance and utilization'],
    security: ['Security & Compliance', 'Audit, access control, encryption'],
    medications: ['Medications', 'Prescriptions and adherence'],
    feedback: ['Feedback', 'Service reviews and public testimonials'],
    profile: ['Settings & Profile', 'Personal details, photo, password, and login history'],
  };
  const [title, subtitle] = titles[section] || ['Portal', ''];
  setTopbar(title, subtitle);

  const el = document.getElementById('portalContent');
  el.innerHTML = '<p class="empty-state">Loading...</p>';

  const views = {
    overview: renderOverview,
    patients: renderPatients,
    appointments: renderAppointments,
    deliveries: renderDeliveries,
    records: renderRecords,
    lab: renderLab,
    staff: renderStaff,
    messages: renderMessages,
    reports: renderReports,
    security: renderSecurity,
    medications: renderMedications,
    feedback: renderFeedback,
    profile: renderProfile,
  };
  await (views[section] || renderOverview)(el);
}

function statCard(label, value, ic) {
  return `<div class="stat-card"><div class="stat-card-label">${label}</div><div class="stat-card-value">${value ?? '-'}</div><div class="stat-card-icon">${icon(ic)}</div></div>`;
}

async function renderOverview(el) {
  state.stats = await api('/dashboard/stats');
  const s = state.stats || {};
  const role = state.user.role;
  const w = s.widgets || {};
  let statsHtml = '';

  if (role === 'admin' || role === 'staff') {
    statsHtml = `<div class="stat-grid">
      ${statCard('Patients Admitted', w.patientsAdmitted, 'users')}
      ${statCard('Deliveries Today', w.deliveriesToday, 'baby')}
      ${statCard('Active Staff', w.activeStaff, 'staff')}
      ${statCard('Pending Appointments', w.pendingAppointments, 'calendar')}
    </div>`;
  } else if (role === 'doctor' || role === 'nurse') {
    statsHtml = `<div class="stat-grid">
      ${statCard('Patients Today', w.patientsToday, 'users')}
      ${statCard('Scheduled Deliveries', w.scheduledDeliveries, 'baby')}
      ${statCard('Medical Records', w.medicalRecords, 'file')}
      ${statCard('Notifications', w.notifications, 'message')}
    </div>`;
  } else {
    statsHtml = `<div class="stat-grid">
      ${statCard('Next Appointment', fmtDate(w.nextAppointment), 'calendar')}
      ${statCard('Medical Records', w.medicalRecords, 'file')}
      ${statCard('Notifications', w.notifications, 'message')}
    </div>`;
  }

  el.innerHTML = statsHtml + '<div class="panel-grid" id="overviewPanels"></div>';
  const panels = document.getElementById('overviewPanels');

  if (role === 'patient') {
    const [summary, announcements] = await Promise.all([
      api('/patient/summary'),
      api('/announcements'),
    ]);
    const pregnancy = summary?.pregnancy;
    const announcementHtml = (announcements?.announcements || []).length
      ? `<div class="panel" style="grid-column:1/-1"><div class="panel-head"><h2>Clinic announcements</h2>${sourceText(announcements)}</div><div class="panel-body announcement-list">${announcements.announcements.map((item) => `<article class="announcement-item priority-${item.priority || 'normal'}"><strong>${escapeHtml(item.title)}</strong><p>${escapeHtml(item.body || '')}</p><small>${fmtDate(item.created_at)}</small></article>`).join('')}</div></div>`
      : '';
    panels.innerHTML = announcementHtml + `
      <div class="panel">
        <div class="panel-head"><h2>Pregnancy care summary</h2>${sourceText(summary)}</div>
        <div class="panel-body">
          ${pregnancy ? `
            <div class="care-grid">
              <div><span>Due date</span><strong>${pregnancy.dueDate || 'Not recorded'}</strong></div>
              <div><span>Trimester</span><strong>${pregnancy.trimester || 'Not recorded'}</strong></div>
              <div><span>Cycle</span><strong>${pregnancy.cycle || 'Not recorded'}</strong></div>
            </div>
            <p class="clinical-note">${pregnancy.diagnosis || ''}</p>
            <p class="clinical-note">${pregnancy.treatment || ''}</p>`
            : '<p class="empty-state compact">No pregnancy summary has been approved by your doctor yet.</p>'}
        </div>
      </div>
      <div class="panel">
        <div class="panel-head"><h2>Doctor-approved care tips</h2></div>
        <div class="panel-body">
          ${(summary?.tips || []).length
            ? `<ul class="tips-list">${summary.tips.map((tip) => `<li>${tip}</li>`).join('')}</ul>`
            : '<p class="empty-state compact">Tips will appear after a doctor adds an approved diagnosis or care plan.</p>'}
        </div>
      </div>
      <div class="panel">
        <div class="panel-head"><h2>Quick actions</h2></div>
        <div class="panel-body action-row">
          <button type="button" class="btn btn-primary btn-sm" data-quick-section="appointments">${icon('calendar')} Book appointment</button>
          <button type="button" class="btn btn-outline btn-sm" data-quick-section="records">${icon('file')} View records</button>
        </div>
      </div>`;
    document.querySelectorAll('[data-quick-section]').forEach((btn) => {
      btn.addEventListener('click', () => navigate(btn.dataset.quickSection));
    });
    return;
  }

  if (role === 'admin' || role === 'staff') {
    panels.innerHTML = `
      <div class="panel"><div class="panel-head"><h2>Patient volume</h2></div><div class="panel-body chart-wrap"><canvas id="chartPatients"></canvas></div></div>
      <div class="panel"><div class="panel-head"><h2>Staff performance</h2></div><div class="panel-body" id="staffPerfList"></div></div>`;
    drawPatientChart(s.charts?.patientStatistics || []);
    const perf = s.charts?.staffPerformance || [];
    document.getElementById('staffPerfList').innerHTML = perf.length
      ? perf.map((p) => `<div class="performance-row"><span>${p.name}</span><strong>${p.score}%</strong></div>`).join('')
      : '<p class="empty-state compact">No staff performance records yet.</p>';
    return;
  }

  panels.innerHTML = '';
}

async function renderEmergencyAlertsPanel() {
  const data = await api('/emergency-alerts');

  const rows = data?.alerts || [];
  return `<div class="panel emergency-panel" style="grid-column:1/-1"><div class="panel-head"><h2>${icon('emergency')} Emergency alerts</h2>${sourceText(data)}</div><div class="panel-body" style="overflow-x:auto"><table class="data-table"><thead><tr><th>Patient</th><th>Phone</th><th>Message</th><th>Status</th><th>Time</th><th>Action</th></tr></thead><tbody>
    ${rows.length ? rows.map((a) => `<tr>
      <td>${escapeHtml(a.patient_name || '-')}</td>
      <td>${escapeHtml(a.phone || '-')}</td>
      <td>${escapeHtml(a.message || '-')}</td>
      <td>${badge(a.status)}</td>
      <td>${fmtDate(a.created_at)}</td>
      <td class="table-actions">
        ${a.status === 'new' ? `<button type="button" class="btn btn-primary btn-xs" data-emergency-ack="${a.id}">Acknowledge</button>` : ''}
        ${a.status !== 'resolved' ? `<button type="button" class="btn btn-outline btn-xs" data-emergency-resolve="${a.id}">Resolve</button>` : ''}
      </td>
    </tr>`).join('') : emptyTableRow(6, 'No emergency alerts.')}
  </tbody></table></div></div>`;
}

function drawPatientChart(data) {
  const canvas = document.getElementById('chartPatients');
  if (!canvas || typeof Chart === 'undefined') return;
  if (state.chart) state.chart.destroy();
  state.chart = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: data.map((x) => x.month),
      datasets: [{ label: 'Patients', data: data.map((x) => x.count), backgroundColor: '#0f766e', borderRadius: 4 }],
    },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } },
  });
}

async function ensureDoctors(forceRefresh = false) {
  if (!forceRefresh && state.doctors.length) return state.doctors;
  const data = await api('/doctors');
  state.doctors = data?.doctors || [];
  return state.doctors;
}

const FALLBACK_CLINIC_SLOTS = {
  weekday: [
    { startTime: '08:00', endTime: '10:00', serviceName: 'Prenatal Care' },
    { startTime: '10:00', endTime: '12:00', serviceName: 'OB-GYN Consultation & Family Planning' },
    { startTime: '13:00', endTime: '15:00', serviceName: 'Ultrasound & Monitoring' },
    { startTime: '15:00', endTime: '17:00', serviceName: 'Pediatric Care & Immunization' },
    { startTime: '17:00', endTime: '19:00', serviceName: 'Postnatal Care (mother & newborn recovery)' },
    { startTime: '19:00', endTime: '23:59', serviceName: 'Labor & Delivery (24/7 coverage)' },
  ],
  saturday: [
    { startTime: '08:00', endTime: '10:00', serviceName: 'Prenatal Care' },
    { startTime: '10:00', endTime: '12:00', serviceName: 'OB-GYN Consultation' },
    { startTime: '13:00', endTime: '15:00', serviceName: 'Ultrasound & Monitoring' },
    { startTime: '15:00', endTime: '17:00', serviceName: 'Pediatric Care & Immunization' },
    { startTime: '17:00', endTime: '19:00', serviceName: 'Postnatal Care' },
    { startTime: '19:00', endTime: '23:59', serviceName: 'Labor & Delivery (24/7 coverage)' },
  ],
  sunday: [
    { startTime: '00:00', endTime: '23:59', serviceName: 'Emergency Care (24/7)' },
    { startTime: '00:30', endTime: '23:59', serviceName: 'Labor & Delivery (24/7 coverage)' },
  ],
};

async function ensureClinicSchedule() {
  if (state.clinicSchedule) return state.clinicSchedule;
  const data = await api('/clinic/schedule');
  state.clinicSchedule = {
    schedule: data?.schedule || FALLBACK_CLINIC_SLOTS,
    services: data?.services || [],
    source: data?.source || 'fallback',
  };
  return state.clinicSchedule;
}

function clinicSlotsForDate(dateText) {
  if (!dateText) return [];
  const day = new Date(`${dateText}T12:00:00`).getDay();
  const sched = state.clinicSchedule?.schedule || FALLBACK_CLINIC_SLOTS;
  if (day === 0) return sched.sunday || FALLBACK_CLINIC_SLOTS.sunday;
  if (day === 6) return sched.saturday || FALLBACK_CLINIC_SLOTS.saturday;
  return sched.weekday || FALLBACK_CLINIC_SLOTS.weekday;
}

function slotDateTime(dateText, slot) {
  return `${dateText}T${slot.startTime}`;
}

function sameSlot(left, right) {
  return new Date(left).getTime() === new Date(right).getTime();
}

function isSlotBooked(bookedRows, dateText, slot) {
  const target = slotDateTime(dateText, slot);
  return bookedRows.some((item) => sameSlot(item.date, target));
}

function isDoctorUnavailable(unavailableDays, doctorId, dateText) {
  if (!doctorId) return false;
  return (unavailableDays || []).some((item) => {
    const itemDate = item.date || item.unavailable_date;
    return itemDate === dateText && item.doctor_id === doctorId;
  });
}

function isClinicClosed(closedDays, dateText) {
  return (closedDays || []).some((item) => (item.date || item.closed_date) === dateText);
}

function clinicClosedReason(closedDays, dateText) {
  return (closedDays || []).find((item) => (item.date || item.closed_date) === dateText)?.reason || '';
}

function localDateKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function isPastDate(dateText) {
  return dateText < localDateKey();
}

function currentMonthKey() {
  return localDateKey().slice(0, 7);
}

function monthKeyFromDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function parseMonthKey(monthKey) {
  const [y, m] = String(monthKey || '').split('-').map(Number);
  if (!y || !m) return new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  return new Date(y, m - 1, 1);
}

function endOfMonthDate(monthKey) {
  const d = parseMonthKey(monthKey);
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}

function maxMonthKey() {
  const d = new Date();
  d.setMonth(d.getMonth() + CALENDAR_MONTHS_AHEAD);
  return monthKeyFromDate(d);
}

function clampMonthKey(monthKey) {
  const min = currentMonthKey();
  const max = maxMonthKey();
  if (monthKey < min) return min;
  if (monthKey > max) return max;
  return monthKey;
}

function shiftMonthKey(monthKey, delta) {
  const d = parseMonthKey(monthKey);
  d.setMonth(d.getMonth() + delta);
  return clampMonthKey(monthKeyFromDate(d));
}

function activeCalendarMonth() {
  return clampMonthKey(state.calendarMonth || currentMonthKey());
}

function availabilityPath(monthKey, doctorId = '') {
  const from = `${monthKey}-01`;
  const to = localDateKey(endOfMonthDate(monthKey));
  const params = new URLSearchParams({ from, to });
  if (doctorId) params.set('doctorId', doctorId);
  return `/appointments/availability?${params}`;
}

function renderMonthNavigator(monthKey) {
  const min = currentMonthKey();
  const max = maxMonthKey();
  const prevDisabled = monthKey <= min;
  const nextDisabled = monthKey >= max;
  const label = parseMonthKey(monthKey).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  return `<div class="calendar-month-nav">
    <button type="button" class="btn btn-outline btn-sm" data-cal-prev aria-label="Previous month" ${prevDisabled ? 'disabled' : ''}>Previous</button>
    <label class="calendar-month-picker">
      <span class="visually-hidden">Choose month</span>
      <input type="month" class="calendar-month-input" value="${monthKey}" min="${min}" max="${max}" aria-label="Choose month (${label})" />
    </label>
    <span class="calendar-month-label">${escapeHtml(label)}</span>
    <button type="button" class="btn btn-outline btn-sm" data-cal-next aria-label="Next month" ${nextDisabled ? 'disabled' : ''}>Next</button>
  </div>
  <p class="calendar-month-hint">Use the month picker to view future dates (for example December). Past months cannot be selected.</p>`;
}

function renderMonthAvailability(bookedRows, doctorId, monthDate = new Date(), unavailableDays = [], closedDays = []) {
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const first = new Date(year, month, 1);
  const startOffset = first.getDay();
  const totalDays = new Date(year, month + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < startOffset; i += 1) cells.push('<div class="availability-day muted"></div>');
  for (let day = 1; day <= totalDays; day += 1) {
    const dateText = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const slots = clinicSlotsForDate(dateText);
    const restDay = doctorId && isDoctorUnavailable(unavailableDays, doctorId, dateText);
    const closed = isClinicClosed(closedDays, dateText);
    const past = isPastDate(dateText);
    const available = !past && !closed && !restDay && slots.some((slot) => !isSlotBooked(bookedRows, dateText, slot));
    const status = past ? 'past' : available ? 'available' : 'unavailable';
    const disabled = available ? '' : 'disabled';
    const title = past
      ? 'Past date - booking disabled'
      : closed
        ? `Clinic closed${clinicClosedReason(closedDays, dateText) ? `: ${clinicClosedReason(closedDays, dateText)}` : ''}`
        : restDay
          ? 'Doctor rest day - choose another date'
          : (available ? 'Available slots' : 'Fully booked');
    cells.push(`<button type="button" class="availability-day ${status}" data-pick-date="${dateText}" title="${escapeHtml(title)}" aria-label="${escapeHtml(`${dateText}: ${title}`)}" ${disabled}><span>${day}</span></button>`);
  }
  const label = first.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  return `<div class="availability-calendar" data-doctor="${doctorId || ''}">
    <div class="availability-title">${label}</div>
    <div class="availability-legend"><span class="legend-dot available"></span> Available <span class="legend-dot unavailable"></span> Clinic unavailable <span class="legend-dot past"></span> Past date</div>
    <div class="availability-weekdays"><span>Sun</span><span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span></div>
    <div class="availability-grid">${cells.join('')}</div>
  </div>`;
}

function renderAvailabilityMonths(bookedRows, doctorId, unavailableDays = [], closedDays = [], monthKey = activeCalendarMonth()) {
  return `${renderMonthNavigator(monthKey)}
    ${renderMonthAvailability(bookedRows, doctorId, parseMonthKey(monthKey), unavailableDays, closedDays)}`;
}

function updateSlotOptions(bookedRows, unavailableDays = [], doctorId = '', closedDays = []) {
  const dateInput = document.getElementById('bookDate');
  const slotHidden = document.getElementById('bookSlot');
  const typeSelect = document.getElementById('bookType');
  const wrap = document.getElementById('slotTableWrap');
  const inner = document.getElementById('slotTableInner');
  if (!dateInput || !slotHidden || !wrap || !inner) return;
  const dateText = dateInput.value;
  if (!dateText) { wrap.style.display = 'none'; slotHidden.value = ''; return; }
  wrap.style.display = '';
  const slots = clinicSlotsForDate(dateText);
  const restDay = doctorId && isDoctorUnavailable(unavailableDays, doctorId, dateText);
  const closed = isClinicClosed(closedDays, dateText);
  const past = isPastDate(dateText);
  if (past || closed || restDay) {
    const reason = past ? 'Past dates cannot be booked.' : closed ? 'Clinic is closed on this date.' : 'Doctor is unavailable on this date.';
    inner.innerHTML = `<p class="empty-state compact" style="color:#dc2626">${reason}</p>`;
    slotHidden.value = '';
    return;
  }
  let firstAvail = null;
  const rows = slots.map((slot) => {
    const booked = isSlotBooked(bookedRows, dateText, slot);
    const val = slotDateTime(dateText, slot);
    if (!booked && !firstAvail) firstAvail = { val, type: slot.serviceName };
    return `<tr class="slot-row ${booked ? 'slot-booked' : 'slot-available'}" data-slot-val="${booked ? '' : val}" data-slot-type="${escapeHtml(slot.serviceName)}" style="${booked ? 'opacity:.5;cursor:default' : 'cursor:pointer'}">
      <td style="padding:.5rem .75rem;font-weight:600;white-space:nowrap">${slot.startTime}\u2013${slot.endTime}</td>
      <td style="padding:.5rem .75rem;width:100%">${escapeHtml(slot.serviceName)}</td>
      <td style="padding:.5rem .75rem;text-align:right;white-space:nowrap">${booked ? '<span style="color:#9ca3af;font-size:.82rem">Booked</span>' : '<span class="badge badge-confirmed" style="font-size:.78rem">Available</span>'}</td>
    </tr>`;
  }).join('');
  inner.innerHTML = `<table class="data-table slot-picker-table" style="width:100%;border-radius:.5rem;overflow:hidden"><thead><tr>
    <th style="padding:.5rem .75rem">Time</th><th style="padding:.5rem .75rem">Service</th><th style="padding:.5rem .75rem;text-align:right">Status</th>
  </tr></thead><tbody>${rows}</tbody></table>`;
  inner.querySelectorAll('.slot-row.slot-available').forEach((row) => {
    row.addEventListener('click', () => {
      inner.querySelectorAll('.slot-row').forEach((r) => r.style.outline = '');
      row.style.outline = '2px solid var(--teal-600, #0d9488)';
      slotHidden.value = row.dataset.slotVal;
      if (typeSelect) typeSelect.value = row.dataset.slotType || typeSelect.value;
    });
  });
  if (firstAvail) {
    slotHidden.value = firstAvail.val;
    if (typeSelect) typeSelect.value = firstAvail.type;
    const firstRow = inner.querySelector('.slot-row.slot-available');
    if (firstRow) firstRow.style.outline = '2px solid var(--teal-600, #0d9488)';
  } else {
    slotHidden.value = '';
  }
}

function renderCalendar(rows, options = {}) {
  const {
    unavailableDays = [],
    closedDays = [],
    canToggleUnavailable = false,
    canToggleClinicClosed = false,
    monthKey = activeCalendarMonth(),
  } = options;
  const monthDate = parseMonthKey(monthKey);
  const grouped = new Map();
  rows.forEach((a) => {
    const key = a.date ? new Date(a.date).toISOString().slice(0, 10) : 'Unscheduled';
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(a);
  });
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const first = new Date(year, month, 1);
  const cells = [];
  for (let i = 0; i < first.getDay(); i += 1) cells.push('<div class="calendar-day muted"></div>');
  const totalDays = new Date(year, month + 1, 0).getDate();
  for (let day = 1; day <= totalDays; day += 1) {
    const key = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const events = (grouped.get(key) || []).sort((a, b) => new Date(a.date) - new Date(b.date));
    const unavailable = unavailableDays.some((item) => (item.date || item.unavailable_date) === key);
    const closed = isClinicClosed(closedDays, key);
    const past = isPastDate(key);
    const info = past
      ? ''
      : closed
        ? `Clinic closed${clinicClosedReason(closedDays, key) ? `: ${clinicClosedReason(closedDays, key)}` : ''}`
        : unavailable
          ? 'Provider rest day'
          : events.length
            ? `${events.length} booking${events.length > 1 ? 's' : ''}`
            : 'Open for booking';
    cells.push(`<div class="calendar-day ${events.length ? 'has-events' : ''} ${unavailable || closed ? 'unavailable' : ''} ${past ? 'past' : ''}" title="${escapeHtml(info)}">
      <div class="calendar-date">${day}${info ? `<span>${escapeHtml(info)}</span>` : ''}</div>
      ${canToggleUnavailable ? `<button type="button" class="rest-day-toggle ${unavailable ? 'active' : ''}" data-rest-date="${key}" ${past ? 'disabled' : ''}>${unavailable ? 'Unavailable' : 'Mark rest day'}</button>` : ''}
      ${canToggleClinicClosed ? `<button type="button" class="rest-day-toggle clinic-close-toggle ${closed ? 'active' : ''}" data-close-date="${key}" ${past ? 'disabled' : ''}>${closed ? 'Clinic closed' : 'Close clinic'}</button>` : ''}
      ${events.slice(0, 4).map((a) => `
        <div class="calendar-event ${a.status || 'pending'}">
          <strong>${fmtTime(a.date)} - ${a.type || 'Appointment'}</strong>
          <span>${a.patient_name || 'Patient'} with ${a.doctor || 'Unassigned'}</span>
        </div>`).join('')}
    </div>`);
  }
  return `${renderMonthNavigator(monthKey)}
    <div class="calendar-board" data-schedule-body>
      <div class="calendar-month-title">${first.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</div>
      <div class="availability-weekdays"><span>Sun</span><span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span></div>
      <div class="calendar-month-grid">${cells.join('')}</div>
    </div>`;
}

async function renderAppointments(el) {
  const role = state.user.role;
  state.calendarMonth = activeCalendarMonth();
  const monthKey = state.calendarMonth;
  const maxBookDate = localDateKey(endOfMonthDate(maxMonthKey()));
  const clinicSched = await ensureClinicSchedule();
  const serviceOptions = (clinicSched.services?.length
    ? clinicSched.services.map((s) => s.name)
    : [...new Set([...clinicSlotsForDate(localDateKey()), ...FALLBACK_CLINIC_SLOTS.weekday].map((slot) => slot.serviceName))]);
  const data = await api('/appointments');
  const rows = data?.appointments || [];
  const doctors = await ensureDoctors(true); // always refresh so dropdown is current
  const doctorIdForAvail = role === 'doctor' ? state.user.id : '';
  const availability = role === 'patient' || role === 'doctor' || role === 'admin'
    ? await api(availabilityPath(monthKey, doctorIdForAvail))
    : { appointments: rows, unavailableDays: [], closedDays: [] };
  let bookedRows = availability?.appointments || [];
  let unavailableDays = availability?.unavailableDays || [];
  let closedDays = availability?.closedDays || [];

  const adminClosePanel = role === 'admin' ? `<div class="panel" style="margin-bottom:1.25rem"><div class="panel-head"><h2>Close clinic on a future date</h2></div><div class="panel-body professional-form clinic-close-form">
    <p class="form-hint">Pick any future date (for example a day in December). Past dates are not allowed.</p>
    <div class="form-field"><label for="adminCloseDate">Date</label><input type="date" id="adminCloseDate" min="${localDateKey()}" max="${maxBookDate}" /></div>
    <div class="form-field form-field-wide"><label for="adminCloseReason">Reason</label><input type="text" id="adminCloseReason" placeholder="Holiday closure, renovation, etc." /></div>
    <div class="form-actions-row"><button type="button" class="btn btn-primary btn-sm" id="adminCloseDateBtn">Close clinic on this date</button></div>
    <p id="adminCloseDateMsg" class="form-inline-msg"></p>
  </div></div>` : '';

  let bookForm = '';
  if (role === 'patient') {
    bookForm = `<div class="panel appointment-panel"><div class="panel-head form-panel-head"><div><h2>Book new appointment</h2><p>Choose a calendar date first, then select the service, doctor, and time.</p></div></div><div class="panel-body professional-form" id="bookForm">
      <div class="form-field-wide availability-months" data-availability-body>${renderAvailabilityMonths(bookedRows, '', unavailableDays, closedDays, monthKey)}</div>
      <div class="form-field"><label for="bookDate">Selected date</label><input type="date" id="bookDate" min="${localDateKey()}" max="${maxBookDate}" /></div>
      <div class="form-field"><label for="bookType">Appointment type</label><select id="bookType">${serviceOptions.map((name) => `<option>${escapeHtml(name)}</option>`).join('')}</select></div>
      <div class="form-field"><label for="bookDoctor">Preferred doctor <span style="font-weight:400;color:var(--gray-500);font-size:.85em">(optional)</span></label><select id="bookDoctor"><option value="">Any available doctor</option>${doctors.map((d) => `<option value="${d.id}" data-name="${escapeHtml(d.name)}">${escapeHtml(d.name)}${d.specialization ? ` - ${escapeHtml(d.specialization)}` : ''}</option>`).join('')}</select>${doctors.length === 0 ? `<p class="form-hint" style="margin-top:.35rem;color:var(--gray-500)">No doctors on record yet; your appointment will be assigned by the clinic.</p>` : `<p class="form-hint" style="margin-top:.35rem;color:var(--gray-500)">Leaving this as "Any available doctor" lets all matching doctors and admins review the request.</p>`}</div>
      <div class="form-field form-field-wide" id="slotTableWrap" style="display:none">
        <label style="display:block;margin-bottom:.5rem;font-weight:600">Clinic schedule - select a time slot</label>
        <div id="slotTableInner"></div>
        <input type="hidden" id="bookSlot" />
      </div>
      <div class="form-field form-field-wide"><label for="bookNotes">Notes for the clinic</label><textarea id="bookNotes" rows="4" placeholder="Optional details, symptoms, or special requests"></textarea></div>
      <div class="form-actions-row">
        <button type="button" class="btn btn-primary" id="bookSubmit">${icon('calendar')} Submit</button>
      </div>
      <p id="bookMsg" class="form-inline-msg"></p>
    </div></div>`;
  }

  const canApprove = role === 'admin' || role === 'doctor';

  // Doctor sees their own schedule with full action controls; admin sees all
  const tableTitle = role === 'doctor' ? 'My Appointment Schedule' : role === 'admin' ? 'All Appointments' : 'Appointments';
  const tableHint = role === 'doctor'
    ? `<p style="margin:.25rem 0 .75rem;font-size:.85rem;color:var(--gray-500)">Includes appointments where patients selected you or chose "Any available doctor". Use the actions to manage each visit.</p>`
    : role === 'admin'
      ? `<p style="margin:.25rem 0 .75rem;font-size:.85rem;color:var(--gray-500)">All clinic appointments. Accept, deny, mark done, or cancel each visit below.</p>`
      : '';

  const pendingRows = canApprove ? rows.filter((a) => (a.status || 'pending').toLowerCase() === 'pending') : [];
  const historyStatuses = new Set(['done', 'completed', 'cancelled', 'denied']);
  const activeRows = rows.filter((a) => !historyStatuses.has((a.status || 'pending').toLowerCase()));
  const historyRows = rows.filter((a) => historyStatuses.has((a.status || 'pending').toLowerCase()));
  const pendingApprovalPanel = canApprove ? `
    <div class="panel" style="margin-bottom:1.25rem;border-left:4px solid var(--teal-600,#0d9488)">
      <div class="panel-head"><h2>${icon('calendar')} Pending Approval <span style="background:var(--teal-600,#0d9488);color:#fff;border-radius:999px;padding:.15rem .55rem;font-size:.78rem;margin-left:.4rem">${pendingRows.length}</span></h2>${sourceText(data)}</div>
      <div class="panel-body">
        <p style="margin:.25rem 0 .75rem;font-size:.85rem;color:var(--gray-500)">${role === 'doctor' ? 'Appointment requests from your patients waiting for your approval.' : 'New appointment requests from patients waiting for clinic approval.'}</p>
        <div style="overflow-x:auto"><table class="data-table"><thead><tr>
          <th>Patient</th><th>Type</th><th>Date</th><th>Provider</th><th>Actions</th>
        </tr></thead><tbody>
          ${pendingRows.length ? pendingRows.map((a) => `<tr>
            <td><strong>${escapeHtml(a.patient_name || '-')}</strong>${a.patient_phone ? `<br><small style="color:var(--gray-500)">${escapeHtml(a.patient_phone)}</small>` : ''}</td>
            <td>${escapeHtml(a.type || '-')}</td>
            <td>${fmtDate(a.date)}</td>
            <td>${escapeHtml(a.doctor || '')}${!a.doctor ? '<span style="color:var(--gray-400);font-size:.82rem">Any / Unassigned</span>' : ''}</td>
            <td class="table-actions" style="white-space:nowrap">
              <button type="button" class="btn btn-primary btn-xs" data-approve="${a.id}">Accept</button>
              <button type="button" class="btn btn-outline btn-xs" data-deny="${a.id}">Deny</button>
            </td>
          </tr>`).join('') : emptyTableRow(5, 'No pending appointment requests.')}
        </tbody></table></div>
      </div>
    </div>` : '';

  el.innerHTML = bookForm + adminClosePanel + `
    ${canApprove ? `<div class="panel" style="margin-bottom:1.25rem"><div class="panel-head"><h2>Schedule calendar</h2>${sourceText(data)}</div><div class="panel-body schedule-calendar-stack" data-schedule-wrap>${renderCalendar(bookedRows, { unavailableDays, closedDays, canToggleUnavailable: role === 'doctor', canToggleClinicClosed: role === 'admin', monthKey })}</div></div>` : ''}
    ${pendingApprovalPanel}
    <div class="panel"><div class="panel-head"><h2>${tableTitle}</h2>${sourceText(data)}</div><div class="panel-body">${tableHint}<div style="overflow-x:auto"><table class="data-table"><thead><tr>
      ${role === 'patient' ? '<th>Doctor / Provider</th>' : '<th>Patient</th>'}<th>Type</th><th>Date</th>${role !== 'patient' ? '<th>Provider</th>' : ''}<th>Status</th>${canApprove ? '<th>Actions</th>' : ''}
    </tr></thead><tbody>
      ${activeRows.length ? activeRows.map((a) => {
        const s = (a.status || 'pending').toLowerCase();
        const isDone = s === 'done' || s === 'completed';
        const isCancelled = s === 'cancelled' || s === 'denied';
        const isConfirmed = s === 'confirmed';
        const isMoved = s === 'moved';
        const isPending = s === 'pending';
        const providerDisplay = a.doctor
          ? escapeHtml(a.doctor)
          : '<span style="color:var(--gray-400);font-style:italic">Assigned by clinic</span>';
        return `<tr>
          ${role === 'patient'
            ? `<td>${providerDisplay}</td>`
            : `<td><strong>${escapeHtml(a.patient_name || '-')}</strong>${a.patient_phone ? `<br><small style="color:var(--gray-500)">${escapeHtml(a.patient_phone)}</small>` : ''}</td>`
          }
          <td>${escapeHtml(a.type || '-')}</td>
          <td>${fmtDate(a.date)}</td>
          ${role !== 'patient' ? `<td>${escapeHtml(a.doctor || '')}${!a.doctor ? '<span style="color:var(--gray-400);font-size:.82rem">Any / Unassigned</span>' : ''}</td>` : ''}
          <td>${badge(a.status)}</td>
          ${canApprove ? `<td class="table-actions" style="white-space:nowrap">
            ${isPending ? `<button type="button" class="btn btn-primary btn-xs" data-approve="${a.id}">Accept</button>` : ''}
            ${(isPending || isConfirmed || isMoved) ? `<button type="button" class="btn btn-success btn-xs" data-done="${a.id}" title="Mark as completed">Done</button>` : ''}
            ${(isPending || isConfirmed || isMoved) ? `<button type="button" class="btn btn-outline btn-xs" data-move="${a.id}" title="Move this appointment">Move</button>` : ''}
            ${(!isDone && !isCancelled) ? `<button type="button" class="btn btn-outline btn-xs" data-deny="${a.id}">Deny</button>` : ''}
            ${(isConfirmed || isPending || isMoved) ? `<button type="button" class="btn btn-danger btn-xs" data-cancel="${a.id}" title="Cancel this appointment">Cancel</button>` : ''}
            ${isDone || isCancelled ? `<span style="color:var(--gray-400);font-size:.82rem">No actions</span>` : ''}
          </td>` : ''}
        </tr>`;
      }).join('') : emptyTableRow(canApprove ? (role === 'patient' ? 5 : 6) : (role === 'patient' ? 4 : 5), 'No active appointments.')}
    </tbody></table></div></div></div>
    <div class="panel" style="margin-top:1.25rem"><div class="panel-head"><h2>Appointment history</h2>${sourceText(data)}</div><div class="panel-body"><div style="overflow-x:auto"><table class="data-table"><thead><tr>
      ${role === 'patient' ? '<th>Doctor / Provider</th>' : '<th>Patient</th>'}<th>Type</th><th>Date</th>${role !== 'patient' ? '<th>Provider</th>' : ''}<th>Status</th>
    </tr></thead><tbody>
      ${historyRows.length ? historyRows.map((a) => {
        const providerDisplay = a.doctor
          ? escapeHtml(a.doctor)
          : '<span style="color:var(--gray-400);font-style:italic">Assigned by clinic</span>';
        return `<tr>
          ${role === 'patient'
            ? `<td>${providerDisplay}</td>`
            : `<td><strong>${escapeHtml(a.patient_name || '-')}</strong>${a.patient_phone ? `<br><small style="color:var(--gray-500)">${escapeHtml(a.patient_phone)}</small>` : ''}</td>`
          }
          <td>${escapeHtml(a.type || '-')}</td>
          <td>${fmtDate(a.date)}</td>
          ${role !== 'patient' ? `<td>${escapeHtml(a.doctor || '')}${!a.doctor ? '<span style="color:var(--gray-400);font-size:.82rem">Any / Unassigned</span>' : ''}</td>` : ''}
          <td>${badge(a.status)}</td>
        </tr>`;
      }).join('') : emptyTableRow(role === 'patient' ? 4 : 5, 'No appointment history yet.')}
    </tbody></table></div></div></div>`;

  async function submitBooking() {
    const type = document.getElementById('bookType').value;
    const date = document.getElementById('bookSlot').value;
    const notes = document.getElementById('bookNotes').value;
    const doctorSelect = document.getElementById('bookDoctor');
    const doctorId = doctorSelect.value;
    const doctorName = doctorSelect.selectedOptions[0]?.dataset.name || '';
    const msg = document.getElementById('bookMsg');
    if (!date) {
      msg.textContent = 'Please select date and time.';
      msg.className = 'form-inline-msg error';
      return;
    }
    const res = await api('/appointments', { method: 'POST', body: JSON.stringify({ type, date, notes, doctorId, doctorName }) });
    if (res?.slotTaken) {
      msg.textContent = 'This slot is already taken. Please choose another.';
      msg.className = 'form-inline-msg error';
      return;
    }
    const rawErr = res?.error || '';
    const friendlyErr = rawErr.includes('row-level security') || rawErr.includes('violates')
      ? 'Unable to book appointment. Please contact the clinic directly or try again later.'
      : rawErr;
    msg.textContent = friendlyErr || res?.message || 'Appointment request submitted.';
    msg.className = `form-inline-msg ${friendlyErr ? 'error' : 'success'}`;
    if (res?.appointment) {
      await refreshNotifications();
      setTimeout(() => navigate('appointments'), 800);
    }
  }

  function wireAvailabilityCalendar(nextRows = bookedRows) {
    document.querySelectorAll('[data-pick-date]').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.getElementById('bookDate').value = btn.dataset.pickDate;
        updateSlotOptions(nextRows, unavailableDays, document.getElementById('bookDoctor')?.value || '', closedDays);
      });
    });
    const availabilityBody = document.querySelector('[data-availability-body]');
    if (availabilityBody && availabilityBody.dataset.wiredPick !== '1') {
      availabilityBody.dataset.wiredPick = '1';
      availabilityBody.addEventListener('click', (event) => {
        const btn = event.target.closest('[data-pick-date]');
        if (!btn || btn.disabled) return;
        document.getElementById('bookDate').value = btn.dataset.pickDate;
        updateSlotOptions(nextRows, unavailableDays, document.getElementById('bookDoctor')?.value || '', closedDays);
      });
    }
  }

  function wireCalendarDayActions() {
    document.querySelectorAll('[data-rest-date]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const unavailable = !btn.classList.contains('active');
        const res = await api('/doctor/unavailable-days', { method: 'PATCH', body: JSON.stringify({ date: btn.dataset.restDate, unavailable }) });
        if (res?.error) {
          window.alert(res.error);
          return;
        }
        await navigate('appointments');
      });
    });

    document.querySelectorAll('[data-close-date]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const closed = !btn.classList.contains('active');
        const reason = closed ? window.prompt('Reason for closing the clinic on this date:', 'Clinic closed') : '';
        if (closed && reason === null) return;
        const res = await api('/clinic/closed-days', { method: 'PATCH', body: JSON.stringify({ date: btn.dataset.closeDate, closed, reason }) });
        if (res?.error) {
          window.alert(res.error);
          return;
        }
        await navigate('appointments');
      });
    });
  }

  async function reloadCalendarMonth(nextMonthKey) {
    state.calendarMonth = clampMonthKey(nextMonthKey);
    const doctorId = role === 'doctor' ? state.user.id : (document.getElementById('bookDoctor')?.value || '');
    const fresh = await api(availabilityPath(state.calendarMonth, doctorId));
    bookedRows = fresh?.appointments || [];
    unavailableDays = fresh?.unavailableDays || [];
    closedDays = fresh?.closedDays || [];

    const scheduleWrap = document.querySelector('[data-schedule-wrap]');
    if (scheduleWrap) {
      scheduleWrap.innerHTML = renderCalendar(bookedRows, {
        unavailableDays,
        closedDays,
        canToggleUnavailable: role === 'doctor',
        canToggleClinicClosed: role === 'admin',
        monthKey: state.calendarMonth,
      });
    }

    const availBody = document.querySelector('[data-availability-body]');
    if (availBody) {
      availBody.innerHTML = renderAvailabilityMonths(bookedRows, doctorId, unavailableDays, closedDays, state.calendarMonth);
    }

    wireCalendarMonthNavigation(reloadCalendarMonth);
    wireAvailabilityCalendar(bookedRows);
    wireCalendarDayActions();
    updateSlotOptions(bookedRows, unavailableDays, doctorId, closedDays);
  }

  function wireCalendarMonthNavigation(onMonthChange) {
    document.querySelectorAll('.calendar-month-nav').forEach((nav) => {
      const input = nav.querySelector('.calendar-month-input');
      if (!input || nav.dataset.wired === '1') return;
      nav.dataset.wired = '1';
      nav.querySelector('[data-cal-prev]')?.addEventListener('click', () => {
        onMonthChange(shiftMonthKey(input.value, -1));
      });
      nav.querySelector('[data-cal-next]')?.addEventListener('click', () => {
        onMonthChange(shiftMonthKey(input.value, 1));
      });
      input.addEventListener('change', () => {
        onMonthChange(clampMonthKey(input.value));
      });
    });
  }

  document.getElementById('bookDate')?.addEventListener('change', (event) => {
    const picked = event.target.value;
    if (picked && picked.slice(0, 7) !== state.calendarMonth) {
      reloadCalendarMonth(picked.slice(0, 7));
      return;
    }
    updateSlotOptions(bookedRows, unavailableDays, document.getElementById('bookDoctor')?.value || '', closedDays);
  });

  document.getElementById('bookDoctor')?.addEventListener('change', async (event) => {
    const doctorId = event.target.value;
    await reloadCalendarMonth(state.calendarMonth);
  });

  document.getElementById('adminCloseDate')?.addEventListener('change', (event) => {
    const picked = event.target.value;
    if (picked && picked.slice(0, 7) !== state.calendarMonth) {
      reloadCalendarMonth(picked.slice(0, 7));
    }
  });

  document.getElementById('adminCloseDateBtn')?.addEventListener('click', async () => {
    const date = document.getElementById('adminCloseDate')?.value;
    const reason = document.getElementById('adminCloseReason')?.value?.trim() || 'Clinic closed';
    const msg = document.getElementById('adminCloseDateMsg');
    if (!date) {
      msg.textContent = 'Choose a future date first.';
      msg.className = 'form-inline-msg error';
      return;
    }
    if (isPastDate(date)) {
      msg.textContent = 'Past dates cannot be closed.';
      msg.className = 'form-inline-msg error';
      return;
    }
    const res = await api('/clinic/closed-days', { method: 'PATCH', body: JSON.stringify({ date, closed: true, reason }) });
    msg.textContent = res?.error || `Clinic marked closed on ${date}.`;
    msg.className = `form-inline-msg ${res?.error ? 'error' : 'success'}`;
    if (!res?.error) {
      if (date.slice(0, 7) !== state.calendarMonth) await reloadCalendarMonth(date.slice(0, 7));
      else await reloadCalendarMonth(state.calendarMonth);
    }
  });

  wireCalendarMonthNavigation(reloadCalendarMonth);
  wireAvailabilityCalendar();
  wireCalendarDayActions();
  updateSlotOptions(bookedRows, unavailableDays, document.getElementById('bookDoctor')?.value || '', closedDays);
  document.getElementById('bookSubmit')?.addEventListener('click', submitBooking);

  document.querySelectorAll('[data-approve]').forEach((btn) => {
    btn.addEventListener('click', () => decideAppointment(btn.dataset.approve, 'confirmed'));
  });
  document.querySelectorAll('[data-deny]').forEach((btn) => {
    btn.addEventListener('click', () => decideAppointment(btn.dataset.deny, 'denied'));
  });
  document.querySelectorAll('[data-done]').forEach((btn) => {
    btn.addEventListener('click', () => decideAppointment(btn.dataset.done, 'done'));
  });
  document.querySelectorAll('[data-cancel]').forEach((btn) => {
    btn.addEventListener('click', () => decideAppointment(btn.dataset.cancel, 'cancelled'));
  });
  document.querySelectorAll('[data-move]').forEach((btn) => {
    btn.addEventListener('click', () => decideAppointment(btn.dataset.move, 'moved'));
  });
}

async function decideAppointment(id, status) {
  let reason = '';
  let newDate = '';
  if (status === 'denied') {
    reason = window.prompt('Please provide the reason for denial:') ?? '';
    if (!reason || reason.trim().length < 5) {
      window.alert('A clear denial reason is required.');
      return;
    }
  } else if (status === 'cancelled') {
    const response = window.prompt('Reason for cancelling this appointment (the patient will be notified):');
    if (response === null) return;
    reason = response;
    if (reason.trim().length < 3) {
      window.alert('A cancellation reason is required.');
      return;
    }
  } else if (status === 'done') {
    const confirmed = window.confirm('Mark this appointment as completed? This will be reflected on the patient\'s record.');
    if (!confirmed) return;
  } else if (status === 'moved') {
    const response = window.prompt('Enter the new appointment date and time (YYYY-MM-DD HH:MM):');
    if (response === null) return;
    const cleaned = response.trim().replace(' ', 'T');
    const parsed = new Date(cleaned);
    if (!cleaned || Number.isNaN(parsed.getTime())) {
      window.alert('Enter a valid date and time.');
      return;
    }
    newDate = cleaned.length === 16 ? cleaned : parsed.toISOString();
    reason = window.prompt('Reason or note for moving this appointment (optional):') ?? '';
  }
  const res = await api(`/appointments/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status, reason: reason.trim(), date: newDate }),
  });
  if (res?.error) {
    showAlert(res.error, 'error');
    return;
  }
  await refreshNotifications();
  await navigate('appointments');
}

async function renderPatients(el) {
  const data = await api('/patients');
  const rows = data?.patients || [];
  const createForm = state.user.role === 'admin' ? `<div class="panel appointment-panel"><div class="panel-head form-panel-head"><div><h2>Add patient account</h2><p>The patient will receive a temporary password by email.</p></div></div><div class="panel-body professional-form" id="patientAccountForm">
    <div class="form-field"><label for="patientFirst">First name</label><input type="text" id="patientFirst" /></div>
    <div class="form-field"><label for="patientMiddle">Middle name</label><input type="text" id="patientMiddle" /></div>
    <div class="form-field"><label for="patientLast">Last name</label><input type="text" id="patientLast" /></div>
    <div class="form-field"><label for="patientPhone">Phone</label><input type="tel" id="patientPhone" placeholder="09XXXXXXXXX" /></div>
    <div class="form-field form-field-wide"><label for="patientEmail">Email</label><input type="email" id="patientEmail" /></div>
    <div class="form-actions-row"><button type="button" class="btn btn-primary" id="patientCreate">${icon('users')} Create patient account</button></div>
    <p id="patientCreateMsg" class="form-inline-msg"></p>
  </div></div>` : '';
  el.innerHTML = createForm + `<div class="panel"><div class="panel-head"><h2>Patient registry</h2>${sourceText(data)}</div>
    <div class="panel-body" style="overflow-x:auto"><table class="data-table"><thead><tr><th>Name</th><th>Status</th><th>Room</th><th>Trimester</th><th>Provider</th><th>Phone</th></tr></thead><tbody>
      ${rows.length ? rows.map((p) => `<tr><td><strong>${p.name || '-'}</strong><br><small>${p.email || ''}</small></td><td>${badge(p.status)}</td><td>${p.room || '-'}</td><td>${p.trimester || '-'}</td><td>${p.doctor || '-'}</td><td>${p.phone || '-'}</td></tr>`).join('') : emptyTableRow(6)}
    </tbody></table></div></div>`;
  document.getElementById('patientCreate')?.addEventListener('click', async () => {
    await createAdminAccount({
      role: 'patient',
      firstName: document.getElementById('patientFirst').value,
      middleName: document.getElementById('patientMiddle').value,
      lastName: document.getElementById('patientLast').value,
      phone: document.getElementById('patientPhone').value,
      email: document.getElementById('patientEmail').value,
    }, 'patientCreateMsg', 'patients');
  });
}

async function renderDeliveries(el) {
  const data = await api('/deliveries');
  const rows = data?.deliveries || [];
  el.innerHTML = `<div class="panel"><div class="panel-head"><h2>Delivery schedule</h2>${sourceText(data)}</div><div class="panel-body"><table class="data-table"><thead><tr><th>Patient</th><th>Date</th><th>Type</th><th>Status</th></tr></thead><tbody>
    ${rows.length ? rows.map((d) => `<tr><td>${d.patient_name || '-'}</td><td>${d.date || '-'}</td><td>${d.type || '-'}</td><td>${badge(d.status)}</td></tr>`).join('') : emptyTableRow(4)}
  </tbody></table></div></div>`;
}

function renderDoctorPatientPicker(patients) {
  return `<div class="panel appointment-panel" id="doctorPatientPicker">
    <div class="panel-head form-panel-head"><div><h2>Send medical result</h2><p>Search for a patient by name, email, or phone number, then upload the PDF result.</p></div></div>
    <div class="panel-body professional-form">
      <div class="form-field form-field-wide">
        <label for="recordPatientSearch">Patient</label>
        <div class="patient-combobox" id="patientCombobox">
          <div class="patient-combobox-input-wrap">
            <input
              type="search"
              id="recordPatientSearch"
              class="patient-combobox-input"
              placeholder="Type a name, email, or phone…"
              autocomplete="off"
              aria-autocomplete="list"
              aria-expanded="false"
              aria-controls="patientDropdown"
              aria-haspopup="listbox"
              role="combobox"
            />
            <span class="patient-combobox-chevron" aria-hidden="true">▾</span>
          </div>
          <ul class="patient-dropdown" id="patientDropdown" role="listbox" hidden></ul>
        </div>
        <div class="patient-selected-row" id="patientSelectedRow" hidden>
          <span class="patient-selected-chip" id="patientSelectedChip"></span>
          <button type="button" class="patient-clear-btn" id="patientClearBtn" aria-label="Clear selection">✕</button>
          <button type="button" class="btn btn-outline btn-xs" id="recordMessagePatient" disabled>${icon('message')} Message</button>
        </div>
      </div>
      <input type="hidden" id="recordPatient" value="" />
      <div class="form-field"><label for="recordType">Result type</label><select id="recordType">
        <option value="Check up">Check up</option>
        <option value="OB consultation">OB consultation</option>
        <option value="Prenatal checkup">Prenatal checkup</option>
        <option value="Ultrasound result">Ultrasound result</option>
        <option value="Laboratory result">Laboratory result</option>
        <option value="Medical certificate">Medical certificate</option>
        <option value="Medical Result">Other medical result</option>
      </select></div>
      <div class="form-field form-field-wide"><label for="recordSummaryNotes">Summary/Notes</label><textarea id="recordSummaryNotes" rows="4" placeholder="Write the result summary and any notes for the patient"></textarea></div>
      <div class="form-field form-field-wide"><label for="recordPdf">PDF file</label><input type="file" id="recordPdf" accept="application/pdf" /></div>
      <div class="form-actions-row"><button type="button" class="btn btn-primary" id="recordSubmit">${icon('file')} Send result</button></div>
      <p id="recordMsg" class="form-inline-msg"></p>
    </div>
  </div>`;
}

function wireDoctorPatientPicker(patients) {
  const hidden = document.getElementById('recordPatient');
  const searchInput = document.getElementById('recordPatientSearch');
  const dropdown = document.getElementById('patientDropdown');
  const selectedRow = document.getElementById('patientSelectedRow');
  const selectedChip = document.getElementById('patientSelectedChip');
  const clearBtn = document.getElementById('patientClearBtn');
  const messageButton = document.getElementById('recordMessagePatient');
  if (!hidden || !searchInput || !dropdown) return;

  // Build a normalised index for fast filtering
  const index = patients.map((p) => ({
    id: p.profile_id || p.id,
    name: p.name || 'Patient',
    sub: p.email || p.phone || '',
    isMine: !!p.is_my_patient,
    search: normalizeSearch(`${p.name || ''} ${p.email || ''} ${p.phone || ''}`),
  }));

  let activeIdx = -1;

  function openDropdown(filtered) {
    if (!filtered.length) {
      dropdown.innerHTML = '<li class="patient-dropdown-empty" role="option" aria-disabled="true">No patients match your search.</li>';
    } else {
      dropdown.innerHTML = filtered.map((p, i) =>
        `<li class="patient-dropdown-item${p.isMine ? ' is-mine' : ''}" role="option" data-patient-id="${p.id}" data-idx="${i}" tabindex="-1">
          <span class="pdrop-name">${escapeHtml(p.name)}</span>
          <span class="pdrop-sub">${escapeHtml(p.sub)}</span>
          ${p.isMine ? '<em class="pdrop-mine">My patient</em>' : ''}
        </li>`
      ).join('');
      dropdown.querySelectorAll('.patient-dropdown-item').forEach((item) => {
        item.addEventListener('mousedown', (e) => {
          e.preventDefault(); // keep focus on input
          selectPatient(item.dataset.patientId, item.querySelector('.pdrop-name')?.textContent || 'Patient');
        });
      });
    }
    dropdown.hidden = false;
    searchInput.setAttribute('aria-expanded', 'true');
    activeIdx = -1;
  }

  function closeDropdown() {
    dropdown.hidden = true;
    searchInput.setAttribute('aria-expanded', 'false');
    activeIdx = -1;
  }

  function filterAndOpen() {
    const q = normalizeSearch(searchInput.value);
    const terms = q.split(' ').filter(Boolean);
    const filtered = index.filter((p) =>
      !terms.length || terms.every((t) => p.search.includes(t))
    );
    openDropdown(filtered);
  }

  function selectPatient(id, name) {
    hidden.value = id;
    searchInput.value = name;
    selectedChip.textContent = name;
    selectedRow.hidden = false;
    searchInput.setAttribute('aria-expanded', 'false');
    if (messageButton) messageButton.disabled = !id;
    closeDropdown();
  }

  function clearSelection() {
    hidden.value = '';
    searchInput.value = '';
    selectedRow.hidden = true;
    if (messageButton) messageButton.disabled = true;
    closeDropdown();
    searchInput.focus();
  }

  // Show all patients on focus/click when input is empty
  searchInput.addEventListener('focus', () => {
    filterAndOpen();
  });
  searchInput.addEventListener('click', () => {
    if (dropdown.hidden) filterAndOpen();
  });
  searchInput.addEventListener('input', filterAndOpen);

  // Keyboard navigation
  searchInput.addEventListener('keydown', (e) => {
    const items = [...dropdown.querySelectorAll('.patient-dropdown-item')];
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      activeIdx = Math.min(activeIdx + 1, items.length - 1);
      items[activeIdx]?.focus();
    } else if (e.key === 'Escape') {
      closeDropdown();
    } else if (e.key === 'Enter' && activeIdx >= 0) {
      e.preventDefault();
      const item = items[activeIdx];
      if (item) selectPatient(item.dataset.patientId, item.querySelector('.pdrop-name')?.textContent || 'Patient');
    }
  });

  dropdown.addEventListener('keydown', (e) => {
    const items = [...dropdown.querySelectorAll('.patient-dropdown-item')];
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      activeIdx = Math.min(activeIdx + 1, items.length - 1);
      items[activeIdx]?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      activeIdx = Math.max(activeIdx - 1, 0);
      if (activeIdx === 0 && items.length) items[0]?.focus();
      else items[activeIdx]?.focus();
    } else if (e.key === 'Escape') {
      closeDropdown();
      searchInput.focus();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const focused = document.activeElement;
      if (focused?.dataset?.patientId) {
        selectPatient(focused.dataset.patientId, focused.querySelector('.pdrop-name')?.textContent || 'Patient');
        searchInput.focus();
      }
    }
  });

  // Close when clicking outside
  document.addEventListener('click', (e) => {
    if (!document.getElementById('patientCombobox')?.contains(e.target)) {
      closeDropdown();
    }
  }, true);

  clearBtn?.addEventListener('click', clearSelection);

  messageButton?.addEventListener('click', async () => {
    if (!hidden.value) return;
    state.selectedMessagePeer = hidden.value;
    await navigate('messages');
  });
}
async function renderRecords(el) {
  const data = await api('/records');
  const rows = data?.records || [];
  const medicationData = state.user.role === 'patient' ? await api('/medications') : { medications: [] };
  const medications = medicationData?.medications || [];
  let uploadForm = '';
  let doctorPatients = [];
  const canSendRecords = ['doctor', 'admin'].includes(effectiveRole(state.user));
  if (canSendRecords) {
    const patientsData = await api('/patients');
    doctorPatients = patientsData?.patients || [];
    uploadForm = renderDoctorPatientPicker(doctorPatients);
    if (patientsData?.error) {
      uploadForm = `<div class="panel"><div class="panel-body"><p class="form-inline-msg error">${escapeHtml(patientsData.error)}</p></div></div>${uploadForm}`;
    }
  }
  const medicationPanel = state.user.role === 'patient' ? `<div class="panel"><div class="panel-head"><h2>Doctor medication notes</h2>${sourceText(medicationData)}</div><div class="panel-body" style="overflow-x:auto"><table class="data-table"><thead><tr><th>Medication</th><th>Dosage</th><th>Status</th><th>Doctor</th></tr></thead><tbody>
    ${medications.length ? medications.map((m) => `<tr><td>${escapeHtml(m.name || '-')}</td><td>${escapeHtml(m.dosage || '-')}</td><td>${badge(m.status || 'active')}</td><td>${escapeHtml(m.provider || '-')}</td></tr>`).join('') : emptyTableRow(4, 'No medication information from your doctor yet.')}
  </tbody></table></div></div>` : '';
  el.innerHTML = uploadForm + `<div class="panel"><div class="panel-head"><h2>Medical records</h2>${sourceText(data)}</div><div class="panel-body"><table class="data-table"><thead><tr><th>Patient</th><th>Type</th><th>Diagnosis</th><th>Treatment</th><th>File</th><th>Date</th><th>Provider</th></tr></thead><tbody>
    ${rows.length ? rows.map((r) => `<tr><td>${escapeHtml(r.patient_name || '-')}</td><td>${escapeHtml(r.type || '-')}</td><td>${escapeHtml(r.diagnosis || '-')}</td><td>${escapeHtml(r.treatment || '-')}</td><td><button type="button" class="btn btn-outline btn-xs" data-record-id="${r.id}">Open</button></td><td>${fmtDate(r.date || r.created_at)}</td><td>${escapeHtml(r.provider || '-')}</td></tr>`).join('') : emptyTableRow(7)}
  </tbody></table></div></div>${medicationPanel}`;
  document.querySelectorAll('[data-record-id]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const record = rows.find((item) => item.id === btn.dataset.recordId);
      if (record) showRecordModal(record);
    });
  });
  if (state.pendingRecordId) {
    const record = rows.find((item) => item.id === state.pendingRecordId);
    state.pendingRecordId = null;
    if (record) showRecordModal(record);
  }
  if (canSendRecords) {
    wireDoctorPatientPicker(doctorPatients);
  }

  document.getElementById('recordSubmit')?.addEventListener('click', async () => {
    const msg = document.getElementById('recordMsg');
    const file = document.getElementById('recordPdf').files[0];
    const patientId = document.getElementById('recordPatient')?.value || '';
    if (!patientId) {
      msg.textContent = 'Select a patient from the list first.';
      msg.className = 'form-inline-msg error';
      return;
    }
    const payload = {
      patientId,
      recordType: document.getElementById('recordType').value,
      diagnosis: document.getElementById('recordSummaryNotes').value,
      treatment: '',
      fileName: file?.name || '',
      fileData: '',
    };
    if (file) {
      payload.fileData = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.readAsDataURL(file);
      });
    }
    const res = await api('/records', { method: 'POST', body: JSON.stringify(payload) });
    msg.textContent = res?.error || 'Medical result sent to the patient portal.';
    msg.className = `form-inline-msg ${res?.error ? 'error' : 'success'}`;
    if (!res?.error) setTimeout(() => navigate('records'), 900);
  });
}

function showRecordModal(record) {
  let modal = document.getElementById('recordModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'recordModal';
    modal.className = 'modal-backdrop';
    modal.innerHTML = `
      <div class="record-modal" role="dialog" aria-modal="true" aria-labelledby="recordModalTitle">
        <div class="record-modal-head">
          <h2 id="recordModalTitle">Medical record</h2>
          <button type="button" class="modal-close" id="recordModalClose" aria-label="Close">&times;</button>
        </div>
        <div class="record-modal-body" id="recordModalBody"></div>
      </div>`;
    document.body.appendChild(modal);
    document.getElementById('recordModalClose')?.addEventListener('click', () => {
      modal.hidden = true;
    });
    modal.addEventListener('click', (event) => {
      if (event.target === modal) modal.hidden = true;
    });
  }

  document.getElementById('recordModalTitle').textContent = record.type || 'Medical record';
  document.getElementById('recordModalBody').innerHTML = `
    <div class="record-detail-grid">
      <div><span>Patient</span><strong>${escapeHtml(record.patient_name || '-')}</strong></div>
      <div><span>Date</span><strong>${fmtDate(record.date || record.created_at)}</strong></div>
      <div><span>Provider</span><strong>${escapeHtml(record.provider || '-')}</strong></div>
      <div><span>File</span><strong>${escapeHtml(record.file_name || 'No file attached')}</strong></div>
    </div>
    <div class="record-note"><span>Summary</span><p>${escapeHtml(record.diagnosis || '-')}</p></div>
    <div class="record-note"><span>Notes</span><p>${escapeHtml(record.treatment || '-')}</p></div>
    ${record.file_data ? `<iframe class="record-pdf-frame" src="${record.file_data}" title="${escapeHtml(record.file_name || 'Medical result')}"></iframe>` : '<p class="empty-state compact">No PDF file was attached to this record.</p>'}`;
  modal.hidden = false;
}

async function renderLab(el) {
  const data = await api('/lab');
  const rows = data?.results || [];
  el.innerHTML = `<div class="panel"><div class="panel-head"><h2>Laboratory and diagnostics</h2>${sourceText(data)}</div><div class="panel-body"><table class="data-table"><thead><tr><th>Patient</th><th>Test</th><th>Status</th><th>Result</th><th>Date</th></tr></thead><tbody>
    ${rows.length ? rows.map((l) => `<tr><td>${l.patient_name || '-'}</td><td>${l.test_name || '-'}</td><td>${badge(l.status)}</td><td>${l.result || 'Pending'}</td><td>${fmtDate(l.date)}</td></tr>`).join('') : emptyTableRow(5)}
  </tbody></table></div></div>`;
}

async function renderStaff(el) {
  const data = await api('/staff');
  const rows = data?.staff || [];
  const createForm = state.user.role === 'admin' ? `<div class="panel appointment-panel"><div class="panel-head form-panel-head"><div><h2>Add staff account</h2><p>Create a doctor or admin account and email the temporary password.</p></div></div><div class="panel-body professional-form" id="staffAccountForm">
    <div class="form-field"><label for="staffRoleCreate">Role</label><select id="staffRoleCreate"><option value="doctor">Doctor</option><option value="admin">Admin</option></select></div>
    <div class="form-field"><label for="staffFirst">First name</label><input type="text" id="staffFirst" /></div>
    <div class="form-field"><label for="staffMiddle">Middle name</label><input type="text" id="staffMiddle" /></div>
    <div class="form-field"><label for="staffLast">Last name</label><input type="text" id="staffLast" /></div>
    <div class="form-field"><label for="staffPhone">Phone</label><input type="tel" id="staffPhone" placeholder="09XXXXXXXXX" /></div>
    <div class="form-field"><label for="staffEmail">Email</label><input type="email" id="staffEmail" /></div>
    <div class="form-actions-row"><button type="button" class="btn btn-primary" id="staffCreate">${icon('staff')} Create account</button></div>
    <p id="staffCreateMsg" class="form-inline-msg"></p>
  </div></div>` : '';
  el.innerHTML = createForm + `<div class="panel"><div class="panel-head"><h2>Clinical and administrative staff</h2>${sourceText(data)}</div><div class="panel-body"><table class="data-table"><thead><tr><th>Name</th><th>Role</th><th>Department</th><th>Shift</th><th>Status</th></tr></thead><tbody>
    ${rows.length ? rows.map((s) => `<tr><td>${s.name || '-'}</td><td>${s.role || '-'}</td><td>${s.department || '-'}</td><td>${s.shift || '-'}</td><td>${badge(s.status)}</td></tr>`).join('') : emptyTableRow(5)}
  </tbody></table></div></div>`;
  document.getElementById('staffCreate')?.addEventListener('click', async () => {
    await createAdminAccount({
      role: document.getElementById('staffRoleCreate').value,
      firstName: document.getElementById('staffFirst').value,
      middleName: document.getElementById('staffMiddle').value,
      lastName: document.getElementById('staffLast').value,
      phone: document.getElementById('staffPhone').value,
      email: document.getElementById('staffEmail').value,
    }, 'staffCreateMsg', 'staff');
  });
}

async function createAdminAccount(payload, messageId, refreshSection) {
  const msg = document.getElementById(messageId);
  msg.textContent = 'Creating account...';
  msg.className = 'form-inline-msg';
  const res = await api('/admin/accounts', { method: 'POST', body: JSON.stringify(payload) });
  msg.textContent = res?.error || res?.message || 'Account created and email sent.';
  msg.className = `form-inline-msg ${res?.error ? 'error' : 'success'}`;
  if (!res?.error) setTimeout(() => navigate(refreshSection), 900);
}

async function renderMessages(el) {
  const contactsData = await api('/messages/contacts');
  const contacts = contactsData?.contacts || [];
  const noContactsMessage = contactsData?.message || 'No matching contacts.';
  const search = normalizeSearch(state.messageSearch);
  const searchTerms = search.split(' ').filter(Boolean);
  const filteredContacts = contacts.filter((contact) => {
    const haystack = normalizeSearch(`${contact.name || ''} ${contact.email || ''} ${contact.role || ''}`);
    return !searchTerms.length || searchTerms.every((term) => haystack.includes(term));
  });
  if (!state.selectedMessagePeer && filteredContacts.length) state.selectedMessagePeer = filteredContacts[0].id;
  const active = filteredContacts.find((contact) => contact.id === state.selectedMessagePeer) || filteredContacts[0] || null;
  if (active) state.selectedMessagePeer = active.id;
  const data = active ? await api(`/messages?peerId=${encodeURIComponent(active.id)}`) : { messages: [] };
  const rows = data?.messages || [];
  el.innerHTML = `<div class="messenger-shell">
    <aside class="messenger-contacts">
      <div class="messenger-title">Conversations</div>
      <div class="messenger-search"><input type="search" id="messageSearch" placeholder="Search names" value="${escapeHtml(state.messageSearch)}" /></div>
      ${filteredContacts.length ? filteredContacts.map((contact) => `<button type="button" class="contact-item ${active?.id === contact.id ? 'active' : ''}" data-contact-id="${contact.id}">
        <strong>${escapeHtml(contact.name || contact.email)}</strong>
        <span>${escapeHtml(contact.role || '')}</span>
      </button>`).join('') : `<p class="empty-state compact">${escapeHtml(noContactsMessage)}</p>`}
    </aside>
    <section class="messenger-chat">
      <div class="chat-head">
        <div><strong>${active ? escapeHtml(active.name) : 'Messages'}</strong><span>${active ? escapeHtml(active.role) : 'Choose a contact'}</span></div>
      </div>
      <div class="chat-thread" id="chatThread">
        ${active ? (rows.length ? rows.map((m) => {
          const mine = m.sender_id === state.user.id;
          return `<div class="chat-bubble ${mine ? 'mine' : 'theirs'}">
            <button type="button" class="message-delete" data-message-id="${m.id}" aria-label="Delete message">&times;</button>
            <div>${escapeHtml(m.body || m.preview || '')}</div>
            <small>${fmtDate(m.created_at || m.time)}</small>
          </div>`;
        }).join('') : '<p class="empty-state compact">No messages yet.</p>') : '<p class="empty-state compact">Select a person to start messaging.</p>'}
      </div>
      <div class="chat-compose">
        <textarea id="chatMessage" rows="2" placeholder="Type a message" ${active ? '' : 'disabled'}></textarea>
        <button type="button" class="btn btn-primary" id="chatSend" ${active ? '' : 'disabled'}>${icon('message')} Send</button>
      </div>
      <p id="chatMsg" class="form-inline-msg"></p>
    </section>
  </div>`;
  document.getElementById('messageSearch')?.addEventListener('input', async (event) => {
    state.messageSearch = event.target.value;
    await renderMessages(el);
    const input = document.getElementById('messageSearch');
    input?.focus();
    input?.setSelectionRange(input.value.length, input.value.length);
  });
  document.querySelectorAll('[data-contact-id]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      state.selectedMessagePeer = btn.dataset.contactId;
      await navigate('messages');
    });
  });
  document.querySelectorAll('[data-message-id]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!window.confirm('Delete this message?')) return;
      const msg = document.getElementById('chatMsg');
      const res = await api(`/messages/${encodeURIComponent(btn.dataset.messageId)}`, { method: 'DELETE', body: JSON.stringify({}) });
      msg.textContent = res?.error || '';
      msg.className = `form-inline-msg ${res?.error ? 'error' : 'success'}`;
      if (!res?.error) await navigate('messages');
    });
  });
  document.getElementById('chatSend')?.addEventListener('click', async () => {
    const body = document.getElementById('chatMessage').value.trim();
    const msg = document.getElementById('chatMsg');
    const res = await api('/messages', { method: 'POST', body: JSON.stringify({ recipientId: state.selectedMessagePeer, body }) });
    msg.textContent = res?.error || '';
    msg.className = `form-inline-msg ${res?.error ? 'error' : 'success'}`;
    if (!res?.error) {
      document.getElementById('chatMessage').value = '';
      await refreshNotifications();
      await navigate('messages');
    }
  });
  const thread = document.getElementById('chatThread');
  if (thread) thread.scrollTop = thread.scrollHeight;
}

async function renderReports(el) {
  const data = await api('/reports/summary');
  const visits = data?.monthlyVisits || [];
  const labels = data?.monthlyLabels || visits.map((_, i) => `Month ${i + 1}`);
  const dt = data?.deliveryTypes || { normal: 0, cesarean: 0, assisted: 0 };
  el.innerHTML = `<div class="stat-grid">${statCard('Patient satisfaction', (data?.satisfaction || 0) + '%', 'heart')}${statCard('Ward occupancy', (data?.occupancy || 0) + '%', 'monitor')}</div>
    <div class="panel-grid"><div class="panel"><div class="panel-head"><h2>Monthly visits</h2></div><div class="panel-body chart-wrap"><canvas id="chartVisits"></canvas></div></div><div class="panel"><div class="panel-head"><h2>Delivery types (%)</h2></div><div class="panel-body chart-wrap"><canvas id="chartDelivery"></canvas></div></div></div>`;
  if (typeof Chart !== 'undefined') {
    new Chart(document.getElementById('chartVisits'), { type: 'line', data: { labels, datasets: [{ label: 'Visits', data: visits, borderColor: '#0f766e', tension: 0.25, fill: false }] }, options: { responsive: true, maintainAspectRatio: false } });
    new Chart(document.getElementById('chartDelivery'), { type: 'doughnut', data: { labels: ['Normal', 'Cesarean', 'Assisted'], datasets: [{ data: [dt.normal, dt.cesarean, dt.assisted], backgroundColor: ['#0f766e', '#1d4ed8', '#b45309'] }] }, options: { responsive: true, maintainAspectRatio: false } });
  }
}

async function renderSecurity(el) {
  let auditHtml = '<p class="empty-state">No live audit logs available.</p>';
  const audit = await fetch('/api/audit', { headers: getAuthHeaders() }).catch(() => null);
  if (audit?.ok) {
    const d = await audit.json();
    const logs = d.logs || [];
    if (logs.length) {
      auditHtml = `<table class="data-table"><thead><tr><th>Action</th><th>User</th><th>Time</th></tr></thead><tbody>${logs.slice(0, 15).map((l) => `<tr><td>${l.action}</td><td>${l.profiles?.email || l.user_id || '-'}</td><td>${fmtDate(l.created_at)}</td></tr>`).join('')}</tbody></table>`;
    }
  }
  el.innerHTML = `<div class="security-grid">
    <div class="security-item"><strong>Role-based access</strong><span>Admin, Doctor, Nurse, Staff, Patient</span></div>
    <div class="security-item"><strong>Two-factor auth</strong><span>OTP via email when enabled on profile</span></div>
    <div class="security-item"><strong>Login message</strong><span>Incorrect sign-ins show a simple email or password error</span></div>
    <div class="security-item"><strong>Appointment conflict control</strong><span>Approved doctor schedules cannot overlap at the same time.</span></div>
  </div><div class="panel" style="margin-top:1.25rem"><div class="panel-head"><h2>Audit log</h2></div><div class="panel-body">${auditHtml}</div></div>`;
}

async function renderMedications(el) {
  const data = await api('/medications');
  const rows = data?.medications || [];
  el.innerHTML = `<div class="panel"><div class="panel-head"><h2>Current medications</h2>${sourceText(data)}</div><div class="panel-body"><table class="data-table"><thead><tr><th>Medication</th><th>Dosage</th><th>Patient</th><th>Status</th></tr></thead><tbody>
    ${rows.length ? rows.map((m) => `<tr><td>${m.name || '-'}</td><td>${m.dosage || '-'}</td><td>${m.patient_name || '-'}</td><td>${badge(m.status)}</td></tr>`).join('') : emptyTableRow(4)}
  </tbody></table></div></div>`;
}

async function renderFeedback(el) {
  const role = state.user.role;
  const data = await api('/feedback');
  const rows = data?.feedback || [];
  const doctors = role === 'patient' ? await ensureDoctors() : [];
  const form = role === 'patient' ? `
    <div class="panel appointment-panel"><div class="panel-head form-panel-head"><div><h2>Share feedback</h2><p>Help the clinic review and improve patient service.</p></div></div><div class="panel-body professional-form">
      <div class="form-field"><label for="feedbackRating">Rating</label><select id="feedbackRating"><option value="5">5 - Excellent</option><option value="4">4 - Good</option><option value="3">3 - Fair</option><option value="2">2 - Needs improvement</option><option value="1">1 - Poor</option></select></div>
      <div class="form-field"><label for="feedbackDoctor">Doctor</label><select id="feedbackDoctor"><option value="">Clinic service</option>${doctors.map((d) => `<option value="${d.id}">${d.name}</option>`).join('')}</select></div>
      <div class="form-field form-field-wide"><label for="feedbackComment">Comment</label><textarea id="feedbackComment" rows="4"></textarea></div>
      <label class="check-line"><input type="checkbox" id="feedbackPublic" checked /> Display this review on the home page</label>
      <div class="form-actions-row"><button type="button" class="btn btn-primary" id="feedbackSubmit">${icon('heart')} Submit feedback</button></div>
      <p id="feedbackMsg" class="form-inline-msg"></p>
    </div></div>` : '';

  el.innerHTML = form + `<div class="panel"><div class="panel-head"><h2>Feedback records</h2>${sourceText(data)}</div><div class="panel-body" style="overflow-x:auto"><table class="data-table"><thead><tr><th>Patient</th><th>Rating</th><th>Comment</th><th>Public</th><th>Status</th></tr></thead><tbody>
    ${rows.length ? rows.map((f) => `<tr><td>${f.patient_name || '-'}</td><td>${'&#9733;'.repeat(f.rating || 0)}</td><td>${f.comment || '-'}</td><td>${f.is_public ? 'Yes' : 'No'}</td><td>${badge(f.is_public ? 'published' : 'stored')}</td></tr>`).join('') : emptyTableRow(5)}
  </tbody></table></div></div>`;

  document.getElementById('feedbackSubmit')?.addEventListener('click', async () => {
    const payload = {
      rating: Number(document.getElementById('feedbackRating').value),
      doctorId: document.getElementById('feedbackDoctor').value,
      comment: document.getElementById('feedbackComment').value,
      isPublic: document.getElementById('feedbackPublic').checked,
    };
    const msg = document.getElementById('feedbackMsg');
    const res = await api('/feedback', { method: 'POST', body: JSON.stringify(payload) });
    msg.textContent = res?.error || 'Feedback submitted.';
    msg.className = `form-inline-msg ${res?.error ? 'error' : 'success'}`;
    if (!res?.error) setTimeout(() => navigate('feedback'), 800);
  });
}

async function renderProfile(el) {
  const u = state.user;
  const history = await api('/me/login-history');
  const logins = history?.logins || [];
  const passwordNotice = u.mustChangePassword ? `<div class="security-banner password-required"><strong>Password change required</strong> Your temporary password expires on ${fmtDate(u.temporaryPasswordExpiresAt)}. Change it now to keep access to your account.</div>` : '';
  el.innerHTML = `${passwordNotice}<div class="settings-grid">
    <div class="panel"><div class="panel-head"><h2>Personal details</h2></div><div class="panel-body settings-form">
      <div class="profile-photo-preview">${u.profilePhotoUrl ? `<img src="${u.profilePhotoUrl}" alt="" />` : `${(u.firstName || u.email || 'U').slice(0, 1).toUpperCase()}`}</div>
      <button class="btn btn-outline btn-sm" id="profileEdit" type="button">Edit</button>
      <label>Profile photo <input type="file" id="profilePhoto" accept="image/*" disabled /></label>
      <label>First name <input type="text" id="profileFirst" value="${u.firstName || ''}" readonly /></label>
      <label>Middle name <input type="text" id="profileMiddle" value="${u.middleName || ''}" readonly /></label>
      <label>Last name <input type="text" id="profileLast" value="${u.lastName || ''}" readonly /></label>
      <label>Phone <input type="tel" id="profilePhone" value="${u.phone || ''}" readonly /></label>
      <div class="readonly-line"><span>Email</span><strong>${u.email || '-'}</strong></div>
      <div class="readonly-line"><span>Role</span><strong>${roleLabel(u.role)}</strong></div>
      <button class="btn btn-primary" id="profileSave" hidden>Save profile</button>
      <p id="profileMsg" class="form-inline-msg"></p>
    </div></div>
    <div class="panel"><div class="panel-head"><h2>Change password</h2></div><div class="panel-body settings-form password-flow">
      <div class="step-pill">Step 1</div>
      <label>New password <input type="password" id="newPassword" autocomplete="new-password" /></label>
      <button class="btn btn-outline" id="passwordRequest">Send email code</button>
      <div id="passwordOtpStep" class="password-otp-step" hidden>
        <div class="step-pill">Step 2</div>
        <label>Email OTP code <input type="text" id="passwordCode" inputmode="numeric" maxlength="6" autocomplete="one-time-code" /></label>
        <button class="btn btn-primary" id="passwordConfirm">Verify code and change password</button>
      </div>
      <p id="passwordMsg" class="form-inline-msg"></p>
    </div></div>
    <div class="panel" style="grid-column:1/-1"><div class="panel-head"><h2>Recent login history</h2>${sourceText(history)}</div><div class="panel-body" style="overflow-x:auto"><table class="data-table"><thead><tr><th>Date and time</th><th>Status</th><th>IP address</th><th>Device</th></tr></thead><tbody>
      ${logins.length ? logins.map((l) => `<tr><td>${fmtDate(l.created_at)}</td><td>${l.success ? badge('success') : badge('failed')}</td><td>${l.ip_address || '-'}</td><td>${l.device || '-'}</td></tr>`).join('') : emptyTableRow(4, 'No login history yet.')}
    </tbody></table></div></div>
  </div>`;

  let photoData = u.profilePhotoUrl || '';
  document.getElementById('profileEdit')?.addEventListener('click', () => {
    ['profilePhoto', 'profilePhone', 'profileFirst', 'profileMiddle', 'profileLast'].forEach((id) => {
      const field = document.getElementById(id);
      if (!field) return;
      field.disabled = false;
      field.readOnly = false;
    });
    document.getElementById('profileSave').hidden = false;
    document.getElementById('profileEdit').hidden = true;
  });
  document.getElementById('profilePhoto')?.addEventListener('change', (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const msg = document.getElementById('profileMsg');
    if (file.size > 750000) {
      msg.textContent = 'Choose an image under 750 KB.';
      msg.className = 'form-inline-msg error';
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      photoData = String(reader.result || '');
      document.querySelector('.profile-photo-preview').innerHTML = `<img src="${photoData}" alt="" />`;
    };
    reader.readAsDataURL(file);
  });

  document.getElementById('profileSave')?.addEventListener('click', async () => {
    const payload = {
      firstName: document.getElementById('profileFirst').value,
      middleName: document.getElementById('profileMiddle').value,
      lastName: document.getElementById('profileLast').value,
      phone: document.getElementById('profilePhone').value,
      profilePhotoUrl: photoData,
    };
    const msg = document.getElementById('profileMsg');
    const res = await api('/me', { method: 'PATCH', body: JSON.stringify(payload) });
    msg.textContent = res?.error || 'Profile updated.';
    msg.className = `form-inline-msg ${res?.error ? 'error' : 'success'}`;
    if (res?.user) {
      state.user = res.user;
      renderShell();
    }
  });

  document.getElementById('passwordRequest')?.addEventListener('click', async () => {
    const msg = document.getElementById('passwordMsg');
    const res = await api('/me/password-change/request', {
      method: 'POST',
      body: JSON.stringify({ newPassword: document.getElementById('newPassword').value }),
    });
    msg.textContent = res?.error || res?.message || 'Check your email to finish changing your password.';
    msg.className = `form-inline-msg ${res?.error ? 'error' : 'success'}`;
    if (!res?.error) {
      document.getElementById('passwordOtpStep').hidden = false;
      document.getElementById('passwordCode')?.focus();
    }
  });

  document.getElementById('passwordConfirm')?.addEventListener('click', async () => {
    const msg = document.getElementById('passwordMsg');
    const res = await api('/me/password-change/confirm', {
      method: 'POST',
      body: JSON.stringify({ code: document.getElementById('passwordCode').value }),
    });
    msg.textContent = res?.error || res?.message || 'Password changed.';
    msg.className = `form-inline-msg ${res?.error ? 'error' : 'success'}`;
    if (!res?.error) {
      document.getElementById('newPassword').value = '';
      document.getElementById('passwordCode').value = '';
      document.getElementById('passwordOtpStep').hidden = true;
    }
  });

}

function wireEmergencyAlertActions(root = document) {
  root.querySelectorAll('[data-emergency-ack]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const res = await api(`/emergency-alerts/${btn.dataset.emergencyAck}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'acknowledged' }),
      });
      if (res?.error) showAlert(res.error, 'error');
      else await navigate('overview');
    });
  });
  root.querySelectorAll('[data-emergency-resolve]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const res = await api(`/emergency-alerts/${btn.dataset.emergencyResolve}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'resolved' }),
      });
      if (res?.error) showAlert(res.error, 'error');
      else await navigate('overview');
    });
  });
}

async function initPortal() {
  await loadConfig().catch(() => {});
  const session = getSession();
  if (!session?.access_token) {
    window.location.href = '/login.html';
    return;
  }
  const me = await api('/me');
  if (!me?.user) {
    window.location.href = '/login.html';
    return;
  }
  state.user = { ...me.user, role: effectiveRole(me.user) };
  sessionStorage.setItem('gmc_role', state.user.role);
  await ensureClinicSchedule();
  renderShell();
  await refreshNotifications();
  setupAutoLogout(() => {
    showAlert('You were signed out after a period of inactivity.', 'warning');
    setTimeout(() => { window.location.href = '/login.html'; }, 2000);
  });
  setTopbar('Dashboard', 'Welcome back');
  await navigate(state.user.mustChangePassword ? 'profile' : 'overview');
}

window.navigate = navigate;
document.addEventListener('DOMContentLoaded', initPortal);
