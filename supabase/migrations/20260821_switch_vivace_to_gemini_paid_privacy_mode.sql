-- Step 8: Vivace transcription is now configured/approved as Gemini Paid.
-- Remove the temporary Free-tier acknowledgement requirement while remaining
-- backward-compatible with browser tabs that still send the old hidden marker.

alter table public.vivace_discovery_submissions
  add column if not exists transcription_data_policy text;

update public.vivace_discovery_submissions
set transcription_data_policy = case
  when coalesce(client_meta->>'transcriptionDataPolicy','') = 'gemini-free-non-sensitive-only'
    then 'gemini-free-historical'
  else coalesce(transcription_data_policy, 'legacy-unspecified')
end
where transcription_data_policy is null;

drop trigger if exists vivace_privacy_ack_before_insert_trigger
  on public.vivace_discovery_submissions;
drop function if exists public.vivace_require_privacy_ack_before_insert();

create or replace function public.vivace_normalize_paid_privacy_before_insert()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_clean_answers jsonb;
begin
  -- Old/cached clients may still send the temporary Free-tier marker.
  -- Strip it silently so it is never persisted as questionnaire content.
  select coalesce(jsonb_agg(
    jsonb_set(
      q.value,
      '{answers}',
      coalesce((
        select jsonb_agg(a.value)
        from jsonb_array_elements(
          case when jsonb_typeof(q.value->'answers')='array' then q.value->'answers' else '[]'::jsonb end
        ) as a(value)
        where coalesce(a.value->>'name','') <> '__vivace_privacy_ack'
      ), '[]'::jsonb),
      true
    )
  ), '[]'::jsonb)
  into v_clean_answers
  from jsonb_array_elements(
    case when jsonb_typeof(new.answers)='array' then new.answers else '[]'::jsonb end
  ) as q(value);

  new.answers := v_clean_answers;
  new.transcription_data_policy := 'gemini-paid';
  new.client_meta := (
    coalesce(new.client_meta, '{}'::jsonb)
      - 'privacyAcknowledged'
      - 'privacyPolicyVersion'
      - 'transcriptionDataPolicy'
  ) || jsonb_build_object(
    'transcriptionDataPolicy', 'gemini-paid',
    'privacyModeVersion', 'gemini-paid-v1'
  );

  -- Hidden technical fields must not affect the questionnaire answer count.
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

revoke all on function public.vivace_normalize_paid_privacy_before_insert() from public, anon, authenticated;

create trigger vivace_paid_privacy_before_insert_trigger
before insert on public.vivace_discovery_submissions
for each row execute function public.vivace_normalize_paid_privacy_before_insert();
