-- Step 5: require an explicit privacy acknowledgement before a new Discovery
-- submission can be stored while transcription uses Gemini Free.
-- The browser sends a hidden policy marker. The trigger verifies it and strips
-- it before the questionnaire answers are persisted.

create or replace function public.vivace_require_privacy_ack_before_insert()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_policy text;
  v_clean_answers jsonb;
begin
  select a.value->>'value'
  into v_policy
  from jsonb_array_elements(
    case when jsonb_typeof(new.answers)='array' then new.answers else '[]'::jsonb end
  ) as q(value)
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(q.value->'answers')='array' then q.value->'answers' else '[]'::jsonb end
  ) as a(value)
  where a.value->>'name' = '__vivace_privacy_ack'
  limit 1;

  if coalesce(v_policy,'') <> 'gemini-free-no-sensitive-v1' then
    raise exception using errcode = 'P0001', message = 'PRIVACY_ACK_REQUIRED';
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
  new.client_meta := coalesce(new.client_meta, '{}'::jsonb) || jsonb_build_object(
    'privacyAcknowledged', true,
    'privacyPolicyVersion', 'gemini-free-no-sensitive-v1',
    'transcriptionDataPolicy', 'gemini-free-non-sensitive-only'
  );

  -- Recalculate answered_count after hidden invite/privacy fields have been removed.
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

revoke all on function public.vivace_require_privacy_ack_before_insert() from public, anon, authenticated;

drop trigger if exists vivace_privacy_ack_before_insert_trigger
  on public.vivace_discovery_submissions;
create trigger vivace_privacy_ack_before_insert_trigger
before insert on public.vivace_discovery_submissions
for each row execute function public.vivace_require_privacy_ack_before_insert();
