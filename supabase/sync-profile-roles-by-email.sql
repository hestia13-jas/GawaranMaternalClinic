-- Run in Supabase SQL Editor when users show the correct name but PATIENT portal.
-- Syncs profiles.role from the row that matches auth.users by email onto the auth user id.

UPDATE public.profiles AS p
SET
  role = src.desired_role,
  first_name = COALESCE(NULLIF(p.first_name, ''), src.first_name),
  last_name = COALESCE(NULLIF(p.last_name, ''), src.last_name),
  updated_at = now()
FROM (
  SELECT
    u.id AS auth_id,
    lower(u.email) AS email,
    p.id AS profile_id,
    p.role AS profile_role,
    CASE lower(split_part(u.email, '@', 1))
      WHEN 'admin' THEN 'admin'::public.user_role
      WHEN 'doctor' THEN 'doctor'::public.user_role
      WHEN 'nurse' THEN 'nurse'::public.user_role
      WHEN 'staff' THEN 'staff'::public.user_role
      WHEN 'patient' THEN 'patient'::public.user_role
      ELSE COALESCE(p.role, 'patient'::public.user_role)
    END AS desired_role,
    p.first_name,
    p.last_name
  FROM auth.users u
  LEFT JOIN public.profiles p ON lower(p.email) = lower(u.email)
  WHERE lower(u.email) LIKE '%@clinicgawaran.ph'
) AS src
WHERE lower(p.email) = src.email
  AND p.id = src.auth_id
  AND src.profile_id IS NOT NULL;

-- If profile id does not match auth id, copy role onto the auth-id row:
INSERT INTO public.profiles (id, email, first_name, last_name, role, is_active, is_locked)
SELECT
  u.id,
  u.email,
  COALESCE(p.first_name, 'User'),
  COALESCE(p.last_name, 'User'),
  CASE lower(split_part(u.email, '@', 1))
    WHEN 'admin' THEN 'admin'::public.user_role
    WHEN 'doctor' THEN 'doctor'::public.user_role
    WHEN 'nurse' THEN 'nurse'::public.user_role
    WHEN 'staff' THEN 'staff'::public.user_role
    ELSE COALESCE(p.role, 'patient'::public.user_role)
  END,
  true,
  false
FROM auth.users u
LEFT JOIN public.profiles p ON lower(p.email) = lower(u.email)
WHERE lower(u.email) LIKE '%@clinicgawaran.ph'
ON CONFLICT (id) DO UPDATE SET
  role = EXCLUDED.role,
  email = EXCLUDED.email,
  first_name = EXCLUDED.first_name,
  last_name = EXCLUDED.last_name,
  updated_at = now();

-- Verify:
SELECT u.email, u.id AS auth_id, p.id AS profile_id, p.role
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE lower(u.email) LIKE '%@clinicgawaran.ph'
ORDER BY u.email;
