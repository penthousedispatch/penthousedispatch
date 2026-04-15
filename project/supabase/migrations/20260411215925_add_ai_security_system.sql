/*
  # AI Security System Tables

  ## Overview
  Creates all tables needed for the MITRE ATT&CK-based AI security system.

  ## New Tables

  1. `security_threats`
     - Detected threats with MITRE tactic/technique mapping
     - Severity levels, status tracking, AI analysis summary

  2. `mitre_techniques`
     - Local cache of MITRE ATT&CK techniques
     - Tactic, technique ID, name, description, mitigation

  3. `threat_research_jobs`
     - Background AI research tasks triggered automatically or manually
     - Tracks status, findings, sources researched

  4. `security_alerts`
     - Active alerts surfaced to operators
     - Linked to threats, assignable, acknowledgeable

  5. `security_events`
     - Raw event log (logins, API calls, anomalies)
     - Feed for the AI to analyze

  ## Security
  - RLS enabled on all tables
  - Only admins can read/write security data
*/

-- ─── MITRE Techniques cache ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS mitre_techniques (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  technique_id    text UNIQUE NOT NULL,
  name            text NOT NULL,
  tactic          text NOT NULL,
  description     text DEFAULT '',
  mitigation      text DEFAULT '',
  severity        text DEFAULT 'medium' CHECK (severity IN ('low','medium','high','critical')),
  is_active       boolean DEFAULT true,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

ALTER TABLE mitre_techniques ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read mitre_techniques"
  ON mitre_techniques FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));

CREATE POLICY "Admins can insert mitre_techniques"
  ON mitre_techniques FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));

CREATE POLICY "Admins can update mitre_techniques"
  ON mitre_techniques FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));

CREATE POLICY "Admins can delete mitre_techniques"
  ON mitre_techniques FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));

-- ─── Security Events (raw feed) ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS security_events (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type      text NOT NULL,
  source          text DEFAULT 'system',
  severity        text DEFAULT 'low' CHECK (severity IN ('low','medium','high','critical')),
  description     text DEFAULT '',
  raw_payload     jsonb DEFAULT '{}',
  ip_address      text DEFAULT '',
  user_agent      text DEFAULT '',
  user_id         uuid REFERENCES profiles(id) ON DELETE SET NULL,
  processed       boolean DEFAULT false,
  created_at      timestamptz DEFAULT now()
);

ALTER TABLE security_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read security_events"
  ON security_events FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));

CREATE POLICY "Admins can insert security_events"
  ON security_events FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));

CREATE POLICY "System can insert security_events"
  ON security_events FOR INSERT TO anon
  WITH CHECK (true);

-- ─── Detected Threats ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS security_threats (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title           text NOT NULL,
  description     text DEFAULT '',
  mitre_tactic    text DEFAULT '',
  mitre_technique text DEFAULT '',
  technique_id    text DEFAULT '',
  severity        text DEFAULT 'medium' CHECK (severity IN ('low','medium','high','critical')),
  status          text DEFAULT 'active' CHECK (status IN ('active','investigating','mitigated','false_positive','resolved')),
  confidence      integer DEFAULT 70 CHECK (confidence >= 0 AND confidence <= 100),
  affected_assets jsonb DEFAULT '[]',
  indicators      jsonb DEFAULT '[]',
  ai_analysis     text DEFAULT '',
  mitigation_steps jsonb DEFAULT '[]',
  source_event_ids jsonb DEFAULT '[]',
  detected_by     text DEFAULT 'ai',
  assigned_to     uuid REFERENCES profiles(id) ON DELETE SET NULL,
  resolved_at     timestamptz,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

ALTER TABLE security_threats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read security_threats"
  ON security_threats FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));

CREATE POLICY "Admins can insert security_threats"
  ON security_threats FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));

CREATE POLICY "Admins can update security_threats"
  ON security_threats FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));

CREATE POLICY "Admins can delete security_threats"
  ON security_threats FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));

-- ─── Threat Research Jobs ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS threat_research_jobs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  topic           text NOT NULL,
  query           text DEFAULT '',
  status          text DEFAULT 'pending' CHECK (status IN ('pending','running','completed','failed')),
  triggered_by    text DEFAULT 'ai',
  findings        text DEFAULT '',
  sources         jsonb DEFAULT '[]',
  mitre_mappings  jsonb DEFAULT '[]',
  threat_id       uuid REFERENCES security_threats(id) ON DELETE SET NULL,
  error_message   text DEFAULT '',
  started_at      timestamptz,
  completed_at    timestamptz,
  created_at      timestamptz DEFAULT now()
);

ALTER TABLE threat_research_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read threat_research_jobs"
  ON threat_research_jobs FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));

CREATE POLICY "Admins can insert threat_research_jobs"
  ON threat_research_jobs FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));

CREATE POLICY "Admins can update threat_research_jobs"
  ON threat_research_jobs FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));

-- ─── Security Alerts ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS security_alerts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  threat_id       uuid REFERENCES security_threats(id) ON DELETE CASCADE,
  title           text NOT NULL,
  message         text DEFAULT '',
  severity        text DEFAULT 'medium' CHECK (severity IN ('low','medium','high','critical')),
  acknowledged    boolean DEFAULT false,
  acknowledged_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  acknowledged_at timestamptz,
  created_at      timestamptz DEFAULT now()
);

