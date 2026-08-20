-- Extend bounded transcription recovery so a 50-recording submission can finish.
-- Applied to project eadljasmuqnzcrfudsib on 2026-08-20.

alter table public.vivace_discovery_submissions
  add column if not exists transcription_retry_rounds integer not null default 0;

alter table public.vivace_discovery_submissions
  drop constraint if exists vivace_discovery_submissions_transcription_retry_rounds_check;
alter table public.vivace_discovery_submissions
  add constraint vivace_discovery_submissions_transcription_retry_rounds_check
  check (transcription_retry_rounds >= 0);

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
    select id, transcription_attempts, transcription_retry_rounds
    from public.vivace_discovery_submissions
    where status = 'complete'
      and uploaded_recordings > 0
      and uploaded_recordings > jsonb_array_length(
        case when jsonb_typeof(transcripts)='array' then transcripts else '[]'::jsonb end
      )
      and transcription_status in ('pending','partial','failed')
      and (transcription_attempts < 8 or transcription_retry_rounds < 1)
      and (transcription_lock_until is null or transcription_lock_until < now())
      and (transcription_next_retry_at is null or transcription_next_retry_at <= now())
    order by coalesce(transcription_next_retry_at, created_at), created_at
    limit 3
  loop
    if r.transcription_attempts >= 8 and r.transcription_retry_rounds < 1 then
      update public.vivace_discovery_submissions
      set transcription_attempts = 0,
          transcription_retry_rounds = transcription_retry_rounds + 1,
          transcription_lock_until = null,
          transcription_next_retry_at = now()
      where id = r.id;
    end if;

    perform net.http_post(
      url := 'https://eadljasmuqnzcrfudsib.supabase.co/functions/v1/vivace-discovery-submit',
      headers := jsonb_build_object(
        'Content-Type','application/json',
        'Origin','https://chananelradnik123-prog.github.io',
        'x-vivace-form','owner-discovery-v1',
        'x-vivace-worker',v_token
      ),
      body := jsonb_build_object('action','internal_retry','submissionId',r.id)
    );

    update public.vivace_discovery_submissions
    set transcription_next_retry_at = now() + interval '3 minutes'
    where id = r.id;
  end loop;
end;
$$;

revoke all on function public.vivace_retry_due_transcriptions() from public, anon, authenticated;
