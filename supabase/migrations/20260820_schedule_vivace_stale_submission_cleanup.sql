-- Schedule cleanup of abandoned uploads and old failed submissions.
-- Applied to project eadljasmuqnzcrfudsib on 2026-08-20.

create or replace function public.vivace_run_maintenance()
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
    url := 'https://eadljasmuqnzcrfudsib.supabase.co/functions/v1/vivace-maintenance',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'x-vivace-worker',v_token
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
end;
$$;

revoke all on function public.vivace_run_maintenance() from public, anon, authenticated;

do $$
declare j bigint;
begin
  for j in select jobid from cron.job where jobname = 'vivace-maintenance-hourly' loop
    perform cron.unschedule(j);
  end loop;
  perform cron.schedule(
    'vivace-maintenance-hourly',
    '17 * * * *',
    'select public.vivace_run_maintenance();'
  );
end $$;
