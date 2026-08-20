-- Step 3: private invitation gate for Vivace Discovery.
-- Creates the invite registry and submission linkage. Enforcement is enabled
-- by the following migration after the frontend is deployed.

create extension if not exists pgcrypto;

create table if not exists public.vivace_discovery_invites (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  label text not null default 'Discovery invite',
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  max_uses integer not null default 1 check (max_uses >= 1 and max_uses <= 1000),
  use_count integer not null default 0 check (use_count >= 0),
  last_used_at timestamptz,
  disabled_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  constraint vivace_discovery_invites_usage_limit_check check (use_count <= max_uses)
);

alter table public.vivace_discovery_invites enable row level security;
revoke all on table public.vivace_discovery_invites from public, anon, authenticated;

alter table public.vivace_discovery_submissions
  add column if not exists invite_id uuid,
  add column if not exists invite_claimed_at timestamptz;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'vivace_discovery_submissions_invite_id_fkey'
      and conrelid = 'public.vivace_discovery_submissions'::regclass
  ) then
    alter table public.vivace_discovery_submissions
      add constraint vivace_discovery_submissions_invite_id_fkey
      foreign key (invite_id)
      references public.vivace_discovery_invites(id)
      on delete set null;
  end if;
end $$;

create index if not exists vivace_discovery_invites_active_idx
  on public.vivace_discovery_invites (expires_at, disabled_at, use_count);
create index if not exists vivace_discovery_submissions_invite_idx
  on public.vivace_discovery_submissions (invite_id);
