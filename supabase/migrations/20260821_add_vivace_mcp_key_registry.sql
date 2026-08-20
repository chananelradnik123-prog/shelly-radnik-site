-- Store MCP access-key hashes outside Edge Function source and support safe overlap during rotation.
-- Raw keys are never stored in Postgres.

create table if not exists public.vivace_mcp_access_keys (
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
  constraint vivace_mcp_access_keys_hash_check
    check (key_hash ~ '^[0-9a-f]{64}$')
);

alter table public.vivace_mcp_access_keys enable row level security;
revoke all on table public.vivace_mcp_access_keys from public, anon, authenticated;

drop policy if exists vivace_mcp_access_keys_explicit_deny_clients
  on public.vivace_mcp_access_keys;
create policy vivace_mcp_access_keys_explicit_deny_clients
  on public.vivace_mcp_access_keys
  for all
  to anon, authenticated
  using (false)
  with check (false);

create index if not exists vivace_mcp_access_keys_active_idx
  on public.vivace_mcp_access_keys (status, expires_at)
  where revoked_at is null;

-- Register the currently connected MCP credential without changing or exposing it.
insert into public.vivace_mcp_access_keys (
  key_hash,
  label,
  status,
  metadata
)
values (
  '29e35774a50c3a765441c21a06005f995fac189721b9385c30f81d70987cf1a1',
  'legacy-chatgpt-path-key-v1',
  'active',
  jsonb_build_object('authentication', 'path-or-bearer', 'importedAt', now())
)
on conflict (key_hash) do update
set label = excluded.label,
    metadata = public.vivace_mcp_access_keys.metadata || excluded.metadata;

create or replace function public.vivace_touch_mcp_access_key(p_key_hash text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_id uuid;
begin
  update public.vivace_mcp_access_keys
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

revoke all on function public.vivace_touch_mcp_access_key(text)
  from public, anon, authenticated;
grant execute on function public.vivace_touch_mcp_access_key(text)
  to service_role;
