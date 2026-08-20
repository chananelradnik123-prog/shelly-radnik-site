-- Store administrator master-key hashes outside Edge Function source and support overlap during rotation.
-- Raw administrator keys are never stored in Postgres.

create table if not exists public.vivace_admin_access_keys (
  id uuid primary key default gen_random_uuid(),
  key_hash text not null unique,
  label text not null,
  status text not null default 'active'
    check (status in ('active','retiring','revoked')),
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  use_count bigint not null default 0 check (use_count >= 0),
  expires_at timestamptz,
  retired_at timestamptz,
  revoked_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  constraint vivace_admin_access_keys_hash_check
    check (key_hash ~ '^[0-9a-f]{64}$')
);

alter table public.vivace_admin_access_keys enable row level security;
revoke all on table public.vivace_admin_access_keys from public, anon, authenticated;

drop policy if exists vivace_admin_access_keys_explicit_deny_clients
  on public.vivace_admin_access_keys;
create policy vivace_admin_access_keys_explicit_deny_clients
  on public.vivace_admin_access_keys
  for all
  to anon, authenticated
  using (false)
  with check (false);

create index if not exists vivace_admin_access_keys_active_idx
  on public.vivace_admin_access_keys (status, expires_at)
  where revoked_at is null;

-- Register the current master key by hash only. Its raw value is unchanged and is not exposed.
insert into public.vivace_admin_access_keys (
  key_hash,
  label,
  status,
  metadata
)
values (
  '3ae6b6af1b5000be920bd67a59a5b668bd08bf66db2dafe9980761650b870642',
  'legacy-admin-master-key-v1',
  'active',
  jsonb_build_object('importedAt', now())
)
on conflict (key_hash) do update
set label = excluded.label,
    metadata = public.vivace_admin_access_keys.metadata || excluded.metadata;

create or replace function public.vivace_touch_admin_access_key(p_key_hash text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_id uuid;
begin
  update public.vivace_admin_access_keys
  set last_used_at = now(),
      use_count = use_count + 1
  where key_hash = lower(coalesce(p_key_hash,''))
    and status in ('active','retiring')
    and revoked_at is null
    and (expires_at is null or expires_at > now())
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.vivace_touch_admin_access_key(text)
  from public, anon, authenticated;
grant execute on function public.vivace_touch_admin_access_key(text)
  to service_role;
