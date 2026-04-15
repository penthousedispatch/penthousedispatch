/*
  # Driver Payment System

  ## Overview
  Adds full driver payout infrastructure including bank accounts, payouts, earnings logs,
  tax documents, and payout partner routing.

  ## New Tables

  ### driver_bank_accounts
  Stores driver bank account info for ACH payouts. Sensitive fields (routing/account numbers)
  are stored as masked values only; actual sensitive data lives in Stripe Connect.
  - id, driver_id, stripe_account_id (Stripe Connect account)
  - account_holder_name, bank_name, account_type (checking/savings)
  - last4 (last 4 digits of account for display)
  - routing_last4 (last 4 of routing for display)
  - verification_status (pending/verified/failed/requires_action)
  - is_default, is_active
  - created_at, updated_at

  ### driver_tax_info
  Stores W9 / tax filing info per driver for 1099-NEC generation.
  - driver_id (one-to-one with drivers)
  - legal_name, tax_id_last4 (last 4 of SSN/EIN only)
  - address fields
  - tax_classification (individual/sole_prop/llc/corp)
  - w9_completed_at
  - is_1099_eligible

  ### driver_earnings_log
  Permanent SQL record of each earning entry (supplements Firebase real-time data).
  - driver_id, org_id
  - earn_date, pay_period_start, pay_period_end
  - trips_completed, hours_worked, miles_driven
  - gross_revenue (what company collected)
  - base_pay, bonus_pay, total_pay (what driver earned)
  - notes

  ### payout_partners
  Third-party payroll companies that can fund driver payouts.
  - org_id, name, contact_email, stripe_account_id
  - is_active, is_default
  - notes

  ### driver_payouts
  Every payout transaction sent to a driver.
  - driver_id, org_id
  - pay_period_start, pay_period_end
  - gross_amount, deductions, net_amount
  - status (pending/processing/paid/failed/cancelled/returned)
  - payment_method (stripe_ach/manual/partner)
  - paid_by (our org or partner)
  - payout_partner_id (if routed through partner)
  - stripe_transfer_id, stripe_payout_id
  - initiated_by (user who triggered payout)
  - initiated_at, completed_at
  - failure_reason, retry_count

  ### driver_tax_documents
  Annual 1099-NEC records for tax filing.
  - driver_id, org_id, tax_year
  - total_compensation (annual earnings)
  - document_status (draft/ready/sent/filed)
  - generated_at, sent_at, filed_at

  ## Security
  - RLS enabled on all tables
  - Drivers can view their own bank accounts, payouts, earnings, and tax docs
  - Dispatchers can view all records for their org
  - Only admins can trigger payouts and manage tax docs
*/

-- ============================================================
-- DRIVER BANK ACCOUNTS
-- ============================================================
CREATE TABLE IF NOT EXISTS driver_bank_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id uuid NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
  stripe_account_id text,
  account_holder_name text NOT NULL DEFAULT '',
  bank_name text DEFAULT '',
  account_type text NOT NULL DEFAULT 'checking' CHECK (account_type IN ('checking','savings')),
  last4 text DEFAULT '',
  routing_last4 text DEFAULT '',
  verification_status text NOT NULL DEFAULT 'pending' CHECK (
    verification_status IN ('pending','verified','failed','requires_action')
  ),
  is_default boolean NOT NULL DEFAULT true,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE driver_bank_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Drivers can view own bank accounts"
  ON driver_bank_accounts FOR SELECT
  TO authenticated
  USING (
    driver_id IN (SELECT id FROM drivers WHERE id = driver_bank_accounts.driver_id AND auth.uid()::text = id::text)
    OR
    EXISTS (
      SELECT 1 FROM org_members WHERE user_id = auth.uid() AND role IN ('admin','dispatcher','superadmin')
    )
  );

CREATE POLICY "Drivers can insert own bank accounts"
  ON driver_bank_accounts FOR INSERT
  TO authenticated
  WITH CHECK (
    driver_id IN (SELECT id FROM drivers WHERE id = driver_bank_accounts.driver_id AND auth.uid()::text = id::text)
    OR
    EXISTS (
      SELECT 1 FROM org_members WHERE user_id = auth.uid() AND role IN ('admin','superadmin')
    )
  );

CREATE POLICY "Drivers can update own bank accounts"
  ON driver_bank_accounts FOR UPDATE
  TO authenticated
  USING (
    driver_id IN (SELECT id FROM drivers WHERE id = driver_bank_accounts.driver_id AND auth.uid()::text = id::text)
    OR
    EXISTS (
      SELECT 1 FROM org_members WHERE user_id = auth.uid() AND role IN ('admin','superadmin')
    )
  )
  WITH CHECK (
    driver_id IN (SELECT id FROM drivers WHERE id = driver_bank_accounts.driver_id AND auth.uid()::text = id::text)
    OR
    EXISTS (
      SELECT 1 FROM org_members WHERE user_id = auth.uid() AND role IN ('admin','superadmin')
    )
  );

