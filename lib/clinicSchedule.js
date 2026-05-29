/** Clinic appointment slots — loaded from Supabase with in-memory cache. */

const FALLBACK_SCHEDULE = {
  0: [
    { startTime: '00:00', endTime: '23:59', serviceName: 'Emergency Care (24/7)' },
    { startTime: '00:30', endTime: '23:59', serviceName: 'Labor & Delivery (24/7 coverage)' },
  ],
  6: [
    { startTime: '08:00', endTime: '10:00', serviceName: 'Prenatal Care' },
    { startTime: '10:00', endTime: '12:00', serviceName: 'OB-GYN Consultation' },
    { startTime: '13:00', endTime: '15:00', serviceName: 'Ultrasound & Monitoring' },
    { startTime: '15:00', endTime: '17:00', serviceName: 'Pediatric Care & Immunization' },
    { startTime: '17:00', endTime: '19:00', serviceName: 'Postnatal Care' },
    { startTime: '19:00', endTime: '23:59', serviceName: 'Labor & Delivery (24/7 coverage)' },
  ],
  weekday: [
    { startTime: '08:00', endTime: '10:00', serviceName: 'Prenatal Care' },
    { startTime: '10:00', endTime: '12:00', serviceName: 'OB-GYN Consultation & Family Planning' },
    { startTime: '13:00', endTime: '15:00', serviceName: 'Ultrasound & Monitoring' },
    { startTime: '15:00', endTime: '17:00', serviceName: 'Pediatric Care & Immunization' },
    { startTime: '17:00', endTime: '19:00', serviceName: 'Postnatal Care (mother & newborn recovery)' },
    { startTime: '19:00', endTime: '23:59', serviceName: 'Labor & Delivery (24/7 coverage)' },
  ],
};

let cache = { slotsByDay: null, services: null, loadedAt: 0, source: 'fallback' };
const CACHE_MS = 5 * 60 * 1000;

function normalizeService(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/\([^)]*\)/g, '')
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function dayKey(date) {
  const parsed = new Date(`${String(date).slice(0, 10)}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return 'weekday';
  const dow = parsed.getDay();
  if (dow === 0) return 0;
  if (dow === 6) return 6;
  return 'weekday';
}

function slotsForDay(slotsByDay, date) {
  const key = dayKey(date);
  if (key === 'weekday') return slotsByDay.weekday || FALLBACK_SCHEDULE.weekday;
  return slotsByDay[key] || slotsByDay[String(key)] || FALLBACK_SCHEDULE[key] || FALLBACK_SCHEDULE.weekday;
}

function groupRows(rows) {
  const slotsByDay = { weekday: [], 0: [], 6: [] };
  for (const row of rows) {
    const slot = {
      startTime: String(row.start_time || '').slice(0, 5),
      endTime: String(row.end_time || '').slice(0, 5),
      serviceName: row.service_name,
    };
    const dow = Number(row.day_of_week);
    if (dow === 0) slotsByDay[0].push(slot);
    else if (dow === 6) slotsByDay[6].push(slot);
    else slotsByDay.weekday.push(slot);
  }
  for (const key of Object.keys(slotsByDay)) {
    slotsByDay[key].sort((a, b) => a.startTime.localeCompare(b.startTime));
  }
  return slotsByDay;
}

async function loadScheduleFromDb(supabaseAdmin) {
  if (!supabaseAdmin) return null;
  const { data, error } = await supabaseAdmin
    .from('clinic_schedule_slots')
    .select('day_of_week, start_time, end_time, service_name, sort_order')
    .eq('is_active', true)
    .order('day_of_week', { ascending: true })
    .order('sort_order', { ascending: true })
    .order('start_time', { ascending: true });
  if (error || !data?.length) return null;
  return { slotsByDay: groupRows(data), source: 'database' };
}

async function loadServicesFromDb(supabaseAdmin) {
  if (!supabaseAdmin) return null;
  const { data, error } = await supabaseAdmin
    .from('clinic_services')
    .select('name, description')
    .eq('is_active', true)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true });
  if (error || !data?.length) return null;
  return data.map((row) => ({ name: row.name, description: row.description || null }));
}

async function refreshCache(supabaseAdmin) {
  const now = Date.now();
  if (cache.slotsByDay && now - cache.loadedAt < CACHE_MS) return cache;

  const fromDb = await loadScheduleFromDb(supabaseAdmin);
  const services = await loadServicesFromDb(supabaseAdmin);

  if (fromDb) {
    cache = {
      slotsByDay: fromDb.slotsByDay,
      services: services || uniqueServiceNames(fromDb.slotsByDay),
      loadedAt: now,
      source: 'database',
    };
    return cache;
  }

  cache = {
    slotsByDay: { ...FALLBACK_SCHEDULE },
    services: uniqueServiceNames(FALLBACK_SCHEDULE),
    loadedAt: now,
    source: 'fallback',
  };
  return cache;
}

function uniqueServiceNames(slotsByDay) {
  const names = new Set();
  for (const list of Object.values(slotsByDay)) {
    for (const slot of list) names.add(slot.serviceName);
  }
  return Array.from(names).map((name) => ({ name }));
}

function scheduleSlotsForDate(date, slotsByDay = cache.slotsByDay || FALLBACK_SCHEDULE) {
  return slotsForDay(slotsByDay, date);
}

function scheduleMatch(date, type, slotsByDay = cache.slotsByDay || FALLBACK_SCHEDULE) {
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return null;
  const time = `${String(parsed.getHours()).padStart(2, '0')}:${String(parsed.getMinutes()).padStart(2, '0')}`;
  const requestedType = normalizeService(type);
  return (
    scheduleSlotsForDate(date, slotsByDay).find(
      (slot) => slot.startTime === time && normalizeService(slot.serviceName) === requestedType
    ) || null
  );
}

function slotsForApi(slotsByDay) {
  return {
    sunday: slotsByDay[0] || [],
    saturday: slotsByDay[6] || [],
    weekday: slotsByDay.weekday || [],
  };
}

module.exports = {
  refreshCache,
  scheduleSlotsForDate,
  scheduleMatch,
  slotsForApi,
  normalizeService,
  FALLBACK_SCHEDULE,
};
