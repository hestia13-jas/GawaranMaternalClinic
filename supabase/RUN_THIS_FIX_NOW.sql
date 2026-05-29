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

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS profile_photo_url TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS temporary_password_expires_at TIMESTAMPTZ;

NOTIFY pgrst, 'reload schema';

-- Demo accounts:
-- Create these two users in Supabase Authentication first if they do not exist,
-- using password Demo@Gawaran2026, then run the UPDATE statements below.
UPDATE public.profiles
SET role = 'doctor', first_name = COALESCE(NULLIF(first_name, ''), 'Doctor'), last_name = COALESCE(NULLIF(last_name, ''), 'Gawaran'), is_active = true, is_locked = false
WHERE email = 'doctor@clinicgawaran.ph';

UPDATE public.profiles
SET role = 'admin', first_name = COALESCE(NULLIF(first_name, ''), 'Admin'), last_name = COALESCE(NULLIF(last_name, ''), 'Gawaran'), is_active = true, is_locked = false
WHERE email = 'admin@clinicgawaran.ph';

-- All normal public signups are assigned patient by the app.
UPDATE public.profiles
SET role = 'patient'
WHERE role IS NULL;
