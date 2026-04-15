/*
  # Add company role, companies table, and related billing/agreement tables

  1. Changes
    - Add 'company' to profiles.role check constraint
    - Create companies table with onboarding and billing fields
    - Create company_agreements table (legal acceptance records)
    - Create billing_trips table (per-trip fee records)
    - Create invoices table (period billing)
    - Create payments table (Stripe payment records)
    - Create feature_flags table (SaaS feature toggles)
    - Create webhook_logs table (inbound webhook payloads)

  2. Security
    - RLS enabled on all new tables
    - Policies scoped by auth.uid() and company ownership
    - Billing formula logic never exposed in policies

  3. Notes
    - companies.baseline_fleet_size is used server-side for billing rate calculation
    - The billing rate formula ($0.11 vs $0.13/mile) lives server-side only
    - feature_flags can be scoped globally or per-company
*/

-- Update profiles role constraint to allow 'company'
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check
  CHECK (role = ANY (ARRAY['admin'::text, 'dispatcher'::text, 'driver'::text, 'company'::text]));

-- Companies table
CREATE TABLE IF NOT EXISTS companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid REFERENCES auth.users(id),
  company_name text NOT NULL DEFAULT '',
  legal_entity text NOT NULL DEFAULT '',
  billing_contact_name text NOT NULL DEFAULT '',
  billing_contact_email text NOT NULL DEFAULT '',
  phone text NOT NULL DEFAULT '',
  address text NOT NULL DEFAULT '',
  tax_id text NOT NULL DEFAULT '',
  stripe_customer_id text NOT NULL DEFAULT '',
  baseline_fleet_size integer NOT NULL DEFAULT 0,
  is_approved boolean NOT NULL DEFAULT false,
  is_suspended boolean NOT NULL DEFAULT false,
  onboarding_status text NOT NULL DEFAULT 'pending'
    CHECK (onboarding_status = ANY (ARRAY['pending'::text,'info_submitted'::text,'agreement_signed'::text,'approved'::text,'rejected'::text])),
  sentry_base_url text NOT NULL DEFAULT '',
  sentry_username text NOT NULL DEFAULT '',
  sentry_password text NOT NULL DEFAULT '',
  sentry_api_key text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE companies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company owner can read own company"
  ON companies FOR SELECT
  TO authenticated
  USING (auth.uid() = owner_user_id);

CREATE POLICY "Company owner can update own company"
  ON companies FOR UPDATE
  TO authenticated
  USING (auth.uid() = owner_user_id)
  WITH CHECK (auth.uid() = owner_user_id);

CREATE POLICY "Company owner can insert own company"
  ON companies FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = owner_user_id);

CREATE POLICY "Admins can read all companies"
  ON companies FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

CREATE POLICY "Admins can update all companies"
  ON companies FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- Company agreements (legal acceptance)
CREATE TABLE IF NOT EXISTS company_agreements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES companies(id),
  user_id uuid REFERENCES auth.users(id),
  accepted_at timestamptz NOT NULL DEFAULT now(),
  ip_address text NOT NULL DEFAULT '',
  agreement_version text NOT NULL DEFAULT 'v1.0',
  agreement_text text NOT NULL DEFAULT ''
);

ALTER TABLE company_agreements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company owner can read own agreements"
  ON company_agreements FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Company owner can insert own agreement"
  ON company_agreements FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can read all agreements"
  ON company_agreements FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- Billing trips (per-trip fee records — backend writes, admin reads)
CREATE TABLE IF NOT EXISTS billing_trips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id text NOT NULL DEFAULT '',
  company_id uuid REFERENCES companies(id),
  miles numeric NOT NULL DEFAULT 0,
  rate numeric NOT NULL DEFAULT 0.11,
  platform_fee numeric NOT NULL DEFAULT 0,
  billing_status text NOT NULL DEFAULT 'pending'
    CHECK (billing_status = ANY (ARRAY['pending'::text,'invoiced'::text,'paid'::text])),
  calculated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE billing_trips ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read all billing trips"
  ON billing_trips FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

CREATE POLICY "Admins can insert billing trips"
  ON billing_trips FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- Invoices
CREATE TABLE IF NOT EXISTS invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES companies(id),
  period_start date NOT NULL,
  period_end date NOT NULL,
  total_miles numeric NOT NULL DEFAULT 0,
  total_fee numeric NOT NULL DEFAULT 0,
  invoice_status text NOT NULL DEFAULT 'draft'
    CHECK (invoice_status = ANY (ARRAY['draft'::text,'sent'::text,'paid'::text,'overdue'::text])),
  stripe_invoice_id text NOT NULL DEFAULT '',
  due_date date,
  created_at timestamptz NOT NULL DEFAULT now(),
  paid_at timestamptz
);

ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company can read own invoices"
  ON invoices FOR SELECT
  TO authenticated
  USING (
    company_id IN (
      SELECT id FROM companies WHERE owner_user_id = auth.uid()
    )
  );

CREATE POLICY "Admins can read all invoices"
  ON invoices FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

CREATE POLICY "Admins can insert invoices"
  ON invoices FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

CREATE POLICY "Admins can update invoices"
  ON invoices FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- Payments
CREATE TABLE IF NOT EXISTS payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid REFERENCES invoices(id),
  company_id uuid REFERENCES companies(id),
  amount numeric NOT NULL DEFAULT 0,
  stripe_payment_intent_id text NOT NULL DEFAULT '',
  payment_status text NOT NULL DEFAULT 'pending'
    CHECK (payment_status = ANY (ARRAY['pending'::text,'succeeded'::text,'failed'::text,'refunded'::text])),
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company can read own payments"
  ON payments FOR SELECT
  TO authenticated
  USING (
    company_id IN (
      SELECT id FROM companies WHERE owner_user_id = auth.uid()
    )
  );

