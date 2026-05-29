CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
DECLARE
  trigger_row record;
BEGIN
  FOR trigger_row IN
    SELECT trigger_name
    FROM information_schema.triggers
    WHERE event_object_schema = 'auth'
      AND event_object_table = 'users'
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON auth.users', trigger_row.trigger_name);
  END LOOP;
END $$;

CREATE TABLE IF NOT EXISTS public.user_preferences (
  user_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  theme TEXT NOT NULL DEFAULT 'light' CHECK (theme IN ('light', 'dark')),
  font_size INT NOT NULL DEFAULT 100 CHECK (font_size BETWEEN 90 AND 120),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.clinic_closed_days (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  closed_date DATE NOT NULL UNIQUE,
  reason TEXT,
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.emergency_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID REFERENCES public.profiles(id) NOT NULL,
  message TEXT,
  status TEXT DEFAULT 'new',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.patients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID REFERENCES public.profiles(id),
  status TEXT DEFAULT 'outpatient',
  room TEXT,
  trimester TEXT,
  provider_id UUID REFERENCES public.profiles(id),
  admitted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_patients_profile_id
  ON public.patients(profile_id)
  WHERE profile_id IS NOT NULL;

WITH desired_accounts AS (
  SELECT
    COALESCE((SELECT id FROM auth.users WHERE email = 'doctor@clinicgawaran.ph'), gen_random_uuid()) AS id,
    'doctor@clinicgawaran.ph'::text AS email,
    'Demo@Gawaran2026'::text AS password,
    'Doctor'::text AS first_name,
    'Gawaran'::text AS last_name,
    'doctor'::public.user_role AS account_role
  UNION ALL
  SELECT
    COALESCE((SELECT id FROM auth.users WHERE email = 'admin@clinicgawaran.ph'), gen_random_uuid()) AS id,
    'admin@clinicgawaran.ph'::text AS email,
    'Demo@Gawaran2026'::text AS password,
    'Admin'::text AS first_name,
    'Gawaran'::text AS last_name,
    'admin'::public.user_role AS account_role
),
upsert_users AS (
  INSERT INTO auth.users (
    id,
    instance_id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    is_super_admin,
    created_at,
    updated_at
  )
  SELECT
    id,
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    email,
    crypt(password, gen_salt('bf')),
    now(),
    jsonb_build_object('provider', 'email', 'providers', ARRAY['email']),
    jsonb_build_object('first_name', first_name, 'last_name', last_name),
    false,
    now(),
    now()
  FROM desired_accounts
  ON CONFLICT (email) DO UPDATE SET
    encrypted_password = EXCLUDED.encrypted_password,
    email_confirmed_at = now(),
    raw_app_meta_data = EXCLUDED.raw_app_meta_data,
    raw_user_meta_data = EXCLUDED.raw_user_meta_data,
    updated_at = now()
  RETURNING id, email
)
INSERT INTO auth.identities (
  id,
  user_id,
  provider_id,
  identity_data,
  provider,
  last_sign_in_at,
  created_at,
  updated_at
)
SELECT
  gen_random_uuid(),
  users.id,
  users.id::text,
  jsonb_build_object('sub', users.id::text, 'email', users.email),
  'email',
  now(),
  now(),
  now()
FROM upsert_users users
ON CONFLICT (provider, provider_id) DO UPDATE SET
  identity_data = EXCLUDED.identity_data,
  updated_at = now();

INSERT INTO public.profiles (id, email, first_name, last_name, role, is_active, is_locked)
SELECT users.id, desired.email, desired.first_name, desired.last_name, desired.account_role, true, false
FROM auth.users users
JOIN (
  VALUES
    ('doctor@clinicgawaran.ph', 'Doctor', 'Gawaran', 'doctor'::public.user_role),
    ('admin@clinicgawaran.ph', 'Admin', 'Gawaran', 'admin'::public.user_role)
) AS desired(email, first_name, last_name, account_role)
  ON desired.email = users.email
ON CONFLICT (id) DO UPDATE SET
  email = EXCLUDED.email,
  first_name = EXCLUDED.first_name,
  last_name = EXCLUDED.last_name,
  role = EXCLUDED.role,
  is_active = true,
  is_locked = false,
  updated_at = now();

-- All public signup users are forced to patient by the Node server.
-- This inserts demo admin and doctor only.
