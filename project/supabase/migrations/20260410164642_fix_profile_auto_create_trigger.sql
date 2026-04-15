
/*
  # Fix profile auto-creation on signup

  1. Problem
    - New users cannot insert their own profile due to restrictive RLS
    - Profiles table was empty, blocking driver inserts which check profile role

  2. Fix
    - Add SECURITY DEFINER trigger to auto-create profile on auth user creation
    - Add INSERT policy for users to insert their own profile row
    - Seed missing profiles for existing auth users

  3. Security
    - Trigger bypasses RLS only for the auto-create operation
    - INSERT policy scoped to own row (auth.uid() = id)
*/

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    'admin'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'profiles' AND policyname = 'Users can insert own profile'
  ) THEN
    EXECUTE 'CREATE POLICY "Users can insert own profile" ON profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id)';
  END IF;
END $$;

INSERT INTO public.profiles (id, email, full_name, role)
SELECT id, email, split_part(email, '@', 1), 'admin'
FROM auth.users
WHERE id NOT IN (SELECT id FROM public.profiles)
ON CONFLICT (id) DO NOTHING;
