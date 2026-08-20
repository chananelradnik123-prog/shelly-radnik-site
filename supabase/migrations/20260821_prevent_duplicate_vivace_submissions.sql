-- Step 6: prevent accidental duplicate completed submissions from the same
-- questionnaire session, while still allowing retries for interrupted uploads.

alter table public.vivace_discovery_submissions
  add column if not exists client_session_key_hash text;

create unique index if not exists vivace_discovery_completed_session_unique_idx
  on public.vivace_discovery_submissions (client_session_key_hash)
  where client_session_key_hash is not null and status = 'complete';

create index if not exists vivace_discovery_session_lookup_idx
  on public.vivace_discovery_submissions (client_session_key_hash, status, created_at desc)
  where client_session_key_hash is not null;

create or replace function public.vivace_bind_client_session_before_insert()
returns trigger
language plpgsql
security definer
set search_path = public, extensions, pg_catalog
as $$
declare
  v_session text;
  v_session_hash text;
  v_clean_answers jsonb;
begin
  select a.value->>'value'
  into v_session
  from jsonb_array_elements(
    case when jsonb_typeof(new.answers)='array' then new.answers else '[]'::jsonb end
  ) as q(value)
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(q.value->'answers')='array' then q.value->'answers' else '[]'::jsonb end
  ) as a(value)
  where a.value->>'name' = '__vivace_client_session'
  limit 1;

  if length(coalesce(v_session,'')) < 16
     or length(v_session) > 128
     or v_session !~ '^[A-Za-z0-9._:-]+$' then
    raise exception using errcode = 'P0001', message = 'CLIENT_SESSION_INVALID';
  end if;

  v_session_hash := encode(extensions.digest(v_session, 'sha256'), 'hex');

  if exists (
    select 1
    from public.vivace_discovery_submissions s
    where s.client_session_key_hash = v_session_hash
      and s.status = 'complete'
  ) then
    raise exception using errcode = 'P0001', message = 'SUBMISSION_ALREADY_COMPLETED';
  end if;

  select coalesce(jsonb_agg(
    jsonb_set(
      q.value,
      '{answers}',
      coalesce((
        select jsonb_agg(a.value)
        from jsonb_array_elements(
          case when jsonb_typeof(q.value->'answers')='array' then q.value->'answers' else '[]'::jsonb end
        ) as a(value)
        where coalesce(a.value->>'name','') <> '__vivace_client_session'
      ), '[]'::jsonb),
      true
    )
  ), '[]'::jsonb)
  into v_clean_answers
  from jsonb_array_elements(
    case when jsonb_typeof(new.answers)='array' then new.answers else '[]'::jsonb end
  ) as q(value);

  new.answers := v_clean_answers;
  new.client_session_key_hash := v_session_hash;
  new.client_meta := coalesce(new.client_meta, '{}'::jsonb) || jsonb_build_object(
    'duplicateProtection', 'client-session-v1'
  );

  select count(distinct question_id)
  into new.answered_count
  from (
    select nullif(q.value->>'number','')::integer as question_id
    from jsonb_array_elements(new.answers) as q(value)
    where jsonb_array_length(
      case when jsonb_typeof(q.value->'answers')='array' then q.value->'answers' else '[]'::jsonb end
    ) > 0
    union
    select nullif(r.value->>'questionId','')::integer as question_id
    from jsonb_array_elements(
      case when jsonb_typeof(new.recording_manifest)='array' then new.recording_manifest else '[]'::jsonb end
    ) as r(value)
  ) answered
  where question_id is not null;

  return new;
end;
$$;

revoke all on function public.vivace_bind_client_session_before_insert() from public, anon, authenticated;

drop trigger if exists vivace_session_before_insert_trigger
  on public.vivace_discovery_submissions;
create trigger vivace_session_before_insert_trigger
before insert on public.vivace_discovery_submissions
for each row execute function public.vivace_bind_client_session_before_insert();
