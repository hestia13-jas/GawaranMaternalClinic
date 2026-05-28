async function loadDashboard(role) {
  const authed = await requireAuth();
  if (!authed) return;

  const res = await fetch('/api/dashboard/stats', { headers: getAuthHeaders() });
  const data = await res.json();

  if (role === 'admin') {
    renderAdminWidgets(data);
    renderPatientChart(data.charts?.patientStatistics);
    renderStaffPerformance(data.charts?.staffPerformance);
  } else if (role === 'doctor') {
    renderDoctorWidgets(data);
    renderDutyRoster(data.dutyRoster);
  } else {
    renderPatientWidgets(data);
    renderTasks(data.tasks);
  }

  loadModules();
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function renderAdminWidgets(data) {
  const w = data.widgets || {};
  setText('patientsAdmitted', w.patientsAdmitted ?? '—');
  setText('deliveriesToday', w.deliveriesToday ?? '—');
  setText('activeStaff', w.activeStaff ?? '—');
  setText('pendingAppointments', w.pendingAppointments ?? '—');
}

function renderDoctorWidgets(data) {
  const w = data.widgets || {};
  setText('patientsToday', w.patientsToday ?? '—');
  setText('scheduledDeliveries', w.scheduledDeliveries ?? '—');
  setText('labRequests', w.labRequests ?? '—');
  setText('notifications', w.notifications ?? '—');
}

function renderPatientWidgets(data) {
  const w = data.widgets || {};
  const next = w.nextAppointment ? new Date(w.nextAppointment).toLocaleString() : 'None scheduled';
  setText('nextAppointment', next);
  setText('medicalRecords', w.medicalRecords ?? '—');
  setText('labResults', w.labResults ?? '—');
  setText('medications', w.medications ?? '—');
}

function renderPatientChart(stats) {
  const container = document.getElementById('patientChart');
  if (!container || !stats?.length) return;

  const max = Math.max(...stats.map((s) => s.count));
  container.innerHTML = stats
    .map(
      (s) => `
    <div class="chart-bar-wrap">
      <div class="chart-bar" style="height:${Math.round((s.count / max) * 140)}px" title="${s.count} patients"></div>
      <span class="chart-bar-label">${s.month}</span>
    </div>`
    )
    .join('');
}

function renderStaffPerformance(staff) {
  const list = document.getElementById('staffPerformance');
  if (!list || !staff?.length) return;

  list.innerHTML = staff
    .map(
      (s) => `
    <li>
      <span>${s.name}</span>
      <div class="performance-bar"><div class="performance-fill" style="width:${s.score}%"></div></div>
      <strong>${s.score}%</strong>
    </li>`
    )
    .join('');
}

function renderDutyRoster(roster) {
  const tbody = document.querySelector('#dutyRoster tbody');
  if (!tbody || !roster?.length) return;

  tbody.innerHTML = roster
    .map(
      (r) => `
    <tr>
      <td>${r.name}</td>
      <td>${r.shift}</td>
      <td>${r.department}</td>
    </tr>`
    )
    .join('');
}

function renderTasks(tasks) {
  const list = document.getElementById('tasksList');
  if (!list || !tasks?.length) return;

  const icons = { appointment: '📅', document: '📄', lab: '🔬', medication: '💊' };
  list.innerHTML = tasks
    .map(
      (t) => `
    <li>
      <span class="task-type">${icons[t.type] || '✓'}</span>
      <div>
        <strong>${t.title}</strong>
        <div style="font-size:0.85rem;color:var(--gray-500)">${t.date}</div>
      </div>
    </li>`
    )
    .join('');
}

async function loadModules() {
  const panel = document.getElementById('modulesList');
  if (!panel) return;

  try {
    const res = await fetch('/api/modules', { headers: getAuthHeaders() });
    const data = await res.json();
    panel.innerHTML = (data.modules || [])
      .map((m) => `<span class="module-tag">${m.name}</span>`)
      .join('');
  } catch {
    panel.innerHTML = '<span class="module-tag">Modules unavailable offline</span>';
  }
}

function initDashboard(role) {
  document.getElementById('logoutBtn')?.addEventListener('click', () => {
    clearSession();
    window.location.href = '/login.html';
  });
  loadDashboard(role);
}
