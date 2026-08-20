-- Add a durable, retryable external backup pipeline for Vivace submissions.
-- Applied to project eadljasmuqnzcrfudsib on 2026-08-20.

create table if not exists public.vivace_drive_backup_items (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.vivace_discovery_submissions(id) on delete cascade,
  item_type text not null check (item_type in ('submission_json','recording')),
  item_key text not null,
  question_id integer check (question_id is null or (question_id between 1 and 50)),
  source_path text,
  source_fingerprint text not null,
  source_sha256 text,
  source_size bigint check (source_size is null or source_size >= 0),
  payload_json jsonb,
  mime_type text not null,
  file_name text not null,
  status text not null default 'pending' check (status in ('pending','processing','complete','failed')),
  attempts integer not null default 0 check (attempts >= 0),
  lock_until timestamptz,
  next_retry_at timestamptz,
  last_error text,
  drive_file_id text,
  drive_file_name text,
  drive_url text,
  backed_up_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint vivace_drive_backup_item_source_check check (
    (item_type = 'submission_json' and payload_json is not null)
    or (item_type = 'recording' and source_path is not null)
  ),
  constraint vivace_drive_backup_item_unique unique (submission_id, item_key, source_fingerprint)
);

alter table public.vivace_drive_backup_items enable row level security;
revoke all on table public.vivace_drive_backup_items from public, anon, authenticated;

create index if not exists vivace_drive_backup_due_idx
  on public.vivace_drive_backup_items(status, next_retry_at, lock_until, created_at);
create index if not exists vivace_drive_backup_submission_idx
  on public.vivace_drive_backup_items(submission_id, item_key, backed_up_at desc);

create or replace function public.vivace_get_drive_backup_secret()
returns text
language sql
security definer
set search_path = vault, pg_catalog
as $$
  select decrypted_secret
  from vault.decrypted_secrets
  where name = 'vivace_drive_bridge_secret'
  limit 1;
$$;
revoke all on function public.vivace_get_drive_backup_secret() from public, anon, authenticated;
grant execute on function public.vivace_get_drive_backup_secret() to service_role;

create or replace function public.vivace_claim_drive_backup_items(p_limit integer default 2)
returns setof public.vivace_drive_backup_items
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  return query
  with candidates as (
    select id
    from public.vivace_drive_backup_items
    where attempts < 10
      and (
        status in ('pending','failed')
        or (status = 'processing' and lock_until < now())
      )
      and (next_retry_at is null or next_retry_at <= now())
      and (lock_until is null or lock_until < now())
    order by coalesce(next_retry_at, created_at), created_at
    for update skip locked
    limit greatest(1, least(coalesce(p_limit,2),5))
  )
  update public.vivace_drive_backup_items b
  set status = 'processing',
      attempts = b.attempts + 1,
      lock_until = now() + interval '5 minutes',
      updated_at = now()
  from candidates c
  where b.id = c.id
  returning b.*;
end;
$$;
revoke all on function public.vivace_claim_drive_backup_items(integer) from public, anon, authenticated;
grant execute on function public.vivace_claim_drive_backup_items(integer) to service_role;

create or replace function public.vivace_run_drive_backup()
returns void
language plpgsql
security definer
set search_path = public, vault, net, pg_catalog
as $$
declare
  v_token text;
begin
  select decrypted_secret into v_token
  from vault.decrypted_secrets
  where name = 'vivace_worker_token'
  limit 1;

  if coalesce(v_token,'') = '' then
    raise warning 'Vivace worker token missing';
    return;
  end if;

  perform net.http_post(
    url := 'https://eadljasmuqnzcrfudsib.supabase.co/functions/v1/vivace-drive-backup',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'x-vivace-worker',v_token
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
end;
$$;
revoke all on function public.vivace_run_drive_backup() from public, anon, authenticated;

do $$
declare j bigint;
begin
  for j in select jobid from cron.job where jobname = 'vivace-drive-backup-every-5m' loop
    perform cron.unschedule(j);
  end loop;
  perform cron.schedule(
    'vivace-drive-backup-every-5m',
    '*/5 * * * *',
    'select public.vivace_run_drive_backup();'
  );
end $$;