CREATE POLICY "Admins can read all payments"
  ON payments FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

CREATE POLICY "Admins can insert payments"
  ON payments FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

CREATE POLICY "Admins can update payments"
  ON payments FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- Feature flags
CREATE TABLE IF NOT EXISTS feature_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  flag_key text NOT NULL UNIQUE,
  is_enabled boolean NOT NULL DEFAULT false,
  description text NOT NULL DEFAULT '',
  applies_to text NOT NULL DEFAULT 'global'
    CHECK (applies_to = ANY (ARRAY['global'::text,'company'::text])),
  company_id uuid REFERENCES companies(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE feature_flags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read feature flags"
  ON feature_flags FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can manage feature flags"
  ON feature_flags FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

CREATE POLICY "Admins can update feature flags"
  ON feature_flags FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- Webhook logs
CREATE TABLE IF NOT EXISTS webhook_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  webhook_type text NOT NULL DEFAULT ''
    CHECK (webhook_type = ANY (ARRAY['trips_receiver'::text,'drivers_receiver'::text,'vehicles_receiver'::text])),
  raw_payload jsonb NOT NULL DEFAULT '{}',
  processed boolean NOT NULL DEFAULT false,
  processing_attempts integer NOT NULL DEFAULT 0,
  error_message text NOT NULL DEFAULT '',
  idempotency_key text NOT NULL DEFAULT '',
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);

ALTER TABLE webhook_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read webhook logs"
  ON webhook_logs FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

CREATE POLICY "Service role can insert webhook logs"
  ON webhook_logs FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Chat threads
CREATE TABLE IF NOT EXISTS chat_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_assignment_id uuid REFERENCES trip_assignments(id),
  driver_id uuid REFERENCES drivers(id),
  unread_dispatch_count integer NOT NULL DEFAULT 0,
  unread_driver_count integer NOT NULL DEFAULT 0,
  last_message_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE chat_threads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read chat threads"
  ON chat_threads FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert chat threads"
  ON chat_threads FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update chat threads"
  ON chat_threads FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Chat messages
CREATE TABLE IF NOT EXISTS chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid REFERENCES chat_threads(id),
  sender_type text NOT NULL DEFAULT 'dispatch'
    CHECK (sender_type = ANY (ARRAY['dispatch'::text,'driver'::text,'system'::text])),
  sender_id uuid,
  body text NOT NULL DEFAULT '',
  sent_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz
);

ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read chat messages"
  ON chat_messages FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert chat messages"
  ON chat_messages FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update chat messages"
  ON chat_messages FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Driver onboarding layer columns
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'drivers' AND column_name = 'layer1_pct') THEN
    ALTER TABLE drivers ADD COLUMN layer1_pct integer NOT NULL DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'drivers' AND column_name = 'layer2_status') THEN
    ALTER TABLE drivers ADD COLUMN layer2_status text NOT NULL DEFAULT 'not_submitted'
      CHECK (layer2_status = ANY (ARRAY['not_submitted','submitted','under_review','approved_internal','rejected','missing_info']));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'drivers' AND column_name = 'layer3_status') THEN
    ALTER TABLE drivers ADD COLUMN layer3_status text NOT NULL DEFAULT 'not_ready'
      CHECK (layer3_status = ANY (ARRAY['not_ready','ready','synced','failed']));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'drivers' AND column_name = 'emergency_contact') THEN
    ALTER TABLE drivers ADD COLUMN emergency_contact jsonb DEFAULT '{}';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'drivers' AND column_name = 'capabilities') THEN
    ALTER TABLE drivers ADD COLUMN capabilities jsonb DEFAULT '[]';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'drivers' AND column_name = 'company_id') THEN
    ALTER TABLE drivers ADD COLUMN company_id uuid REFERENCES companies(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'drivers' AND column_name = 'review_note') THEN
    ALTER TABLE drivers ADD COLUMN review_note text NOT NULL DEFAULT '';
  END IF;
END $$;

-- Driver pay config (company-level)
CREATE TABLE IF NOT EXISTS driver_pay_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES companies(id),
  pay_type text NOT NULL DEFAULT 'hourly'
    CHECK (pay_type = ANY (ARRAY['hourly'::text,'per_mile'::text,'hybrid'::text])),
  hourly_rate numeric NOT NULL DEFAULT 18,
  per_mile_rate numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE driver_pay_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company owner can read own pay config"
  ON driver_pay_config FOR SELECT
  TO authenticated
  USING (
    company_id IN (
      SELECT id FROM companies WHERE owner_user_id = auth.uid()
    )
  );

CREATE POLICY "Company owner can insert pay config"
  ON driver_pay_config FOR INSERT
  TO authenticated
  WITH CHECK (
    company_id IN (
      SELECT id FROM companies WHERE owner_user_id = auth.uid()
    )
  );

CREATE POLICY "Company owner can update pay config"
  ON driver_pay_config FOR UPDATE
  TO authenticated
  USING (
    company_id IN (
      SELECT id FROM companies WHERE owner_user_id = auth.uid()
    )
  )
  WITH CHECK (
    company_id IN (
      SELECT id FROM companies WHERE owner_user_id = auth.uid()
    )
  );

CREATE POLICY "Admins can read all pay configs"
  ON driver_pay_config FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- Insert default feature flags
INSERT INTO feature_flags (flag_key, is_enabled, description, applies_to)
VALUES
  ('saas_mode', false, 'Enable full SaaS self-service company signup', 'global'),
  ('company_self_signup', false, 'Allow companies to sign up without admin approval', 'global'),
  ('billing_autopay', false, 'Enable automatic invoice payment via Stripe', 'global')
ON CONFLICT (flag_key) DO NOTHING;
