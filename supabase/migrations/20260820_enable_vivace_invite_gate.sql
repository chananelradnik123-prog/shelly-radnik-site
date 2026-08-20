-- Enable the server-side invitation gate after the invite-aware frontend is live.
-- The raw token is injected as a hidden answer by v12invite.js, verified here,
-- and removed before the submission is stored. Only its invite_id is retained.

create or replace function public.vivace_bind_invite_before_insert()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_token text;
  v_token_hash text;
  v_invite_id uuid;
  v_clean_answers jsonb;
begin
  select a.value->>'value'
  into v_token
  from jsonb_array_elements(
    case when jsonb_typeof(new.answers)='array' then new.answers else '[]'::jsonb end
  ) as q(value)
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(q.value->'answers')='array' then q.value->'answers' else '[]'::jsonb end
  ) as a(value)
  where a.value->>'name' = '__vivace_invite_token'
  limit 1;

  if coalesce(v_token,'') !~ '^[0-9A-Fa-f]{64}$' then
    raise exception using errcode = 'P0001', message = 'INVITE_REQUIRED_OR_INVALID';
  end if;

  v_token_hash := encode(digest(v_token, 'sha256'), 'hex');

  select i.id
  into v_invite_id
  from public.vivace_discovery_invites i
  where i.token_hash = v_token_hash
    and i.disabled_at is null
    and (i.expires_at is null or i.expires_at > now())
    and i.use_count < i.max_uses
  limit 1;

  if v_invite_id is null then
    raise exception using errcode = 'P0001', message = 'INVITE_REQUIRED_OR_INVALID';
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
        where coalesce(a.value->>'name','') <> '__vivace_invite_token'
      ), '[]'::jsonb),
      true
    )
  ), '[]'::jsonb)
  into v_clean_answers
  from jsonb_array_elements(
    case when jsonb_typeof(new.answers)='array' then new.answers else '[]'::jsonb end
  ) as q(value);

  new.answers := v_clean_answers;
  new.invite_id := v_invite_id;
  new.invite_claimed_at := null;

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

create or replace function public.vivace_consume_invite_on_complete()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_invite_id uuid;
begin
  if new.status = 'complete' and old.status is distinct from 'complete' then
    if old.invite_id is null then
      raise exception using errcode = 'P0001', message = 'INVITE_REQUIRED_OR_INVALID';
    end if;

    update public.vivace_discovery_invites
    set use_count = use_count + 1,
        last_used_at = now()
    where id = old.invite_id
      and disabled_at is null
      and (expires_at is null or expires_at > now())
      and use_count < max_uses
    returning id into v_invite_id;

    if v_invite_id is null then
      raise exception using errcode = 'P0001', message = 'INVITE_EXPIRED_OR_EXHAUSTED';
    end if;

    new.invite_id := old.invite_id;
    new.invite_claimed_at := now();
  end if;

  return new;
end;
$$;

revoke all on function public.vivace_bind_invite_before_insert() from public, anon, authenticated;
revoke all on function public.vivace_consume_invite_on_complete() from public, anon, authenticated;

drop trigger if exists vivace_bind_invite_before_insert_trigger
  on public.vivace_discovery_submissions;
create trigger vivace_bind_invite_before_insert_trigger
before insert on public.vivace_discovery_submissions
for each row execute function public.vivace_bind_invite_before_insert();

drop trigger if exists vivace_consume_invite_on_complete_trigger
  on public.vivace_discovery_submissions;
create trigger vivace_consume_invite_on_complete_trigger
before update of status on public.vivace_discovery_submissions
for each row execute function public.vivace_consume_invite_on_complete();
