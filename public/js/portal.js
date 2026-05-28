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
};

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
  return NAV[role] || NAV.patient;
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
  const nav = navForRole(state.user.role);
  const name = `${state.user.firstName || ''} ${state.user.lastName || ''}`.trim() || state.user.email;

  document.getElementById('portalSidebar').innerHTML = `
    <a href="/" class="portal-brand">
      <img src="/assets/logo.jpg" width="40" height="40" alt="" />
      <span>Gawaran Clinic</span>
    </a>
    <div class="portal-user">
      <button type="button" class="portal-avatar portal-avatar-button" id="profilePhotoShortcut" aria-label="Open settings">${state.user.profilePhotoUrl ? `<img src="${state.user.profilePhotoUrl}" alt="" />` : name.slice(0, 1).toUpperCase()}</button>
      <div class="portal-user-name">${name}</div>
      <span class="portal-user-role">${state.user.role}</span>
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
        <p>You will be signed out of the clinic portal.</p>
        <div class="confirm-actions">
          <button type="button" class="btn btn-outline" id="logoutNo">Stay signed in</button>
          <button type="button" class="btn btn-danger" id="logoutYes">${icon('logout')} Sign out</button>
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
    profile: ['Settings & Profile', 'Personal details, photo, password, and recent sign-ins'],
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
    const summary = await api('/patient/summary');
    const pregnancy = summary?.pregnancy;
    panels.innerHTML = `
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

  const roster = s.dutyRoster || [];
  panels.innerHTML = `<div class="panel" style="grid-column:1/-1"><div class="panel-head"><h2>Duty roster</h2></div><div class="panel-body"><table class="data-table"><thead><tr><th>Name</th><th>Shift</th><th>Department</th></tr></thead><tbody>
    ${roster.length ? roster.map((r) => `<tr><td>${r.name}</td><td>${r.shift}</td><td>${r.department}</td></tr>`).join('') : emptyTableRow(3, 'No roster records found for today.')}
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

async function ensureDoctors() {
  if (state.doctors.length) return state.doctors;
  const data = await api('/doctors');
  state.doctors = data?.doctors || [];
  return state.doctors;
}

const CLINIC_SLOTS = {
  weekday: [
    ['08:00', '10:00', 'Prenatal Care'],
    ['10:00', '12:00', 'OB-GYN Consultation & Family Planning'],
    ['13:00', '15:00', 'Ultrasound & Monitoring'],
    ['15:00', '17:00', 'Pediatric Care & Immunization'],
    ['17:00', '19:00', 'Postnatal Care'],
    ['19:00', '23:30', 'Labor & Delivery'],
  ],
  saturday: [
    ['08:00', '10:00', 'Prenatal Care'],
    ['10:00', '12:00', 'OB-GYN Consultation'],
    ['13:00', '15:00', 'Ultrasound & Monitoring'],
    ['15:00', '17:00', 'Pediatric Care & Immunization'],
    ['17:00', '19:00', 'Postnatal Care'],
    ['19:00', '23:30', 'Labor & Delivery'],
  ],
  sunday: [
    ['00:00', '23:30', 'Emergency Care'],
    ['00:30', '23:00', 'Labor & Delivery'],
  ],
};

function clinicSlotsForDate(dateText) {
  if (!dateText) return [];
  const day = new Date(`${dateText}T12:00:00`).getDay();
  if (day === 0) return CLINIC_SLOTS.sunday;
  if (day === 6) return CLINIC_SLOTS.saturday;
  return CLINIC_SLOTS.weekday;
}

function slotDateTime(dateText, slot) {
  return `${dateText}T${slot[0]}`;
}

function sameSlot(left, right) {
  return new Date(left).getTime() === new Date(right).getTime();
}

function isSlotBooked(bookedRows, dateText, slot) {
  const target = slotDateTime(dateText, slot);
  return bookedRows.some((item) => sameSlot(item.date, target));
}

function isDoctorUnavailable(unavailableDays, doctorId, dateText) {
  return (unavailableDays || []).some((item) => {
    const itemDate = item.date || item.unavailable_date;
    return itemDate === dateText && (!doctorId || item.doctor_id === doctorId);
  });
}

function renderMonthAvailability(bookedRows, doctorId, monthDate = new Date(), unavailableDays = []) {
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
    const available = !restDay && slots.some((slot) => !isSlotBooked(bookedRows, dateText, slot));
    const status = available ? 'available' : 'unavailable';
    const disabled = available ? '' : 'disabled';
    const title = restDay ? 'Doctor unavailable' : (available ? 'Available' : 'Fully booked');
    cells.push(`<button type="button" class="availability-day ${status}" data-pick-date="${dateText}" title="${title}" ${disabled}><span>${day}</span></button>`);
  }
  const label = first.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  return `<div class="availability-calendar" data-doctor="${doctorId || ''}">
    <div class="availability-title">${label}</div>
    <div class="availability-legend"><span class="legend-dot available"></span> Available <span class="legend-dot unavailable"></span> Fully booked</div>
    <div class="availability-weekdays"><span>Sun</span><span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span></div>
    <div class="availability-grid">${cells.join('')}</div>
  </div>`;
}

function updateSlotOptions(bookedRows, unavailableDays = [], doctorId = '') {
  const dateInput = document.getElementById('bookDate');
  const slotSelect = document.getElementById('bookSlot');
  const typeSelect = document.getElementById('bookType');
  if (!dateInput || !slotSelect) return;
  const dateText = dateInput.value;
  const slots = clinicSlotsForDate(dateText);
  const restDay = doctorId && isDoctorUnavailable(unavailableDays, doctorId, dateText);
  slotSelect.innerHTML = dateText && !restDay
    ? slots.map((slot) => {
      const booked = isSlotBooked(bookedRows, dateText, slot);
      const label = `${slot[0]}-${slot[1]} - ${slot[2]}`;
      return `<option value="${slotDateTime(dateText, slot)}" data-type="${slot[2]}" ${booked ? 'disabled' : ''}>${booked ? 'Booked - ' : ''}${label}</option>`;
    }).join('')
    : `<option value="">${restDay ? 'Doctor unavailable on this date' : 'Choose a date first'}</option>`;
  const firstOpen = Array.from(slotSelect.options).find((option) => !option.disabled);
  if (firstOpen) {
    slotSelect.value = firstOpen.value;
    if (typeSelect) typeSelect.value = firstOpen.dataset.type || typeSelect.value;
  }
}

function renderCalendar(rows, { unavailableDays = [], canToggleUnavailable = false } = {}) {
  const grouped = new Map();
  rows.forEach((a) => {
    const key = a.date ? new Date(a.date).toISOString().slice(0, 10) : 'Unscheduled';
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(a);
  });
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth();
  const first = new Date(year, month, 1);
  const cells = [];
  for (let i = 0; i < first.getDay(); i += 1) cells.push('<div class="calendar-day muted"></div>');
  const totalDays = new Date(year, month + 1, 0).getDate();
  for (let day = 1; day <= totalDays; day += 1) {
    const key = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const events = (grouped.get(key) || []).sort((a, b) => new Date(a.date) - new Date(b.date));
    const unavailable = unavailableDays.some((item) => (item.date || item.unavailable_date) === key);
    cells.push(`<div class="calendar-day ${events.length ? 'has-events' : ''} ${unavailable ? 'unavailable' : ''}">
      <div class="calendar-date">${day}<span>${events.length ? `${events.length} booked` : 'Open'}</span></div>
      ${canToggleUnavailable ? `<button type="button" class="rest-day-toggle ${unavailable ? 'active' : ''}" data-rest-date="${key}">${unavailable ? 'Unavailable' : 'Mark rest day'}</button>` : ''}
      ${events.slice(0, 4).map((a) => `
        <div class="calendar-event ${a.status || 'pending'}">
          <strong>${fmtTime(a.date)} - ${a.type || 'Appointment'}</strong>
          <span>${a.patient_name || 'Patient'} with ${a.doctor || 'Unassigned'}</span>
        </div>`).join('')}
    </div>`);
  }
  return `<div class="calendar-board">
    <div class="calendar-month-title">${first.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</div>
    <div class="availability-weekdays"><span>Sun</span><span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span></div>
    <div class="calendar-month-grid">${cells.join('')}</div>
  </div>`;
}

async function renderAppointments(el) {
  const role = state.user.role;
  const data = await api('/appointments');
  const rows = data?.appointments || [];
  const doctors = await ensureDoctors();
  const availability = role === 'patient' || role === 'doctor' ? await api(`/appointments/availability${role === 'doctor' ? `?doctorId=${encodeURIComponent(state.user.id)}` : ''}`) : { appointments: rows, unavailableDays: [] };
  const bookedRows = availability?.appointments || [];
  let unavailableDays = availability?.unavailableDays || [];

  let bookForm = '';
  if (role === 'patient') {
    bookForm = `<div class="panel appointment-panel"><div class="panel-head form-panel-head"><div><h2>Book new appointment</h2><p>Choose a service, preferred provider, and available time.</p></div></div><div class="panel-body professional-form" id="bookForm">
      <div class="form-field"><label for="bookType">Appointment type</label><select id="bookType"><option>Prenatal Care</option><option>OB-GYN Consultation & Family Planning</option><option>Ultrasound & Monitoring</option><option>Pediatric Care & Immunization</option><option>Postnatal Care</option><option>Emergency Care</option><option>Labor & Delivery</option></select></div>
      <div class="form-field"><label for="bookDoctor">Preferred doctor</label><select id="bookDoctor"><option value="">No preference</option>${doctors.map((d) => `<option value="${d.id}" data-name="${d.name}">${d.name}</option>`).join('')}</select></div>
      <div class="form-field"><label for="bookDate">Date</label><input type="date" id="bookDate" /></div>
      <div class="form-field"><label for="bookSlot">Clinic schedule</label><select id="bookSlot"><option value="">Choose a date first</option></select></div>
      <div class="form-field-wide">${renderMonthAvailability(bookedRows, '', new Date(), unavailableDays)}</div>
      <div class="form-field form-field-wide"><label for="bookNotes">Notes for the clinic</label><textarea id="bookNotes" rows="4" placeholder="Optional details, symptoms, or special requests"></textarea></div>
      <div class="form-actions-row">
        <button type="button" class="btn btn-primary" id="bookSubmit">${icon('calendar')} Submit</button>
      </div>
      <p id="bookMsg" class="form-inline-msg"></p>
    </div></div>`;
  }

  const canApprove = role === 'admin' || role === 'doctor';
  el.innerHTML = bookForm + `
    ${canApprove ? `<div class="panel" style="margin-bottom:1.25rem"><div class="panel-head"><h2>Schedule calendar</h2>${sourceText(data)}</div><div class="panel-body">${renderCalendar(rows, { unavailableDays, canToggleUnavailable: role === 'doctor' })}</div></div>` : ''}
    <div class="panel"><div class="panel-head"><h2>Appointments</h2>${sourceText(data)}</div><div class="panel-body" style="overflow-x:auto"><table class="data-table"><thead><tr>
      <th>Patient</th><th>Type</th><th>Date</th><th>Provider</th><th>Status</th>${canApprove ? '<th>Action</th>' : ''}
    </tr></thead><tbody>
      ${rows.length ? rows.map((a) => `<tr>
        <td>${a.patient_name || '-'}</td><td>${a.type || '-'}</td><td>${fmtDate(a.date)}</td><td>${a.doctor || '-'}</td><td>${badge(a.status)}</td>
        ${canApprove ? `<td class="table-actions">
          <button type="button" class="btn btn-primary btn-xs" data-approve="${a.id}" ${a.status === 'confirmed' ? 'disabled' : ''}>Accept</button>
          <button type="button" class="btn btn-outline btn-xs" data-deny="${a.id}" ${a.status === 'denied' ? 'disabled' : ''}>Deny</button>
        </td>` : ''}
      </tr>`).join('') : emptyTableRow(canApprove ? 6 : 5)}
    </tbody></table></div></div>`;

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
    msg.textContent = res?.error || res?.message || 'Appointment request submitted.';
    msg.className = `form-inline-msg ${res?.error ? 'error' : 'success'}`;
    if (res?.appointment) {
      await refreshNotifications();
      setTimeout(() => navigate('appointments'), 800);
    }
  }

  document.getElementById('bookDate')?.addEventListener('change', () => updateSlotOptions(bookedRows, unavailableDays, document.getElementById('bookDoctor')?.value || ''));
  document.getElementById('bookDoctor')?.addEventListener('change', async (event) => {
    const doctorId = event.target.value;
    const fresh = await api(`/appointments/availability${doctorId ? `?doctorId=${encodeURIComponent(doctorId)}` : ''}`);
    const nextRows = fresh?.appointments || [];
    unavailableDays = fresh?.unavailableDays || [];
    document.querySelector('.availability-calendar')?.remove();
    document.getElementById('bookDate')?.closest('.form-field')?.insertAdjacentHTML('afterend', `<div class="form-field-wide">${renderMonthAvailability(nextRows, doctorId, new Date(), unavailableDays)}</div>`);
    wireAvailabilityCalendar(nextRows);
    updateSlotOptions(nextRows, unavailableDays, doctorId);
  });
  function wireAvailabilityCalendar(nextRows = bookedRows) {
    document.querySelectorAll('[data-pick-date]').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.getElementById('bookDate').value = btn.dataset.pickDate;
        updateSlotOptions(nextRows, unavailableDays, document.getElementById('bookDoctor')?.value || '');
      });
    });
  }
  wireAvailabilityCalendar();
  updateSlotOptions(bookedRows, unavailableDays, document.getElementById('bookDoctor')?.value || '');
  document.getElementById('bookSubmit')?.addEventListener('click', submitBooking);

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

  document.querySelectorAll('[data-approve]').forEach((btn) => {
    btn.addEventListener('click', () => decideAppointment(btn.dataset.approve, 'confirmed'));
  });
  document.querySelectorAll('[data-deny]').forEach((btn) => {
    btn.addEventListener('click', () => decideAppointment(btn.dataset.deny, 'denied'));
  });
}

async function decideAppointment(id, status) {
  const reason = status === 'denied' ? window.prompt('Please provide the reason for denial:') : '';
  if (status === 'denied' && (!reason || reason.trim().length < 5)) {
    window.alert('A clear denial reason is required.');
    return;
  }
  const res = await api(`/appointments/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status, reason }),
  });
  if (res?.error) {
    window.alert(res.error);
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

async function renderRecords(el) {
  const data = await api('/records');
  const rows = data?.records || [];
  let uploadForm = '';
  if (state.user.role === 'doctor') {
    const patientsData = await api('/patients');
    const patients = patientsData?.patients || [];
    uploadForm = `<div class="panel appointment-panel"><div class="panel-head form-panel-head"><div><h2>Send medical result</h2><p>Upload a PDF result for a patient portal.</p></div></div><div class="panel-body professional-form">
      <div class="form-field"><label for="recordPatient">Patient</label><select id="recordPatient"><option value="">Select patient</option>${patients.map((p) => `<option value="${p.profile_id || p.id}">${p.name || p.email || 'Patient'}</option>`).join('')}</select></div>
      <div class="form-field"><label for="recordType">Result type</label><input type="text" id="recordType" value="Medical Result" /></div>
      <div class="form-field form-field-wide"><label for="recordDiagnosis">Summary</label><input type="text" id="recordDiagnosis" placeholder="Example: Ultrasound result" /></div>
      <div class="form-field form-field-wide"><label for="recordTreatment">Notes</label><textarea id="recordTreatment" rows="3"></textarea></div>
      <div class="form-field form-field-wide"><label for="recordPdf">PDF file</label><input type="file" id="recordPdf" accept="application/pdf" /></div>
      <div class="form-actions-row"><button type="button" class="btn btn-primary" id="recordSubmit">${icon('file')} Send result</button></div>
      <p id="recordMsg" class="form-inline-msg"></p>
    </div></div>`;
  }
  el.innerHTML = uploadForm + `<div class="panel"><div class="panel-head"><h2>Medical records</h2>${sourceText(data)}</div><div class="panel-body"><table class="data-table"><thead><tr><th>Patient</th><th>Type</th><th>Diagnosis</th><th>Treatment</th><th>File</th><th>Date</th><th>Provider</th></tr></thead><tbody>
    ${rows.length ? rows.map((r) => `<tr><td>${escapeHtml(r.patient_name || '-')}</td><td>${escapeHtml(r.type || '-')}</td><td>${escapeHtml(r.diagnosis || '-')}</td><td>${escapeHtml(r.treatment || '-')}</td><td><button type="button" class="btn btn-outline btn-xs" data-record-id="${r.id}">Open</button></td><td>${fmtDate(r.date || r.created_at)}</td><td>${escapeHtml(r.provider || '-')}</td></tr>`).join('') : emptyTableRow(7)}
  </tbody></table></div></div>`;
  document.querySelectorAll('[data-record-id]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const record = rows.find((item) => item.id === btn.dataset.recordId);
      if (record) showRecordModal(record);
    });
  });
  document.getElementById('recordSubmit')?.addEventListener('click', async () => {
    const msg = document.getElementById('recordMsg');
    const file = document.getElementById('recordPdf').files[0];
    const payload = {
      patientId: document.getElementById('recordPatient').value,
      recordType: document.getElementById('recordType').value,
      diagnosis: document.getElementById('recordDiagnosis').value,
      treatment: document.getElementById('recordTreatment').value,
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
  const search = (state.messageSearch || '').trim().toLowerCase();
  const filteredContacts = contacts.filter((contact) => `${contact.name || ''} ${contact.email || ''} ${contact.role || ''}`.toLowerCase().includes(search));
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
      </button>`).join('') : '<p class="empty-state compact">No matching contacts.</p>'}
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
    document.getElementById('messageSearch')?.focus();
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
      <label>Profile photo <input type="file" id="profilePhoto" accept="image/*" /></label>
      <label>First name <input type="text" id="profileFirst" value="${u.firstName || ''}" /></label>
      <label>Middle name <input type="text" id="profileMiddle" value="${u.middleName || ''}" /></label>
      <label>Last name <input type="text" id="profileLast" value="${u.lastName || ''}" /></label>
      <label>Phone <input type="tel" id="profilePhone" value="${u.phone || ''}" /></label>
      <div class="readonly-line"><span>Email</span><strong>${u.email}</strong></div>
      <div class="readonly-line"><span>Role</span><strong>${u.role}</strong></div>
      <button class="btn btn-primary" id="profileSave">Save profile</button>
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
  state.user = me.user;
  renderShell();
  await refreshNotifications();
  setupAutoLogout(() => {
    window.alert('You were signed out after a period of inactivity.');
    window.location.href = '/login.html';
  });
  setTopbar('Dashboard', 'Welcome back');
  await navigate(state.user.mustChangePassword ? 'profile' : 'overview');
}

window.navigate = navigate;
document.addEventListener('DOMContentLoaded', initPortal);
