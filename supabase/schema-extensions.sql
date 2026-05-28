-- Run AFTER schema.sql — Capstone extensions

CREATE TABLE IF NOT EXISTS medications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID REFERENCES profiles(id),
  name TEXT NOT NULL,
  dosage TEXT,
  frequency TEXT,
  status TEXT DEFAULT 'active',
  prescribed_by UUID REFERENCES profiles(id),
  start_date DATE DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS patient_vitals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID REFERENCES profiles(id) NOT NULL,
  blood_pressure TEXT,
  weight_kg NUMERIC(5,2),
  fetal_heart_rate INT,
  notes TEXT,
  recorded_by UUID REFERENCES profiles(id),
  recorded_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS staff_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id UUID REFERENCES profiles(id),
  shift_date DATE NOT NULL,
  shift_type TEXT,
  department TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id UUID REFERENCES profiles(id),
  recipient_id UUID REFERENCES profiles(id),
  subject TEXT,
  body TEXT,
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS announcements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  body TEXT,
  priority TEXT DEFAULT 'normal',
  created_by UUID REFERENCES profiles(id),
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE appointments ADD COLUMN IF NOT EXISTS patient_name TEXT;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS doctor_name TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS profile_photo_url TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN DEFAULT false;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS temporary_password_expires_at TIMESTAMPTZ;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS type TEXT DEFAULT 'general';
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS section TEXT;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS target_id TEXT;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS room TEXT;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS trimester TEXT;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS provider_id UUID REFERENCES profiles(id);
ALTER TABLE medical_records ADD COLUMN IF NOT EXISTS file_name TEXT;
ALTER TABLE medical_records ADD COLUMN IF NOT EXISTS file_data TEXT;
ALTER TABLE feedback ALTER COLUMN is_approved SET DEFAULT true;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_confirmed_doctor_slot
  ON appointments(doctor_id, appointment_date)
  WHERE doctor_id IS NOT NULL AND status = 'confirmed';

CREATE UNIQUE INDEX IF NOT EXISTS uniq_active_doctor_slot
  ON appointments(doctor_id, appointment_date)
  WHERE doctor_id IS NOT NULL AND status IN ('pending', 'confirmed');

CREATE TABLE IF NOT EXISTS waitlist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID REFERENCES profiles(id) NOT NULL,
  doctor_id UUID REFERENCES profiles(id),
  appointment_time TIMESTAMPTZ NOT NULL,
  type TEXT,
  notes TEXT,
  status TEXT DEFAULT 'waiting',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID REFERENCES profiles(id) NOT NULL,
  doctor_id UUID REFERENCES profiles(id),
  appointment_id UUID REFERENCES appointments(id),
  rating INT CHECK (rating BETWEEN 1 AND 5),
  comment TEXT NOT NULL,
  is_public BOOLEAN DEFAULT false,
  is_approved BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS password_change_requests (
  user_id UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  password_hash TEXT,
  salt TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS login_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  email TEXT,
  success BOOLEAN NOT NULL,
  ip_address TEXT,
  device TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS doctor_unavailable_days (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id UUID REFERENCES profiles(id) NOT NULL,
  unavailable_date DATE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (doctor_id, unavailable_date)
);

CREATE INDEX IF NOT EXISTS idx_appointments_date ON appointments(appointment_date);
CREATE INDEX IF NOT EXISTS idx_waitlist_slot ON waitlist(doctor_id, appointment_time);
CREATE INDEX IF NOT EXISTS idx_feedback_public ON feedback(is_public, is_approved, created_at);
CREATE INDEX IF NOT EXISTS idx_messages_recipient ON messages(recipient_id);
CREATE INDEX IF NOT EXISTS idx_unavailable_days_doctor_date ON doctor_unavailable_days(doctor_id, unavailable_date);
