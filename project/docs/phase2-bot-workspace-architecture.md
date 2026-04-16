# Phase 2 Premium Internal Ops Feature: Bot Workspace

This document defines the exact architecture for the in-app multi-bot coding and review workspace that comes **after** the current ops-critical audit is complete:

1. Sentry / testing / sandbox
2. dispatch / scheduler
3. driver / company operational flows

This is a **premium internal ops feature**, not an MVP dispatch feature.

## Goals

- Give platform admin a private in-app workspace for operational AI helpers
- Support both hosted providers and a future self-hosted model path
- Keep a complete memory trail of prompts, patches, reviews, and decisions
- Require approval for risky changes
- Never interfere with company dispatch workflows or tenant isolation

## Bot Roles

### Frank
- Internal bot id: `codex_bot`
- Visible name: `Frank`
- Role: Implementer / fixer
- Default provider: hosted OpenAI
- Optional later provider: self-hosted OpenAI-compatible endpoint
- Responsibilities:
  - investigate operational bugs
  - propose patches
  - generate implementation plans
  - draft migration changes
  - generate test cases

### Darius
- Internal bot id: `claude_bot`
- Visible name: `Darius`
- Role: Reviewer / second opinion
- Default provider: hosted Anthropic
- Optional later provider: self-hosted OpenAI-compatible endpoint
- Responsibilities:
  - review Frank’s patch proposals
  - identify security / UX / risk gaps
  - rate change safety
  - recommend approve / revise / reject

### Perry
- Future internal bot id: `perry_bot`
- Visible name: `Perry`
- Role: User-facing helper / onboarding assistant
- Scope:
  - driver onboarding
  - dispatcher help
  - company help center
- Perry should not share the same approval authority as Frank or Darius.

## Supported Model Paths

### Hosted Providers
- OpenAI
- Anthropic
- Gemini

Use cases:
- fastest setup
- best for early production and operational support

### Self-Hosted Providers
- OpenAI-compatible chat endpoint
- configured with:
  - `base_url`
  - `api_key`
  - `model`

Use cases:
- future cost control
- data residency preferences
- lower variable hosted model dependence

Important:
- self-hosted does **not** mean no cost automatically
- it means you own the deployment path and scaling choices

## Tables

### `bot_workspace_sessions`
Tracks a working thread in the internal bot workspace.

Columns:
- `id`
- `org_id`
- `workspace_type` (`ops`, `code_fix`, `security_review`, `onboarding_design`)
- `title`
- `status` (`open`, `waiting_review`, `approved`, `rejected`, `merged`, `archived`)
- `created_by`
- `assigned_bot_id`
- `reviewer_bot_id`
- `company_id` nullable
- `driver_id` nullable
- `trip_id` nullable
- `source_context` jsonb
- `created_at`
- `updated_at`

### `bot_workspace_messages`
Stores prompt/response history inside a workspace session.

Columns:
- `id`
- `session_id`
- `org_id`
- `bot_id` nullable
- `author_type` (`user`, `bot`, `system`)
- `message_type` (`prompt`, `response`, `review`, `summary`, `decision`)
- `content`
- `structured_payload` jsonb
- `created_at`

### `bot_tasks`
Tracks discrete tasks inside a workspace.

Columns:
- `id`
- `session_id`
- `org_id`
- `title`
- `task_type` (`investigate`, `implement`, `review`, `test`, `release_note`)
- `status` (`queued`, `running`, `blocked`, `completed`, `failed`)
- `owned_by_bot_id`
- `priority`
- `requires_approval` boolean
- `input_payload` jsonb
- `output_payload` jsonb
- `created_at`
- `updated_at`

### `bot_patch_proposals`
Represents a proposed code/database/config change.

Columns:
- `id`
- `session_id`
- `task_id`
- `org_id`
- `proposed_by_bot_id`
- `title`
- `summary`
- `change_scope` (`frontend`, `backend`, `db`, `ops`, `mixed`)
- `risk_level` (`low`, `medium`, `high`, `critical`)
- `files_touched` jsonb
- `patch_text` text
- `test_plan` text
- `rollback_plan` text
- `status` (`draft`, `pending_review`, `approved`, `rejected`, `applied`)
- `created_at`
- `updated_at`

### `bot_reviews`
Stores reviewer output from Darius or a future human reviewer.

Columns:
- `id`
- `proposal_id`
- `org_id`
- `reviewed_by_bot_id` nullable
- `reviewed_by_user_id` nullable
- `decision` (`approve`, `revise`, `reject`)
- `risk_summary`
- `ux_summary`
- `security_summary`
- `notes`
- `created_at`

### `bot_approval_rules`
Defines what bots may do automatically.

