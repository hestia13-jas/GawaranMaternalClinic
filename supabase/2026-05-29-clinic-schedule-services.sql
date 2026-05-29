-- Clinic schedule, services, care tips (run in Supabase SQL Editor)
-- Removes dependency on hardcoded appointment slots in the app.

CREATE TABLE IF NOT EXISTS public.clinic_schedule_slots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  day_of_week INT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  service_name TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.clinic_services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.clinic_care_tips (
  id SERIAL PRIMARY KEY,
  tip_text TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_clinic_schedule_day ON public.clinic_schedule_slots (day_of_week, is_active);

-- Seed schedule (Mon–Fri = day_of_week 1–5)
INSERT INTO public.clinic_schedule_slots (day_of_week, start_time, end_time, service_name, sort_order)
SELECT v.day_of_week, v.start_time::time, v.end_time::time, v.service_name, v.sort_order
FROM (VALUES
  (1, '08:00', '10:00', 'Prenatal Care', 1),
  (1, '10:00', '12:00', 'OB-GYN Consultation & Family Planning', 2),
  (1, '13:00', '15:00', 'Ultrasound & Monitoring', 3),
  (1, '15:00', '17:00', 'Pediatric Care & Immunization', 4),
  (1, '17:00', '19:00', 'Postnatal Care (mother & newborn recovery)', 5),
  (1, '19:00', '23:59', 'Labor & Delivery (24/7 coverage)', 6),
  (2, '08:00', '10:00', 'Prenatal Care', 1),
  (2, '10:00', '12:00', 'OB-GYN Consultation & Family Planning', 2),
  (2, '13:00', '15:00', 'Ultrasound & Monitoring', 3),
  (2, '15:00', '17:00', 'Pediatric Care & Immunization', 4),
  (2, '17:00', '19:00', 'Postnatal Care (mother & newborn recovery)', 5),
  (2, '19:00', '23:59', 'Labor & Delivery (24/7 coverage)', 6),
  (3, '08:00', '10:00', 'Prenatal Care', 1),
  (3, '10:00', '12:00', 'OB-GYN Consultation & Family Planning', 2),
  (3, '13:00', '15:00', 'Ultrasound & Monitoring', 3),
  (3, '15:00', '17:00', 'Pediatric Care & Immunization', 4),
  (3, '17:00', '19:00', 'Postnatal Care (mother & newborn recovery)', 5),
  (3, '19:00', '23:59', 'Labor & Delivery (24/7 coverage)', 6),
  (4, '08:00', '10:00', 'Prenatal Care', 1),
  (4, '10:00', '12:00', 'OB-GYN Consultation & Family Planning', 2),
  (4, '13:00', '15:00', 'Ultrasound & Monitoring', 3),
  (4, '15:00', '17:00', 'Pediatric Care & Immunization', 4),
  (4, '17:00', '19:00', 'Postnatal Care (mother & newborn recovery)', 5),
  (4, '19:00', '23:59', 'Labor & Delivery (24/7 coverage)', 6),
  (5, '08:00', '10:00', 'Prenatal Care', 1),
  (5, '10:00', '12:00', 'OB-GYN Consultation & Family Planning', 2),
  (5, '13:00', '15:00', 'Ultrasound & Monitoring', 3),
  (5, '15:00', '17:00', 'Pediatric Care & Immunization', 4),
  (5, '17:00', '19:00', 'Postnatal Care (mother & newborn recovery)', 5),
  (5, '19:00', '23:59', 'Labor & Delivery (24/7 coverage)', 6),
  (6, '08:00', '10:00', 'Prenatal Care', 1),
  (6, '10:00', '12:00', 'OB-GYN Consultation', 2),
  (6, '13:00', '15:00', 'Ultrasound & Monitoring', 3),
  (6, '15:00', '17:00', 'Pediatric Care & Immunization', 4),
  (6, '17:00', '19:00', 'Postnatal Care', 5),
  (6, '19:00', '23:59', 'Labor & Delivery (24/7 coverage)', 6),
  (0, '00:00', '23:59', 'Emergency Care (24/7)', 1),
  (0, '00:30', '23:59', 'Labor & Delivery (24/7 coverage)', 2)
) AS v(day_of_week, start_time, end_time, service_name, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM public.clinic_schedule_slots LIMIT 1);

INSERT INTO public.clinic_services (name, description, sort_order) VALUES
  ('Prenatal Care', 'Routine prenatal visits and monitoring', 1),
  ('OB-GYN Consultation & Family Planning', 'Consultation and family planning services', 2),
  ('Ultrasound & Monitoring', 'Ultrasound and fetal monitoring', 3),
  ('Pediatric Care & Immunization', 'Newborn and child wellness', 4),
  ('Postnatal Care (mother & newborn recovery)', 'Postpartum recovery support', 5),
  ('Emergency Care (24/7)', 'Urgent maternal and newborn concerns', 6),
  ('Labor & Delivery (24/7 coverage)', 'Labor and delivery support', 7)
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.clinic_care_tips (tip_text, sort_order)
SELECT tip_text, sort_order FROM (VALUES
  ('Follow the care plan approved by your doctor.', 1),
  ('Contact the clinic promptly for bleeding, severe headache, fever, or reduced fetal movement.', 2),
  ('Bring previous lab results and medications to your next appointment.', 3)
) AS v(tip_text, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM public.clinic_care_tips LIMIT 1);
