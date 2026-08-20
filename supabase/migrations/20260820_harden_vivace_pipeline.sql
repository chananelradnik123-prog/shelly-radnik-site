-- Vivace OS: hardened Discovery + automatic transcription pipeline.
-- Applied to project eadljasmuqnzcrfudsib on 2026-08-20.
--
-- Required before enabling the cron job:
-- 1. Create a strong random secret in Supabase Vault named `vivace_worker_token`.
-- 2. Put only the SHA-256 hash of that same value in
--    supabase/functions/vivace-discovery-submit/index.ts as WORKER_KEY_SHA256.
-- Never commit the raw worker token.

create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron with schema extensions;
create extension if not exists supabase_vault with schema vault;

alter table public.vivace_discovery_submissions
  add column if not exists submission_token_hash text,
  add column if not exists transcription_attempts integer not null default 0,
  add column if not exists transcription_lock_until timestamptz,
  add column if not exists transcription_next_retry_at timestamptz,
  add column if not exists transcription_last_error text;

alter table public.vivace_discovery_submissions
  drop constraint if exists vivace_discovery_submissions_transcription_attempts_check;
alter table public.vivace_discovery_submissions
  add constraint vivace_discovery_submissions_transcription_attempts_check
  check (transcription_attempts >= 0);

create index if not exists vivace_transcription_due_idx
  on public.vivace_discovery_submissions
  (transcription_status, transcription_next_retry_at, transcription_lock_until)
  where status = 'complete' and uploaded_recordings > 0;

create table if not exists public.vivace_request_rate_limits (
  scope text not null,
  key_hash text not null,
  window_start timestamptz not null,
  request_count integer not null default 0 check (request_count >= 0),
  updated_at timestamptz not null default now(),
  primary key (scope, key_hash, window_start)
);

alter table public.vivace_request_rate_limits enable row level security;

create or replace function public.vivace_consume_rate_limit(
  p_scope text,
  p_key_hash text,
  p_limit integer,
  p_window_seconds integer
) returns boolean
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_window timestamptz;
  v_count integer;
begin
  if p_limit < 1 or p_window_seconds < 1
     or length(coalesce(p_scope,'')) > 80
     or length(coalesce(p_key_hash,'')) > 128 then
    return false;
  end if;

  v_window := to_timestamp(
    floor(extract(epoch from clock_timestamp()) / p_window_seconds) * p_window_seconds
  );

  insert into public.vivace_request_rate_limits(
    scope,key_hash,window_start,request_count,updated_at
  )
  values (p_scope,p_key_hash,v_window,1,now())
  on conflict (scope,key_hash,window_start)
  do update set
    request_count = public.vivace_request_rate_limits.request_count + 1,
    updated_at = now()
  returning request_count into v_count;

  if random() < 0.02 then
    delete from public.vivace_request_rate_limits
    where window_start < now() - interval '2 days';
  end if;

  return v_count <= p_limit;
end;
$$;

revoke all on function public.vivace_consume_rate_limit(text,text,integer,integer)
  from public, anon, authenticated;
grant execute on function public.vivace_consume_rate_limit(text,text,integer,integer)
  to service_role;

alter table public.vivace_discovery_submissions enable row level security;
drop policy if exists vivace_deny_direct_access
  on public.vivace_discovery_submissions;
create policy vivace_deny_direct_access
  on public.vivace_discovery_submissions
  for all
  to anon, authenticated
  using (false)
  with check (false);

drop policy if exists vivace_rate_limits_deny_direct_access
  on public.vivace_request_rate_limits;
create policy vivace_rate_limits_deny_direct_access
  on public.vivace_request_rate_limits
  for all
  to anon, authenticated
  using (false)
  with check (false);

create or replace function public.vivace_retry_due_transcriptions()
returns void
language plpgsql
security definer
set search_path = public, vault, net, pg_catalog
as $$
declare
  r record;
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

  for r in
    select id
    from public.vivace_discovery_submissions
    where status = 'complete'
      and uploaded_recordings > 0
      and uploaded_recordings > jsonb_array_length(
        case when jsonb_typeof(transcripts)='array'
          then transcripts else '[]'::jsonb end
      )
      and transcription_status in ('pending','partial','failed')
      and transcription_attempts < 8
      and (transcription_lock_until is null or transcription_lock_until < now())
      and (transcription_next_retry_at is null or transcription_next_retry_at <= now())
    order by coalesce(transcription_next_retry_at, created_at), created_at
    limit 3
  loop
    perform net.http_post(
      url := 'https://eadljasmuqnzcrfudsib.supabase.co/functions/v1/vivace-discovery-submit',
      headers := jsonb_build_object(
        'Content-Type','application/json',
        'Origin','https://chananelradnik123-prog.github.io',
        'x-vivace-form','owner-discovery-v1',
        'x-vivace-worker',v_token
      ),
      body := jsonb_build_object(
        'action','internal_retry',
        'submissionId',r.id
      )
    );

    update public.vivace_discovery_submissions
      set transcription_next_retry_at = now() + interval '3 minutes'
      where id = r.id;
  end loop;
end;
$$;

revoke all on function public.vivace_retry_due_transcriptions()
  from public, anon, authenticated;

do $$
declare j bigint;
begin
  for j in
    select jobid from cron.job
    where jobname = 'vivace-transcription-retry'
  loop
    perform cron.unschedule(j);
  end loop;

  perform cron.schedule(
    'vivace-transcription-retry',
    '*/2 * * * *',
    'select public.vivace_retry_due_transcriptions();'
  );
end
$$;

update storage.buckets
set file_size_limit = 18874368
where id = 'vivace-discovery-private';
