-- Same as fix-profiles-rls-signup.sql (trigger + RLS). Prefer running fix-profiles-rls-signup.sql.

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

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

DROP POLICY IF EXISTS "Users insert own profile" ON public.profiles;
CREATE POLICY "Users insert own profile"
  ON public.profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);
