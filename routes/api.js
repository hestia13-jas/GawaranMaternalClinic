const express = require('express');
const { supabaseAdmin } = require('../lib/supabase');
const { listLocalAppointments } = require('../lib/localAuth');
const { verifyToken } = require('../middleware/auth');

const router = express.Router();

function todayIsoDate() {
  return new Date().toISOString().split('T')[0];
}

function emptyStats(role, localAppointments = [], source = 'database') {
  if (role === 'admin' || role === 'staff') {
    return {
      widgets: { patientsAdmitted: 0, deliveriesToday: 0, activeStaff: 0, pendingAppointments: 0 },
      charts: { patientStatistics: [], staffPerformance: [] },
      source,
    };
  }

  if (role === 'doctor' || role === 'nurse') {
    return {
      widgets: { patientsToday: 0, scheduledDeliveries: 0, labRequests: 0, notifications: 0 },
      dutyRoster: [],
      source,
    };
  }

  const upcoming = localAppointments
    .filter((appointment) => appointment.date && new Date(appointment.date) >= new Date())
    .sort((a, b) => new Date(a.date) - new Date(b.date))[0];

  return {
    widgets: {
      nextAppointment: upcoming?.date || null,
      medicalRecords: 0,
      labResults: 0,
      medications: 0,
    },
    tasks: upcoming ? [{ title: upcoming.type, date: upcoming.date, type: 'appointment' }] : [],
    source,
  };
}

router.get('/dashboard/stats', verifyToken, async (req, res) => {
  const role = req.user.role;

  if (req.user.isLocal || !supabaseAdmin) {
    return res.json(emptyStats(role, listLocalAppointments(req.user), req.user.isLocal ? 'local-database' : 'database'));
  }

  try {
    if (role === 'admin' || role === 'staff') {
      const [patients, deliveries, staff, appointments, patientStats, staffPerf] = await Promise.all([
        supabaseAdmin.from('patients').select('id', { count: 'exact', head: true }).eq('status', 'admitted'),
        supabaseAdmin.from('deliveries').select('id', { count: 'exact', head: true }).eq('delivery_date', todayIsoDate()),
        supabaseAdmin.from('profiles').select('id', { count: 'exact', head: true }).in('role', ['doctor', 'nurse', 'staff']).eq('is_active', true),
        supabaseAdmin.from('appointments').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
        supabaseAdmin.from('patient_statistics').select('month, count, year').order('year', { ascending: true }).order('id', { ascending: true }).limit(12),
        supabaseAdmin.from('staff_performance').select('name, score, period').order('score', { ascending: false }).limit(5),
      ]);

      return res.json({
        widgets: {
          patientsAdmitted: patients.count || 0,
          deliveriesToday: deliveries.count || 0,
          activeStaff: staff.count || 0,
          pendingAppointments: appointments.count || 0,
        },
        charts: {
          patientStatistics: patientStats.data || [],
          staffPerformance: staffPerf.data || [],
        },
        source: 'database',
      });
    }

    if (role === 'doctor' || role === 'nurse') {
      const [patientsToday, scheduledDeliveries, labRequests, notifications, roster] = await Promise.all([
        supabaseAdmin.from('appointments').select('id', { count: 'exact', head: true }).gte('appointment_date', `${todayIsoDate()}T00:00:00`).lt('appointment_date', `${todayIsoDate()}T23:59:59`),
        supabaseAdmin.from('deliveries').select('id', { count: 'exact', head: true }).gte('delivery_date', todayIsoDate()),
        supabaseAdmin.from('lab_results').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
        supabaseAdmin.from('notifications').select('id', { count: 'exact', head: true }).eq('user_id', req.user.id).eq('is_read', false),
        supabaseAdmin.from('staff_schedules').select('shift_type, department, profiles(first_name, last_name)').eq('shift_date', todayIsoDate()).limit(10),
      ]);

      return res.json({
        widgets: {
          patientsToday: patientsToday.count || 0,
          scheduledDeliveries: scheduledDeliveries.count || 0,
          labRequests: labRequests.count || 0,
          notifications: notifications.count || 0,
        },
        dutyRoster: (roster.data || []).map((item) => ({
          name: `${item.profiles?.first_name || ''} ${item.profiles?.last_name || ''}`.trim() || 'Staff',
          shift: item.shift_type || 'Scheduled',
          department: item.department || 'Clinical',
        })),
        source: 'database',
      });
    }

    const [nextAppt, records, labs, meds, notifications] = await Promise.all([
      supabaseAdmin
        .from('appointments')
        .select('appointment_date, type')
        .eq('patient_id', req.user.id)
        .gte('appointment_date', new Date().toISOString())
        .order('appointment_date', { ascending: true })
        .limit(1)
        .maybeSingle(),
      supabaseAdmin.from('medical_records').select('id', { count: 'exact', head: true }).eq('patient_id', req.user.id),
      supabaseAdmin.from('lab_results').select('id', { count: 'exact', head: true }).eq('patient_id', req.user.id),
      supabaseAdmin.from('medications').select('id', { count: 'exact', head: true }).eq('patient_id', req.user.id).eq('status', 'active'),
      supabaseAdmin.from('notifications').select('id', { count: 'exact', head: true }).eq('user_id', req.user.id).eq('is_read', false),
    ]);

    return res.json({
      widgets: {
        nextAppointment: nextAppt.data?.appointment_date || null,
        medicalRecords: records.count || 0,
        labResults: labs.count || 0,
        medications: meds.count || 0,
        notifications: notifications.count || 0,
      },
      tasks: nextAppt.data
        ? [{ title: nextAppt.data.type || 'Appointment', date: nextAppt.data.appointment_date, type: 'appointment' }]
        : [],
      source: 'database',
    });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Unable to load dashboard data.' });
  }
});

router.get('/modules', verifyToken, (req, res) => {
  res.json({
    modules: [
      { id: 'patients', name: 'Patient Management', icon: 'users', roles: ['admin', 'doctor', 'nurse', 'staff'] },
      { id: 'records', name: 'Medical Records', icon: 'file-medical', roles: ['admin', 'doctor', 'nurse', 'patient'] },
      { id: 'staff-mgmt', name: 'Doctor & Midwife Management', icon: 'user-md', roles: ['admin'] },
      { id: 'lab', name: 'Laboratory & Diagnostics', icon: 'flask', roles: ['admin', 'doctor', 'nurse', 'patient'] },
      { id: 'admin', name: 'Administration & Security', icon: 'shield', roles: ['admin'] },
      { id: 'comms', name: 'Communication & Notifications', icon: 'bell', roles: ['admin', 'doctor', 'nurse', 'staff', 'patient'] },
      { id: 'reports', name: 'Reporting & Analytics', icon: 'chart-bar', roles: ['admin', 'doctor', 'staff'] },
    ].filter((m) => m.roles.includes(req.user.role)),
    features: {
      mobileApp: false,
      realTimeMonitoring: false,
      multiLanguage: ['en'],
      cloudBackup: Boolean(supabaseAdmin),
      encryption: 'HTTPS in transit; database storage depends on the configured provider',
    },
  });
});

module.exports = router;
