/*
  # Add Bot Service Toggles to AI Settings

  ## Summary
  Adds per-bot enable/disable flags to the ai_settings table so dispatchers
  can quickly turn each bot on or off from the AI Settings panel without
  navigating to the advanced BotTeamPanel controls.

  ## Changes

  ### Modified Tables
  - `ai_settings`
    - `sentry_bot_enabled` (boolean, default true) — controls SentryBot (marketplace trip puller)
    - `scheduler_bot_enabled` (boolean, default true) — controls SchedulerBot (auto-assignment engine)
    - `health_bot_enabled` (boolean, default true) — controls HealthBot (system monitor)
    - `security_bot_enabled` (boolean, default true) — controls SecurityBot (policy enforcer)
    - `all_bots_paused` (boolean, default false) — master pause switch for all bots at once

  ## Notes
  1. All columns default to true (bots active) so existing orgs are unaffected
  2. The `all_bots_paused` flag is a fast-path override — when true, all bots stop regardless of individual toggles
  3. These flags are read by BotTeamPanel at runtime to respect the AI Settings state
  4. Safe to run multiple times (IF NOT EXISTS guards)
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ai_settings' AND column_name = 'sentry_bot_enabled'
  ) THEN
    ALTER TABLE ai_settings ADD COLUMN sentry_bot_enabled boolean DEFAULT true;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ai_settings' AND column_name = 'scheduler_bot_enabled'
  ) THEN
    ALTER TABLE ai_settings ADD COLUMN scheduler_bot_enabled boolean DEFAULT true;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ai_settings' AND column_name = 'health_bot_enabled'
  ) THEN
    ALTER TABLE ai_settings ADD COLUMN health_bot_enabled boolean DEFAULT true;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ai_settings' AND column_name = 'security_bot_enabled'
  ) THEN
    ALTER TABLE ai_settings ADD COLUMN security_bot_enabled boolean DEFAULT true;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ai_settings' AND column_name = 'all_bots_paused'
  ) THEN
    ALTER TABLE ai_settings ADD COLUMN all_bots_paused boolean DEFAULT false;
  END IF;
END $$;
