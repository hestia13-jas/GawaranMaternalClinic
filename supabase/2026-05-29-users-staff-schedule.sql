-- Run this in Supabase SQL Editor.
-- It adds an app users table, stores the clinic schedule, and creates 10 staff logins.
-- Shared password for all accounts below: Demo@Gawaran2026

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  profile_id UUID UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  first_name TEXT NOT NULL,
  middle_name TEXT,
  last_name TEXT NOT NULL,
  phone TEXT,
  role public.user_role NOT NULL,
  is_active BOOLEAN DEFAULT true,
  is_locked BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.clinic_schedule_blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  day_group TEXT NOT NULL CHECK (day_group IN ('monday_friday', 'saturday', 'sunday')),
  day_of_week INT CHECK (day_of_week BETWEEN 0 AND 6),
  start_time TIME NOT NULL,
  end_time TIME,
  service_type TEXT NOT NULL,
  notes TEXT,
  is_bookable BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (day_group, day_of_week, start_time, service_type)
);

DROP TABLE IF EXISTS pg_temp.gmc_seed_accounts;

CREATE TEMP TABLE gmc_seed_accounts AS
SELECT
  COALESCE((SELECT id FROM auth.users WHERE auth.users.email = accounts.email), gen_random_uuid()) AS id,
  accounts.email,
  accounts.first_name,
  accounts.middle_name,
  accounts.last_name,
  accounts.phone,
  accounts.account_role,
  'Demo@Gawaran2026'::text AS password
FROM (VALUES
  ('admin@clinicgawaran.ph', 'Admin', null, 'Gawaran', '09170000001', 'admin'::public.user_role),
  ('admin.records@clinicgawaran.ph', 'Records', null, 'Admin', '09170000002', 'admin'::public.user_role),
  ('admin.billing@clinicgawaran.ph', 'Billing', null, 'Admin', '09170000003', 'admin'::public.user_role),
  ('admin.frontdesk@clinicgawaran.ph', 'Frontdesk', null, 'Admin', '09170000004', 'admin'::public.user_role),
  ('admin.operations@clinicgawaran.ph', 'Operations', null, 'Admin', '09170000005', 'admin'::public.user_role),
  ('doctor.ana@clinicgawaran.ph', 'Ana', null, 'Reyes', '09170000006', 'doctor'::public.user_role),
  ('doctor.maria@clinicgawaran.ph', 'Maria', null, 'Santos', '09170000007', 'doctor'::public.user_role),
  ('doctor.lea@clinicgawaran.ph', 'Lea', null, 'Cruz', '09170000008', 'doctor'::public.user_role),
  ('doctor.jose@clinicgawaran.ph', 'Jose', null, 'Dela Cruz', '09170000009', 'doctor'::public.user_role),
  ('doctor.rosario@clinicgawaran.ph', 'Rosario', null, 'Garcia', '09170000010', 'doctor'::public.user_role)
) AS accounts(email, first_name, middle_name, last_name, phone, account_role);

WITH upsert_auth AS (
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
    jsonb_build_object('first_name', first_name, 'middle_name', middle_name, 'last_name', last_name, 'phone', phone),
    false,
    now(),
    now()
  FROM gmc_seed_accounts
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    encrypted_password = EXCLUDED.encrypted_password,
    email_confirmed_at = now(),
    raw_app_meta_data = EXCLUDED.raw_app_meta_data,
    raw_user_meta_data = EXCLUDED.raw_user_meta_data,
    updated_at = now()
  RETURNING id, email
)
DELETE FROM auth.identities
WHERE provider = 'email'
  AND user_id IN (SELECT id FROM upsert_auth);

WITH seeded_auth AS (
  SELECT users.id, users.email
  FROM auth.users users
  JOIN gmc_seed_accounts seed ON seed.email = users.email
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
  seeded_auth.id,
  seeded_auth.id::text,
  jsonb_build_object('sub', seeded_auth.id::text, 'email', seeded_auth.email),
  'email',
  now(),
  now(),
  now()
FROM seeded_auth;

INSERT INTO public.profiles (id, email, first_name, middle_name, last_name, phone, role, is_active, is_locked)
SELECT id, email, first_name, middle_name, last_name, phone, account_role, true, false
FROM gmc_seed_accounts
ON CONFLICT (id) DO UPDATE SET
  email = EXCLUDED.email,
  first_name = EXCLUDED.first_name,
  middle_name = EXCLUDED.middle_name,
  last_name = EXCLUDED.last_name,
  phone = EXCLUDED.phone,
  role = EXCLUDED.role,
  is_active = true,
  is_locked = false,
  updated_at = now();

INSERT INTO public.users (id, profile_id, email, first_name, middle_name, last_name, phone, role, is_active, is_locked)
SELECT id, id, email, first_name, middle_name, last_name, phone, account_role, true, false
FROM gmc_seed_accounts
ON CONFLICT (id) DO UPDATE SET
  profile_id = EXCLUDED.profile_id,
  email = EXCLUDED.email,
  first_name = EXCLUDED.first_name,
  middle_name = EXCLUDED.middle_name,
  last_name = EXCLUDED.last_name,
  phone = EXCLUDED.phone,
  role = EXCLUDED.role,
  is_active = true,
  is_locked = false,
  updated_at = now();

INSERT INTO public.clinic_schedule_blocks (day_group, day_of_week, start_time, end_time, service_type, notes, is_bookable)
SELECT *
FROM (VALUES
  ('monday_friday', 1, '08:00'::time, '10:00'::time, 'Prenatal Care', 'Check-ups, vitals, pregnancy monitoring', true),
  ('monday_friday', 1, '10:00'::time, '12:00'::time, 'OB-GYN Consultation & Family Planning', null, true),
  ('monday_friday', 1, '12:00'::time, '13:00'::time, 'Break / Emergency standby', null, false),
  ('monday_friday', 1, '13:00'::time, '15:00'::time, 'Ultrasound & Monitoring', null, true),
  ('monday_friday', 1, '15:00'::time, '17:00'::time, 'Pediatric Care & Immunization', null, true),
  ('monday_friday', 1, '17:00'::time, '19:00'::time, 'Postnatal Care (mother & newborn recovery)', null, true),
  ('monday_friday', 1, '19:00'::time, null, 'Labor & Delivery (24/7 coverage)', null, true),
  ('saturday', 6, '08:00'::time, '10:00'::time, 'Prenatal Care', null, true),
  ('saturday', 6, '10:00'::time, '12:00'::time, 'OB-GYN Consultation', null, true),
  ('saturday', 6, '12:00'::time, '13:00'::time, 'Break / Emergency standby', null, false),
  ('saturday', 6, '13:00'::time, '15:00'::time, 'Ultrasound & Monitoring', null, true),
  ('saturday', 6, '15:00'::time, '17:00'::time, 'Pediatric Care & Immunization', null, true),
  ('saturday', 6, '17:00'::time, '19:00'::time, 'Postnatal Care', null, true),
  ('saturday', 6, '19:00'::time, null, 'Labor & Delivery (24/7 coverage)', null, true),
  ('sunday', 0, '00:00'::time, null, 'Emergency Care (24/7)', null, true),
  ('sunday', 0, '00:30'::time, null, 'Labor & Delivery (24/7 coverage)', null, true)
) AS schedule(day_group, day_of_week, start_time, end_time, service_type, notes, is_bookable)
ON CONFLICT (day_group, day_of_week, start_time, service_type) DO UPDATE SET
  end_time = EXCLUDED.end_time,
  notes = EXCLUDED.notes,
  is_bookable = EXCLUDED.is_bookable;
