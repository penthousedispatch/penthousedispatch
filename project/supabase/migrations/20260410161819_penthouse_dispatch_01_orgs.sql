/*
  # Penthouse Dispatch — Organizations & Members
  Creates multi-tenant foundation tables first.
*/

CREATE TABLE IF NOT EXISTS organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text UNIQUE NOT NULL,
  plan text DEFAULT 'starter',
  sentry_api_key text,
  sentry_base_url text DEFAULT 'https://api.sentryms.com',
  sentry_username text,
  sentry_password text,
  google_maps_key text DEFAULT 'AIzaSyD5sugXJ0HIUwkVlixF5qdoN-I0McgAQM4',
  firebase_config jsonb DEFAULT '{}',
  revenue_target numeric DEFAULT 60,
  mile_threshold numeric DEFAULT 25,
  settings jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS org_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid REFERENCES organizations(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  role text DEFAULT 'dispatcher',
  created_at timestamptz DEFAULT now(),
  UNIQUE(org_id, user_id)
);

ALTER TABLE org_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own memberships"
  ON org_members FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert their own membership"
  ON org_members FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Org members can view their org"
  ON organizations FOR SELECT
  TO authenticated
  USING (id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid()));

CREATE POLICY "Org members can insert org"
  ON organizations FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Org admins can update their org"
  ON organizations FOR UPDATE
  TO authenticated
  USING (id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid() AND role = 'admin'))
  WITH CHECK (id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid() AND role = 'admin'));
