-- Gawaran Maternal Clinic - Supabase Schema
-- Run in Supabase SQL Editor after creating your project

-- Roles: admin, doctor, nurse, staff, patient
CREATE TYPE user_role AS ENUM ('admin', 'doctor', 'nurse', 'staff', 'patient');

CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  first_name TEXT NOT NULL,
  middle_name TEXT,
  last_name TEXT NOT NULL,
  phone TEXT,
  role user_role NOT NULL DEFAULT 'patient',
  is_active BOOLEAN DEFAULT true,
  is_locked BOOLEAN DEFAULT false,
  two_factor_enabled BOOLEAN DEFAULT false,
  remember_device BOOLEAN DEFAULT false,
  must_change_password BOOLEAN DEFAULT false,
  temporary_password_expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE login_attempts (
  email TEXT PRIMARY KEY,
  attempt_count INT DEFAULT 0,
  locked_until TIMESTAMPTZ,
  last_attempt_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE otp_codes (
  user_id UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE audit_logs (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  details JSONB DEFAULT '{}',
  ip_address TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE patients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID REFERENCES profiles(id),
  status TEXT DEFAULT 'outpatient',
  room TEXT,
  trimester TEXT,
  provider_id UUID REFERENCES profiles(id),
  admitted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID REFERENCES profiles(id),
  doctor_id UUID REFERENCES profiles(id),
  appointment_date TIMESTAMPTZ NOT NULL,
  type TEXT,
  status TEXT DEFAULT 'pending',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE feedback (
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

CREATE TABLE deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID REFERENCES profiles(id),
  delivery_date DATE NOT NULL,
  delivery_type TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE medical_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID REFERENCES profiles(id) NOT NULL,
  record_type TEXT,
  diagnosis TEXT,
  treatment TEXT,
  file_name TEXT,
  file_data TEXT,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE lab_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID REFERENCES profiles(id) NOT NULL,
  test_name TEXT,
  result TEXT,
  status TEXT DEFAULT 'pending',
  requested_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) NOT NULL,
  title TEXT,
  message TEXT,
  type TEXT DEFAULT 'general',
  section TEXT,
  target_id TEXT,
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE doctor_unavailable_days (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id UUID REFERENCES profiles(id) NOT NULL,
  unavailable_date DATE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (doctor_id, unavailable_date)
);

CREATE TABLE clinic_closed_days (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  closed_date DATE NOT NULL UNIQUE,
  reason TEXT,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE user_preferences (
  user_id UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  theme TEXT NOT NULL DEFAULT 'light' CHECK (theme IN ('light', 'dark')),
  font_size INT NOT NULL DEFAULT 100 CHECK (font_size BETWEEN 90 AND 120),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE emergency_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID REFERENCES profiles(id) NOT NULL,
  message TEXT,
  status TEXT DEFAULT 'new',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE patient_statistics (
  id SERIAL PRIMARY KEY,
  month TEXT NOT NULL,
  count INT NOT NULL,
  year INT DEFAULT EXTRACT(YEAR FROM now())
);

CREATE TABLE staff_performance (
  id SERIAL PRIMARY KEY,
  staff_id UUID REFERENCES profiles(id),
  name TEXT,
  score INT CHECK (score >= 0 AND score <= 100),
  period TEXT
);

-- Auto-create profile on signup (optional; server also inserts)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM set_config('row_security', 'off', true);

  INSERT INTO public.profiles (id, email, first_name, middle_name, last_name, phone, role, is_active, is_locked)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NULLIF(NEW.raw_user_meta_data->>'first_name', ''), 'User'),
    NULLIF(NEW.raw_user_meta_data->>'middle_name', ''),
    COALESCE(NULLIF(NEW.raw_user_meta_data->>'last_name', ''), 'Patient'),
    NULLIF(NEW.raw_user_meta_data->>'phone', ''),
    'patient'::public.user_role,
    true,
    false
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    first_name = EXCLUDED.first_name,
    middle_name = EXCLUDED.middle_name,
    last_name = EXCLUDED.last_name,
    phone = EXCLUDED.phone,
    updated_at = now();

  RETURN NEW;
EXCEPTION
  WHEN others THEN
    RAISE WARNING 'handle_new_user profile insert skipped for %: %', NEW.email, SQLERRM;
    RETURN NEW;
END;
$$;

ALTER FUNCTION public.handle_new_user() OWNER TO postgres;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE medical_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own profile"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users insert own profile"
  ON profiles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users update own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY "Patients see own appointments"
  ON appointments FOR SELECT
  USING (auth.uid() = patient_id);

CREATE POLICY "Patients see own feedback"
  ON feedback FOR SELECT
  USING (auth.uid() = patient_id);

CREATE POLICY "Patients see own records"
  ON medical_records FOR SELECT
  USING (auth.uid() = patient_id);

CREATE POLICY "Admins read audit logs"
  ON audit_logs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

-- Seed demo statistics
INSERT INTO patient_statistics (month, count) VALUES
  ('Dec', 45), ('Jan', 52), ('Feb', 48), ('Mar', 61), ('Apr', 55), ('May', 58);

INSERT INTO staff_performance (name, score) VALUES
  ('Dr. Maria Santos', 94),
  ('Midwife Ana Reyes', 91),
  ('Dr. James Gawaran', 97),
  ('Nurse Cruz', 88);

-- Create first admin (replace UUID after creating user in Auth dashboard):
-- UPDATE profiles SET role = 'admin' WHERE email = 'admin@clinicgawaran.ph';