Columns:
- `id`
- `org_id`
- `bot_id`
- `action_type`
- `risk_threshold`
- `requires_human_approval`
- `company_scope_only`
- `enabled`
- `created_at`
- `updated_at`

### `bot_runtime_providers`
Normalizes provider configuration if you want to move beyond `bot_memory`.

Columns:
- `id`
- `org_id`
- `bot_id`
- `provider`
- `base_url` nullable
- `model`
- `api_key_ref`
- `settings` jsonb
- `created_at`
- `updated_at`

### `bot_memories`
Long-term operational memory by bot/workspace/company context.

Columns:
- `id`
- `org_id`
- `bot_id`
- `company_id` nullable
- `memory_type` (`issue_pattern`, `fix_pattern`, `review_pattern`, `company_rule`, `dispatch_rule`)
- `title`
- `content`
- `embedding_ref` nullable
- `source_ref` jsonb
- `created_at`
- `updated_at`

## Pages

### Admin > Platform > Bot Workspace
Main premium internal ops page.

Sections:
- session list
- active conversation pane
- task queue
- logs/context rail
- patch proposal viewer
- approval actions

### Admin > Platform > Bot Memory
Search and manage stored memory.

Sections:
- issue patterns
- approved fixes
- company-specific rules
- reviewer notes
- operational playbooks

### Admin > Platform > Bot Providers
Central configuration for hosted vs self-hosted providers.

Sections:
- global defaults
- Frank provider settings
- Darius provider settings
- test connection
- provider failover rules

### Admin > Platform > Bot Approvals
Approval inbox for all pending high-risk changes.

Sections:
- pending proposals
- risk score
- company impact
- approve / reject / request revision

## Memory Design

Memory is split into 3 layers:

### 1. Session Memory
- lives inside `bot_workspace_messages`
- used for current task continuity
- not reused globally unless promoted

### 2. Operational Memory
- recurring issue/fix patterns
- stored in `bot_memories`
- examples:
  - "Sentry save failures often map to RLS policy drift"
  - "driver offline toggle must verify updated rows"

### 3. Company Memory
- company-specific rules and exceptions
- examples:
  - CLJExpress import patterns
  - white-label branding rules
  - company-specific workflow notes

Promotion rule:
- only successful, reviewed fixes should become durable operational memory

## Code Edit Workflow

### Normal Flow
1. User opens Bot Workspace
2. User creates a task
3. Frank investigates and drafts a patch proposal
4. Darius reviews the proposal
5. Human admin approves or requests revision
6. Proposal becomes `approved`
7. Patch is applied in a controlled workspace
8. Build/test runs
9. Results are attached back to the session
10. Approved patterns can be promoted into memory

### Patch Modes

#### Suggest Mode
- bots only draft plans and patches
- no code is changed automatically

#### Workspace Apply Mode
- patch is applied inside the internal code workspace
- build/test runs
- human approval still required before external deploy

#### Future Release Mode
- only after you trust the system
- apply + test + stage for release
- still should not directly deploy to production without final gate

## Approval Rules

### Always Require Human Approval
- schema changes
- auth/permissions changes
- billing/payout changes
- Sentry/provider auth changes
- anything touching tenant isolation
- destructive deletes

### Can Be Auto-Applied Later
- copy tweaks
- safe UI text fixes
- low-risk styling fixes
- internal dashboard wording
- non-destructive logging improvements

### Risk Framework

#### Low
- UI label changes
- harmless copy edits
- internal diagnostics

#### Medium
- feature flag changes
- non-destructive frontend logic changes
- bot behavior adjustments

#### High
- scheduling logic
- dispatch assignment logic
- auth/config writes
- integration behavior changes

#### Critical
- tenant isolation
- billing/payout
- PHI-sensitive flows
- delete/cleanup migrations

## Hosted vs Self-Hosted Strategy

### Default now
- Frank -> OpenAI
- Darius -> Anthropic

### Optional later
- Frank -> self-hosted OpenAI-compatible endpoint
- Darius -> self-hosted OpenAI-compatible endpoint

This should be a per-bot setting, not an all-or-nothing app setting.

## Guardrails

- all bot actions are org-scoped
- company data access must still respect tenant isolation
- no autonomous payout changes
- no autonomous tenant-scope changes
- all code patches must have:
  - summary
  - files touched
  - rollback plan
  - review result

## Rollout Plan

### Phase 2A
- add Frank and Darius as visible bot roles
- hosted/self-hosted provider scaffolding
- Bot Workspace page shell
- memory tables

### Phase 2B
- prompt/session/task workflow
- patch proposal storage
- approval inbox
- review loop

### Phase 2C
- controlled internal code-workspace apply flow
- test/build run capture
- memory promotion
- Perry onboarding helper

