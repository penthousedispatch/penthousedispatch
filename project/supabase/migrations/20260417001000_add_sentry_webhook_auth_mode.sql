alter table public.sentry_config
add column if not exists webhook_auth_mode text not null default 'bearer'
check (webhook_auth_mode in ('bearer', 'query'));
