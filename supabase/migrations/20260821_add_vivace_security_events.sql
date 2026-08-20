-- Minimal private audit log for administrator and MCP credential lifecycle events.
-- Raw keys and session tokens are never written here.

create table if not exists public.vivace_security_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null
    check (event_type in ('access_key_created','access_key_retired','access_key_revoked')),
  key_type text not null
    check (key_type in ('admin','mcp')),
  key_id uuid,
  actor_session_id uuid,
  created_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

alter table public.vivace_security_events enable row level security;
revoke all on table public.vivace_security_events from public, anon, authenticated;

drop policy if exists vivace_security_events_explicit_deny_clients
  on public.vivace_security_events;
create policy vivace_security_events_explicit_deny_clients
  on public.vivace_security_events
  for all
  to anon, authenticated
  using (false)
  with check (false);

create index if not exists vivace_security_events_created_idx
  on public.vivace_security_events (created_at desc);
