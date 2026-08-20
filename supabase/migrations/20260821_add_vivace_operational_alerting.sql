-- Step 4: durable operational alerts for Vivace OS.
-- Detects submission, transcription, backup and scheduler failures without
-- exposing private business content to the notification layer.

create table if not exists public.vivace_operational_alerts (
  id uuid primary key default gen_random_uuid(),
  dedupe_key text not null unique,
  category text not null check (category in ('submission','transcription','backup','system')),
  severity text not null check (severity in ('warning','critical')),
  code text not null,
  entity_id text,
  title text not null,
  detail text not null,
  metadata jsonb not null default '{}'::jsonb,
  status text not null default 'open' check (status in ('open','resolved')),
  occurrence_count integer not null default 1 check (occurrence_count >= 1),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  resolved_at timestamptz,
  notified_at timestamptz,
  notification_attempts integer not null default 0 check (notification_attempts >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.vivace_operational_alerts enable row level security;
revoke all on table public.vivace_operational_alerts from public, anon, authenticated;

drop policy if exists vivace_operational_alerts_explicit_deny_clients
  on public.vivace_operational_alerts;
create policy vivace_operational_alerts_explicit_deny_clients
  on public.vivace_operational_alerts
  for all
  to anon, authenticated
  using (false)
  with check (false);

create index if not exists vivace_operational_alerts_delivery_idx
  on public.vivace_operational_alerts (status, notified_at, severity, first_seen_at);
create index if not exists vivace_operational_alerts_last_seen_idx
  on public.vivace_operational_alerts (status, last_seen_at);

create or replace function public.vivace_refresh_operational_alerts()
returns void
language plpgsql
security definer
set search_path = public, cron, pg_catalog
as $$
declare
  v_scan timestamptz := clock_timestamp();
begin
  insert into public.vivace_operational_alerts (
    dedupe_key, category, severity, code, entity_id, title, detail, metadata,
    status, first_seen_at, last_seen_at, updated_at
  )
  select
    issue.dedupe_key,
    issue.category,
    issue.severity,
    issue.code,
    issue.entity_id,
    issue.title,
    issue.detail,
    issue.metadata,
    'open',
    v_scan,
    v_scan,
    v_scan
  from (
    -- A submission failed before completion.
    select
      'submission_failed:' || s.id::text as dedupe_key,
      'submission'::text as category,
      'critical'::text as severity,
      'submission_failed'::text as code,
      s.id::text as entity_id,
      'שליחת Discovery נכשלה'::text as title,
      'שליחה נרשמה כ-failed לפני שהושלמה.'::text as detail,
      jsonb_build_object('createdAt', s.created_at) as metadata
    from public.vivace_discovery_submissions s
    where s.status = 'failed'

    union all

    -- An upload session was abandoned for more than 30 minutes.
    select
      'submission_stuck:' || s.id::text,
      'submission',
      'warning',
      'submission_stuck',
      s.id::text,
      'שליחת Discovery תקועה',
      'השליחה נמצאת ב-uploading יותר מ-30 דקות.',
      jsonb_build_object('createdAt', s.created_at, 'expectedRecordings', s.expected_recordings)
    from public.vivace_discovery_submissions s
    where s.status = 'uploading'
      and s.created_at < v_scan - interval '30 minutes'

    union all

    -- Automatic transcription has exhausted the bounded retry budget.
    select
      'transcription_exhausted:' || s.id::text,
      'transcription',
      'critical',
      'transcription_exhausted',
      s.id::text,
      'התמלול האוטומטי נכשל',
      'נשארו הקלטות ללא תמלול לאחר סבבי הניסיון החוזר.',
      jsonb_build_object(
        'uploadedRecordings', s.uploaded_recordings,
        'transcriptCount', jsonb_array_length(case when jsonb_typeof(s.transcripts)='array' then s.transcripts else '[]'::jsonb end),
        'attempts', s.transcription_attempts,
        'retryRounds', s.transcription_retry_rounds,
        'lastError', left(coalesce(s.transcription_last_error,''), 300)
      )
    from public.vivace_discovery_submissions s
    where s.status = 'complete'
      and s.uploaded_recordings > jsonb_array_length(case when jsonb_typeof(s.transcripts)='array' then s.transcripts else '[]'::jsonb end)
      and s.transcription_status in ('pending','partial','failed')
      and s.transcription_retry_rounds >= 1
      and s.transcription_attempts >= 8
      and s.transcription_lock_until is null
      and s.transcription_next_retry_at is null

    union all

    -- A completed transcript looks suspicious and needs a human glance.
    select
      'transcription_review:' || s.id::text,
      'transcription',
      'warning',
      'transcription_review',
      s.id::text,
      'תמלול סומן לבדיקה',
      'בקרת האיכות זיהתה תמלול חשוד שדורש בדיקה ידנית.',
      jsonb_build_object('reviewQuestions', s.transcription_review_questions)
    from public.vivace_discovery_submissions s
    where s.transcription_quality_status = 'review'

    union all

    -- A Drive backup item exhausted all retry attempts.
    select
      'backup_exhausted:' || b.id::text,
      'backup',
      'critical',
      'backup_exhausted',
      b.id::text,
      'גיבוי Google Drive נכשל',
      'פריט גיבוי הגיע למספר הניסיונות המרבי ולא הושלם.',
      jsonb_build_object(
        'submissionId', b.submission_id,
        'itemType', b.item_type,
        'itemKey', b.item_key,
        'attempts', b.attempts,
        'lastError', left(coalesce(b.last_error,''), 300)
      )
    from public.vivace_drive_backup_items b
    where b.status = 'failed'
      and b.attempts >= 10
      and b.next_retry_at is null

    union all

    -- A backup has been waiting too long even though retries remain.
    select
      'backup_delayed:' || b.id::text,
      'backup',
      'warning',
      'backup_delayed',
      b.id::text,
      'גיבוי Google Drive מתעכב',
      'פריט גיבוי לא הושלם במשך יותר משעה.',
      jsonb_build_object(
        'submissionId', b.submission_id,
        'itemType', b.item_type,
        'itemKey', b.item_key,
        'status', b.status,
        'attempts', b.attempts
      )
    from public.vivace_drive_backup_items b
    where b.status <> 'complete'
      and b.created_at < v_scan - interval '1 hour'
      and b.attempts < 10

    union all

    -- A supposedly complete Drive backup is missing its remote identifier.
    select
      'backup_inconsistent:' || b.id::text,
      'backup',
      'critical',
      'backup_inconsistent',
      b.id::text,
      'גיבוי Google Drive לא עקבי',
      'פריט מסומן complete אך חסר מזהה קובץ ב-Drive.',
      jsonb_build_object('submissionId', b.submission_id, 'itemType', b.item_type, 'itemKey', b.item_key)
    from public.vivace_drive_backup_items b
    where b.status = 'complete'
      and coalesce(b.drive_file_id,'') = ''

    union all

    -- The 5-minute backup scheduler has not completed successfully recently.
    select
      'system_backup_cron_stale',
      'system',
      'critical',
      'backup_cron_stale',
      null,
      'מנגנון הגיבוי האוטומטי לא רץ',
      'לא נמצאה ריצת גיבוי מוצלחת ב-20 הדקות האחרונות.',
      '{}'::jsonb
    where exists (select 1 from cron.job where jobname = 'vivace-drive-backup-every-5m' and active)
      and not exists (
        select 1
        from cron.job_run_details d
        join cron.job j on j.jobid = d.jobid
        where j.jobname = 'vivace-drive-backup-every-5m'
          and d.status = 'succeeded'
          and d.start_time > v_scan - interval '20 minutes'
      )

    union all

    -- The 2-minute transcription retry scheduler has not completed successfully recently.
    select
      'system_transcription_cron_stale',
      'system',
      'critical',
      'transcription_cron_stale',
      null,
      'מנגנון ניסיונות התמלול לא רץ',
      'לא נמצאה ריצת retry מוצלחת ב-10 הדקות האחרונות.',
      '{}'::jsonb
    where exists (select 1 from cron.job where jobname = 'vivace-transcription-retry' and active)
      and not exists (
        select 1
        from cron.job_run_details d
        join cron.job j on j.jobid = d.jobid
        where j.jobname = 'vivace-transcription-retry'
          and d.status = 'succeeded'
          and d.start_time > v_scan - interval '10 minutes'
      )
  ) issue
  on conflict (dedupe_key) do update
  set category = excluded.category,
      severity = excluded.severity,
      code = excluded.code,
      entity_id = excluded.entity_id,
      title = excluded.title,
      detail = excluded.detail,
      metadata = excluded.metadata,
      status = 'open',
      last_seen_at = v_scan,
      resolved_at = null,
      notified_at = case
        when public.vivace_operational_alerts.status = 'resolved' then null
        else public.vivace_operational_alerts.notified_at
      end,
      occurrence_count = case
        when public.vivace_operational_alerts.status = 'resolved'
          then public.vivace_operational_alerts.occurrence_count + 1
        else public.vivace_operational_alerts.occurrence_count
      end,
      updated_at = v_scan;

  -- Anything that was open before this scan but was not observed now is resolved.
  update public.vivace_operational_alerts
  set status = 'resolved',
      resolved_at = v_scan,
      updated_at = v_scan
  where status = 'open'
    and last_seen_at < v_scan;
end;
$$;

revoke all on function public.vivace_refresh_operational_alerts() from public, anon, authenticated;
grant execute on function public.vivace_refresh_operational_alerts() to service_role;

create or replace function public.vivace_claim_operational_alerts(p_limit integer default 20)
returns setof public.vivace_operational_alerts
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  perform public.vivace_refresh_operational_alerts();

  return query
  with candidates as (
    select id
    from public.vivace_operational_alerts
    where status = 'open'
      and (
        notified_at is null
        or (severity = 'critical' and notified_at < now() - interval '24 hours')
      )
    order by
      case severity when 'critical' then 0 else 1 end,
      first_seen_at
    for update skip locked
    limit greatest(1, least(coalesce(p_limit,20),50))
  )
  update public.vivace_operational_alerts a
  set notified_at = now(),
      notification_attempts = a.notification_attempts + 1,
      updated_at = now()
  from candidates c
  where a.id = c.id
  returning a.*;
end;
$$;

revoke all on function public.vivace_claim_operational_alerts(integer) from public, anon, authenticated;
grant execute on function public.vivace_claim_operational_alerts(integer) to service_role;

do $$
declare j bigint;
begin
  for j in select jobid from cron.job where jobname = 'vivace-operational-alert-refresh-every-5m' loop
    perform cron.unschedule(j);
  end loop;
  perform cron.schedule(
    'vivace-operational-alert-refresh-every-5m',
    '*/5 * * * *',
    'select public.vivace_refresh_operational_alerts();'
  );
end $$;

select public.vivace_refresh_operational_alerts();
