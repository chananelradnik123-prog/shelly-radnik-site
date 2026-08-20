-- Add a lightweight quality gate for suspicious automatic transcripts.
-- Applied to project eadljasmuqnzcrfudsib on 2026-08-20.

alter table public.vivace_discovery_submissions
  add column if not exists transcription_quality_status text not null default 'not_checked',
  add column if not exists transcription_review_questions jsonb not null default '[]'::jsonb;

alter table public.vivace_discovery_submissions
  drop constraint if exists vivace_discovery_submissions_transcription_quality_status_check;
alter table public.vivace_discovery_submissions
  add constraint vivace_discovery_submissions_transcription_quality_status_check
  check (transcription_quality_status in ('not_checked','pass','review'));

create or replace function public.vivace_set_transcription_quality()
returns trigger
language plpgsql
set search_path = public, pg_catalog
as $$
declare
  rec jsonb;
  man jsonb;
  q integer;
  txt text;
  bytes bigint;
  token_count integer;
  flags jsonb := '[]'::jsonb;
  transcript_count integer;
  manifest_count integer;
begin
  transcript_count := jsonb_array_length(
    case when jsonb_typeof(new.transcripts)='array' then new.transcripts else '[]'::jsonb end
  );
  manifest_count := jsonb_array_length(
    case when jsonb_typeof(new.recording_manifest)='array' then new.recording_manifest else '[]'::jsonb end
  );

  if manifest_count = 0 then
    new.transcription_quality_status := 'pass';
    new.transcription_review_questions := '[]'::jsonb;
    return new;
  end if;

  if transcript_count < manifest_count then
    new.transcription_quality_status := 'not_checked';
    new.transcription_review_questions := '[]'::jsonb;
    return new;
  end if;

  for rec in select value from jsonb_array_elements(new.transcripts) loop
    q := nullif(rec->>'questionId','')::integer;
    txt := btrim(coalesce(rec->>'text',''));
    token_count := case
      when txt='' then 0
      else array_length(regexp_split_to_array(txt,'\s+'),1)
    end;

    select value into man
    from jsonb_array_elements(new.recording_manifest)
    where nullif(value->>'questionId','')::integer = q
    limit 1;
    bytes := coalesce(nullif(man->>'size','')::bigint,0);

    if length(txt) < 4 then
      flags := flags || jsonb_build_array(
        jsonb_build_object('questionId',q,'reason','very_short','chars',length(txt))
      );
    elsif token_count <= 1 and bytes >= 20000 then
      flags := flags || jsonb_build_array(
        jsonb_build_object(
          'questionId',q,
          'reason','single_word_for_recording',
          'chars',length(txt),
          'bytes',bytes
        )
      );
    elsif txt ~ '[A-Za-z]' and txt !~ '[א-ת؀-ۿ]' and token_count <= 3 then
      flags := flags || jsonb_build_array(
        jsonb_build_object('questionId',q,'reason','short_non_hebrew_output','chars',length(txt))
      );
    end if;
  end loop;

  new.transcription_review_questions := flags;
  new.transcription_quality_status := case
    when jsonb_array_length(flags)>0 then 'review'
    else 'pass'
  end;
  return new;
end;
$$;

drop trigger if exists vivace_transcription_quality_trigger
  on public.vivace_discovery_submissions;
create trigger vivace_transcription_quality_trigger
before insert or update of transcripts, recording_manifest
on public.vivace_discovery_submissions
for each row execute function public.vivace_set_transcription_quality();

update public.vivace_discovery_submissions
set transcripts = transcripts;
