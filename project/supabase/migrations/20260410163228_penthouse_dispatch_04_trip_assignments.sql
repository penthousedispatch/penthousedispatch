/*
  # Add trip_assignments and incentive_badges tables
  These are needed by the dispatch board and earnings tab.
*/

CREATE TABLE IF NOT EXISTS trip_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id text NOT NULL DEFAULT '',
  driver_id uuid REFERENCES drivers(id),
  driver_name text DEFAULT '',
  status text DEFAULT 'pending',
  assigned_at timestamptz DEFAULT now(),
  accepted_at timestamptz,
  completed_at timestamptz,
  rejected_at timestamptz,
  pu_address text DEFAULT '',
  do_address text DEFAULT '',
  pu_time text DEFAULT '',
  delivery_price numeric DEFAULT 0,
  mileage numeric DEFAULT 0,
  notes text DEFAULT ''
);

ALTER TABLE trip_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view assignments"
  ON trip_assignments FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert assignments"
  ON trip_assignments FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update assignments"
  ON trip_assignments FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can delete assignments"
  ON trip_assignments FOR DELETE TO authenticated USING (true);

CREATE TABLE IF NOT EXISTS incentive_badges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id uuid REFERENCES drivers(id),
  badge_type text NOT NULL DEFAULT '',
  amount numeric DEFAULT 0,
  earned_at timestamptz DEFAULT now(),
  notes text DEFAULT ''
);

ALTER TABLE incentive_badges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view badges"
  ON incentive_badges FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert badges"
  ON incentive_badges FOR INSERT TO authenticated WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_trip_assignments_driver ON trip_assignments(driver_id);
CREATE INDEX IF NOT EXISTS idx_trip_assignments_status ON trip_assignments(status);
CREATE INDEX IF NOT EXISTS idx_trip_assignments_assigned_at ON trip_assignments(assigned_at);
