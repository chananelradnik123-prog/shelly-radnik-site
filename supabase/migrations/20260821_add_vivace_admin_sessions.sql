-- Step 11: temporary, revocable admin sessions.
-- The long-lived admin key is used only to create a short-lived session token.

create table if not exists public.vivace_admin_sessions (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  user_agent_hash text not null,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  constraint vivace_admin_session_expiry_check check (expires_at > created_at)
);

alter table public.vivace_admin_sessions enable row level security;
revoke all on table public.vivace_admin_sessions from public, anon, authenticated;

drop policy if exists vivace_admin_sessions_explicit_deny_clients
  on public.vivace_admin_sessions;
create policy vivace_admin_sessions_explicit_deny_clients
  on public.vivace_admin_sessions
  for all
  to anon, authenticated
  using (false)
  with check (false);

create index if not exists vivace_admin_sessions_active_idx
  on public.vivace_admin_sessions (token_hash, expires_at)
  where revoked_at is null;
create index if not exists vivace_admin_sessions_cleanup_idx
  on public.vivace_admin_sessions (expires_at, revoked_at);
