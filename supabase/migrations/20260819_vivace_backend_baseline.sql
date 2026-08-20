-- Reproducible baseline for the Vivace Discovery backend.
-- This file intentionally uses idempotent statements so it can document the current schema
-- while remaining safe when the historical migrations have already been applied.

create table if not exists public.vivace_discovery_submissions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  client_submitted_at timestamptz,
  status text not null default 'uploading'
    check (status in ('uploading','complete','failed')),
  answered_count integer not null default 0 check (answered_count >= 0),
  question_count integer not null default 50 check (question_count >= 0),
  expected_recordings integer not null default 0 check (expected_recordings >= 0),
  uploaded_recordings integer not null default 0 check (uploaded_recordings >= 0),
  answers jsonb not null default '[]'::jsonb,
  recording_manifest jsonb not null default '[]'::jsonb,
  client_meta jsonb not null default '{}'::jsonb,
  transcripts jsonb not null default '[]'::jsonb,
  analysis jsonb not null default '{}'::jsonb,
  assistant_access_token text,
  assistant_access_issued_at timestamptz,
  transcription_status text not null default 'not_required'
    check (transcription_status in ('not_required','pending','partial','complete','failed')),
  transcription_provider text,
  transcription_updated_at timestamptz,
  submission_token_hash text,
  transcription_attempts integer not null default 0 check (transcription_attempts >= 0),
  transcription_lock_until timestamptz,
  transcription_next_retry_at timestamptz,
  transcription_last_error text,
  transcription_retry_rounds integer not null default 0 check (transcription_retry_rounds >= 0),
  transcription_quality_status text not null default 'not_checked'
    check (transcription_quality_status in ('not_checked','pass','review')),
  transcription_review_questions jsonb not null default '[]'::jsonb
);

alter table public.vivace_discovery_submissions
  add column if not exists completed_at timestamptz,
  add column if not exists client_submitted_at timestamptz,
  add column if not exists assistant_access_token text,
  add column if not exists assistant_access_issued_at timestamptz,
  add column if not exists transcription_status text not null default 'not_required',
  add column if not exists transcription_provider text,
  add column if not exists transcription_updated_at timestamptz,
  add column if not exists submission_token_hash text,
  add column if not exists transcription_attempts integer not null default 0,
  add column if not exists transcription_lock_until timestamptz,
  add column if not exists transcription_next_retry_at timestamptz,
  add column if not exists transcription_last_error text,
  add column if not exists transcription_retry_rounds integer not null default 0,
  add column if not exists transcription_quality_status text not null default 'not_checked',
  add column if not exists transcription_review_questions jsonb not null default '[]'::jsonb;

create table if not exists public.vivace_request_rate_limits (
  scope text not null,
  key_hash text not null,
  window_start timestamptz not null,
  request_count integer not null default 0 check (request_count >= 0),
  updated_at timestamptz not null default now(),
  primary key (scope, key_hash, window_start)
);

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'vivace-discovery-private',
  'vivace-discovery-private',
  false,
  18874368,
  array[
    'audio/webm',
    'audio/ogg',
    'audio/wav',
    'audio/x-wav',
    'audio/mp4',
    'audio/m4a',
    'audio/aac',
    'video/webm',
    'video/mp4'
  ]::text[]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

alter table public.vivace_discovery_submissions enable row level security;
alter table public.vivace_request_rate_limits enable row level security;