ALTER TABLE security_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read security_alerts"
  ON security_alerts FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));

CREATE POLICY "Admins can insert security_alerts"
  ON security_alerts FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));

CREATE POLICY "Admins can update security_alerts"
  ON security_alerts FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));

CREATE POLICY "Admins can delete security_alerts"
  ON security_alerts FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));

-- ─── Indexes ───────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_security_threats_status ON security_threats(status);
CREATE INDEX IF NOT EXISTS idx_security_threats_severity ON security_threats(severity);
CREATE INDEX IF NOT EXISTS idx_security_threats_created ON security_threats(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_events_processed ON security_events(processed);
CREATE INDEX IF NOT EXISTS idx_security_events_created ON security_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_threat_research_status ON threat_research_jobs(status);
CREATE INDEX IF NOT EXISTS idx_security_alerts_acknowledged ON security_alerts(acknowledged);

-- ─── Seed MITRE ATT&CK Techniques ─────────────────────────────────────────
INSERT INTO mitre_techniques (technique_id, name, tactic, description, mitigation, severity) VALUES
('T1078', 'Valid Accounts', 'Initial Access', 'Adversaries may obtain and abuse credentials of existing accounts to gain Initial Access.', 'Implement MFA. Monitor for unusual login patterns. Use least privilege.', 'high'),
('T1190', 'Exploit Public-Facing Application', 'Initial Access', 'Adversaries may attempt to take advantage of a weakness in an Internet-facing computer or program.', 'Patch and update all public-facing applications. Use WAF.', 'critical'),
('T1566', 'Phishing', 'Initial Access', 'Adversaries may send phishing messages to gain access to victim systems.', 'Train users on phishing awareness. Use email filtering.', 'high'),
('T1059', 'Command and Scripting Interpreter', 'Execution', 'Adversaries may abuse command and script interpreters to execute commands, scripts, or binaries.', 'Restrict script execution policies. Use application whitelisting.', 'high'),
('T1053', 'Scheduled Task/Job', 'Execution', 'Adversaries may abuse task scheduling functionality to facilitate initial or recurring execution.', 'Monitor scheduled tasks. Restrict task creation to admins.', 'medium'),
('T1547', 'Boot or Logon Autostart Execution', 'Persistence', 'Adversaries may configure system settings to automatically execute a program during system boot.', 'Monitor autostart locations. Use endpoint detection tools.', 'high'),
('T1098', 'Account Manipulation', 'Persistence', 'Adversaries may manipulate accounts to maintain access to victim systems.', 'Monitor account changes. Enable audit logging for all account events.', 'high'),
('T1548', 'Abuse Elevation Control Mechanism', 'Privilege Escalation', 'Adversaries may circumvent mechanisms designed to control elevate privileges.', 'Apply least privilege. Audit sudo and UAC usage.', 'critical'),
('T1055', 'Process Injection', 'Defense Evasion', 'Adversaries may inject code into processes to evade process-based defenses.', 'Use endpoint protection. Monitor for unusual process behaviors.', 'high'),
('T1027', 'Obfuscated Files or Information', 'Defense Evasion', 'Adversaries may attempt to make an executable or file difficult to discover or analyze.', 'Enable script block logging. Use AMSI.', 'medium'),
('T1110', 'Brute Force', 'Credential Access', 'Adversaries may use brute force techniques to gain access to accounts.', 'Implement account lockout policies. Use MFA. Monitor failed logins.', 'high'),
('T1552', 'Unsecured Credentials', 'Credential Access', 'Adversaries may search compromised systems to find insecure credentials.', 'Audit for hardcoded credentials. Use secrets management.', 'critical'),
('T1016', 'System Network Configuration Discovery', 'Discovery', 'Adversaries may look for details about the network configuration of systems.', 'Monitor for network discovery commands. Use network segmentation.', 'low'),
('T1021', 'Remote Services', 'Lateral Movement', 'Adversaries may use Valid Accounts to log into a service specifically designed to accept remote connections.', 'Disable unnecessary remote services. Use jump hosts.', 'high'),
('T1041', 'Exfiltration Over C2 Channel', 'Exfiltration', 'Adversaries may steal data by exfiltrating it over an existing command and control channel.', 'Monitor outbound traffic. Use DLP solutions.', 'critical'),
('T1486', 'Data Encrypted for Impact', 'Impact', 'Adversaries may encrypt data on target systems to interrupt availability.', 'Maintain offline backups. Use endpoint protection with ransomware detection.', 'critical'),
('T1499', 'Endpoint Denial of Service', 'Impact', 'Adversaries may perform Endpoint Denial of Service attacks to degrade or block availability.', 'Use rate limiting. Implement DDoS protection.', 'high'),
('T1071', 'Application Layer Protocol', 'Command and Control', 'Adversaries may communicate using application layer protocols to avoid detection.', 'Monitor for unusual protocol usage. Use network inspection.', 'medium'),
('T1105', 'Ingress Tool Transfer', 'Command and Control', 'Adversaries may transfer tools or other files from an external system into a compromised environment.', 'Monitor for unusual file downloads. Use application control.', 'medium'),
('T1496', 'Resource Hijacking', 'Impact', 'Adversaries may leverage the resources of co-opted systems to solve resource intensive problems.', 'Monitor CPU/GPU usage. Alert on unusual resource consumption.', 'medium')
ON CONFLICT (technique_id) DO NOTHING;