-- ============================================================
-- DRIVER TAX INFO (W9 / 1099 data)
-- ============================================================
CREATE TABLE IF NOT EXISTS driver_tax_info (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id uuid NOT NULL UNIQUE REFERENCES drivers(id) ON DELETE CASCADE,
  legal_name text NOT NULL DEFAULT '',
  tax_id_last4 text DEFAULT '',
  address_line1 text DEFAULT '',
  address_line2 text DEFAULT '',
  city text DEFAULT '',
  state text DEFAULT '',
  zip text DEFAULT '',
  tax_classification text NOT NULL DEFAULT 'individual' CHECK (
    tax_classification IN ('individual','sole_prop','llc_single','llc_partnership','c_corp','s_corp','other')
  ),
  w9_completed_at timestamptz,
  is_1099_eligible boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE driver_tax_info ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Drivers can view own tax info"
  ON driver_tax_info FOR SELECT
  TO authenticated
  USING (
    driver_id IN (SELECT id FROM drivers WHERE id = driver_tax_info.driver_id AND auth.uid()::text = id::text)
    OR
    EXISTS (
      SELECT 1 FROM org_members WHERE user_id = auth.uid() AND role IN ('admin','superadmin')
    )
  );

CREATE POLICY "Drivers can insert own tax info"
  ON driver_tax_info FOR INSERT
  TO authenticated
  WITH CHECK (
    driver_id IN (SELECT id FROM drivers WHERE id = driver_tax_info.driver_id AND auth.uid()::text = id::text)
    OR
    EXISTS (
      SELECT 1 FROM org_members WHERE user_id = auth.uid() AND role IN ('admin','superadmin')
    )
  );

CREATE POLICY "Drivers can update own tax info"
  ON driver_tax_info FOR UPDATE
  TO authenticated
  USING (
    driver_id IN (SELECT id FROM drivers WHERE id = driver_tax_info.driver_id AND auth.uid()::text = id::text)
    OR
    EXISTS (
      SELECT 1 FROM org_members WHERE user_id = auth.uid() AND role IN ('admin','superadmin')
    )
  )
  WITH CHECK (
    driver_id IN (SELECT id FROM drivers WHERE id = driver_tax_info.driver_id AND auth.uid()::text = id::text)
    OR
    EXISTS (
      SELECT 1 FROM org_members WHERE user_id = auth.uid() AND role IN ('admin','superadmin')
    )
  );

-- ============================================================
-- DRIVER EARNINGS LOG
-- ============================================================
CREATE TABLE IF NOT EXISTS driver_earnings_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id uuid NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
  org_id uuid REFERENCES organizations(id) ON DELETE SET NULL,
  earn_date date NOT NULL DEFAULT CURRENT_DATE,
  pay_period_start date NOT NULL DEFAULT CURRENT_DATE,
  pay_period_end date NOT NULL DEFAULT CURRENT_DATE,
  trips_completed integer NOT NULL DEFAULT 0,
  hours_worked numeric(6,2) NOT NULL DEFAULT 0,
  miles_driven numeric(8,2) NOT NULL DEFAULT 0,
  gross_revenue numeric(10,2) NOT NULL DEFAULT 0,
  base_pay numeric(10,2) NOT NULL DEFAULT 0,
  bonus_pay numeric(10,2) NOT NULL DEFAULT 0,
  total_pay numeric(10,2) NOT NULL DEFAULT 0,
  notes text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE driver_earnings_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Drivers can view own earnings log"
  ON driver_earnings_log FOR SELECT
  TO authenticated
  USING (
    driver_id IN (SELECT id FROM drivers WHERE id = driver_earnings_log.driver_id AND auth.uid()::text = id::text)
    OR
    EXISTS (
      SELECT 1 FROM org_members WHERE user_id = auth.uid() AND role IN ('admin','dispatcher','superadmin')
    )
  );

CREATE POLICY "Admins and dispatchers can insert earnings log"
  ON driver_earnings_log FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM org_members WHERE user_id = auth.uid() AND role IN ('admin','dispatcher','superadmin')
    )
  );

CREATE POLICY "Admins can update earnings log"
  ON driver_earnings_log FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM org_members WHERE user_id = auth.uid() AND role IN ('admin','superadmin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM org_members WHERE user_id = auth.uid() AND role IN ('admin','superadmin')
    )
  );

-- ============================================================
-- PAYOUT PARTNERS (third-party payroll companies)
-- ============================================================
CREATE TABLE IF NOT EXISTS payout_partners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT '',
  contact_email text DEFAULT '',
  stripe_account_id text DEFAULT '',
  is_active boolean NOT NULL DEFAULT true,
  is_default boolean NOT NULL DEFAULT false,
  notes text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE payout_partners ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org admins can view payout partners"
  ON payout_partners FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM org_members
      WHERE user_id = auth.uid() AND org_id = payout_partners.org_id
      AND role IN ('admin','superadmin')
    )
  );

CREATE POLICY "Org admins can insert payout partners"
  ON payout_partners FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM org_members
      WHERE user_id = auth.uid() AND org_id = payout_partners.org_id
      AND role IN ('admin','superadmin')
    )
  );

