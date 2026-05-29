-- Run this in the Supabase SQL editor to create or reset one admin and one doctor account.
-- Login password for both accounts: Demo@Gawaran2026

CREATE EXTENSION IF NOT EXISTS pgcrypto;

WITH desired_accounts AS (
  SELECT
    COALESCE((SELECT id FROM auth.users WHERE email = 'admin@clinicgawaran.ph'), gen_random_uuid()) AS id,
    'admin@clinicgawaran.ph'::text AS email,
    'Demo@Gawaran2026'::text AS password,
    'Admin'::text AS first_name,
    'Gawaran'::text AS last_name,
    'admin'::public.user_role AS account_role
  UNION ALL
  SELECT
    COALESCE((SELECT id FROM auth.users WHERE email = 'doctor@clinicgawaran.ph'), gen_random_uuid()) AS id,
    'doctor@clinicgawaran.ph'::text AS email,
    'Demo@Gawaran2026'::text AS password,
    'Doctor'::text AS first_name,
    'Gawaran'::text AS last_name,
    'doctor'::public.user_role AS account_role
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
    ('admin@clinicgawaran.ph', 'Admin', 'Gawaran', 'admin'::public.user_role),
    ('doctor@clinicgawaran.ph', 'Doctor', 'Gawaran', 'doctor'::public.user_role)
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
