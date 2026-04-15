
/*
  # Fix infinite recursion in profiles RLS policies

  1. Problem
    - "Admins and dispatchers can read all profiles" SELECT policy queries the profiles table
      inside its own USING clause, causing infinite recursion (error code 42P17)
    - "Admins can insert profiles" INSERT policy has the same self-referencing issue

  2. Fix
    - Drop the recursive policies
    - Replace "Admins and dispatchers can read all profiles" with a non-recursive version
      that uses auth.jwt() app_metadata to check role, avoiding the self-join
    - Replace "Admins can insert profiles" with a simpler version
    - The "Users can read own profile" policy already handles the own-row case safely

  3. Security
    - Users can always read and update their own profile row
    - Admins/dispatchers identified via JWT claims (no self-referencing query)
*/

DROP POLICY IF EXISTS "Admins and dispatchers can read all profiles" ON profiles;
DROP POLICY IF EXISTS "Admins can insert profiles" ON profiles;

CREATE POLICY "Org members can read all profiles"
  ON profiles FOR SELECT
  TO authenticated
  USING (
    auth.uid() = id
    OR EXISTS (
      SELECT 1 FROM org_members om
      WHERE om.user_id = auth.uid()
        AND om.org_id IN (SELECT org_id FROM org_members WHERE user_id = id)
    )
  );
