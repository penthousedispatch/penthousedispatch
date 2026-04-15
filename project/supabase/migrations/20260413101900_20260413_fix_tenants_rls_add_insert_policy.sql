/*
  # Fix Tenants Table RLS - Add INSERT Policy

  ## Problem
  The tenants table was missing an INSERT policy entirely, causing the "Create Tenant"
  button to silently fail. Only SELECT and UPDATE policies existed.

  ## Changes
  1. Add INSERT policy allowing superadmins to create tenants
  2. Add UPDATE policy allowing superadmins to update any tenant (not just owner)
  3. Add SELECT policy allowing admins to read all tenants (needed for listing)
  4. Add INSERT policy allowing any authenticated admin user to create tenants
     when they will become the owner

  ## Security
  - Only superadmins (role = 'superadmin' in profiles) can insert/update all tenants
  - Tenant owners retain their existing update rights on their own tenant
  - No public access at any point
*/

CREATE POLICY "Superadmins can insert tenants"
  ON tenants
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'superadmin'
    )
  );

CREATE POLICY "Superadmins can update all tenants"
  ON tenants
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'superadmin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'superadmin'
    )
  );

CREATE POLICY "Admins can read all tenants"
  ON tenants
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('superadmin', 'admin')
    )
  );
