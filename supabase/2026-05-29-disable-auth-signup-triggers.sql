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

-- The Node server creates/upserts public.profiles after auth.admin.createUser succeeds.
-- Keeping Auth triggers disabled prevents Supabase Auth signup from failing with:
-- "Database error creating new user".