CREATE POLICY "Org admins can update payout partners"
  ON payout_partners FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM org_members
      WHERE user_id = auth.uid() AND org_id = payout_partners.org_id
      AND role IN ('admin','superadmin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM org_members
      WHERE user_id = auth.uid() AND org_id = payout_partners.org_id
      AND role IN ('admin','superadmin')
    )
  );

-- ============================================================
-- DRIVER PAYOUTS
-- ============================================================
CREATE TABLE IF NOT EXISTS driver_payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id uuid NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
  org_id uuid REFERENCES organizations(id) ON DELETE SET NULL,
  bank_account_id uuid REFERENCES driver_bank_accounts(id) ON DELETE SET NULL,
  payout_partner_id uuid REFERENCES payout_partners(id) ON DELETE SET NULL,
  pay_period_start date NOT NULL,
  pay_period_end date NOT NULL,
  gross_amount numeric(10,2) NOT NULL DEFAULT 0,
  deductions numeric(10,2) NOT NULL DEFAULT 0,
  net_amount numeric(10,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending','processing','paid','failed','cancelled','returned')
  ),
  payment_method text NOT NULL DEFAULT 'stripe_ach' CHECK (
    payment_method IN ('stripe_ach','manual','partner','check')
  ),
  paid_by text NOT NULL DEFAULT 'platform' CHECK (
    paid_by IN ('platform','partner')
  ),
  stripe_transfer_id text DEFAULT '',
  stripe_payout_id text DEFAULT '',
  initiated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  initiated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  failure_reason text DEFAULT '',
  retry_count integer NOT NULL DEFAULT 0,
  notes text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE driver_payouts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Drivers can view own payouts"
  ON driver_payouts FOR SELECT
  TO authenticated
  USING (
    driver_id IN (SELECT id FROM drivers WHERE id = driver_payouts.driver_id AND auth.uid()::text = id::text)
    OR
    EXISTS (
      SELECT 1 FROM org_members WHERE user_id = auth.uid() AND role IN ('admin','dispatcher','superadmin')
    )
  );

CREATE POLICY "Admins can insert payouts"
  ON driver_payouts FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM org_members WHERE user_id = auth.uid() AND role IN ('admin','superadmin')
    )
  );

CREATE POLICY "Admins can update payouts"
  ON driver_payouts FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM org_members WHERE user_id = auth.uid() AND role IN ('admin','superadmin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM org_members WHERE user_id = auth.uid() AND role IN ('admin','superadmin')
    )
  );

-- ============================================================
-- DRIVER TAX DOCUMENTS (1099-NEC)
-- ============================================================
CREATE TABLE IF NOT EXISTS driver_tax_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id uuid NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
  org_id uuid REFERENCES organizations(id) ON DELETE SET NULL,
  tax_year integer NOT NULL,
  total_compensation numeric(12,2) NOT NULL DEFAULT 0,
  document_status text NOT NULL DEFAULT 'draft' CHECK (
    document_status IN ('draft','ready','sent','filed')
  ),
  generated_at timestamptz,
  sent_at timestamptz,
  filed_at timestamptz,
  notes text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(driver_id, tax_year)
);

ALTER TABLE driver_tax_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Drivers can view own tax documents"
  ON driver_tax_documents FOR SELECT
  TO authenticated
  USING (
    driver_id IN (SELECT id FROM drivers WHERE id = driver_tax_documents.driver_id AND auth.uid()::text = id::text)
    OR
    EXISTS (
      SELECT 1 FROM org_members WHERE user_id = auth.uid() AND role IN ('admin','superadmin')
    )
  );

CREATE POLICY "Admins can insert tax documents"
  ON driver_tax_documents FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM org_members WHERE user_id = auth.uid() AND role IN ('admin','superadmin')
    )
  );

CREATE POLICY "Admins can update tax documents"
  ON driver_tax_documents FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM org_members WHERE user_id = auth.uid() AND role IN ('admin','superadmin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM org_members WHERE user_id = auth.uid() AND role IN ('admin','superadmin')
    )
  );

-- ============================================================
-- INDEXES for performance
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_driver_bank_accounts_driver_id ON driver_bank_accounts(driver_id);
CREATE INDEX IF NOT EXISTS idx_driver_earnings_log_driver_id ON driver_earnings_log(driver_id);
CREATE INDEX IF NOT EXISTS idx_driver_earnings_log_earn_date ON driver_earnings_log(earn_date);
CREATE INDEX IF NOT EXISTS idx_driver_earnings_log_period ON driver_earnings_log(pay_period_start, pay_period_end);
CREATE INDEX IF NOT EXISTS idx_driver_payouts_driver_id ON driver_payouts(driver_id);
CREATE INDEX IF NOT EXISTS idx_driver_payouts_status ON driver_payouts(status);
CREATE INDEX IF NOT EXISTS idx_driver_payouts_period ON driver_payouts(pay_period_start, pay_period_end);
CREATE INDEX IF NOT EXISTS idx_driver_tax_documents_driver_id ON driver_tax_documents(driver_id);
CREATE INDEX IF NOT EXISTS idx_driver_tax_documents_year ON driver_tax_documents(tax_year);
CREATE INDEX IF NOT EXISTS idx_payout_partners_org_id ON payout_partners(org_id);
