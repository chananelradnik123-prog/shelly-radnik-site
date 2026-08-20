# Vivace Discovery — Operations

## Production path

1. The browser stores recordings locally in IndexedDB while the owner fills the form.
2. `vivace-discovery-submit` creates a submission and returns signed, single-path upload URLs plus a per-submission token.
3. The browser uploads each recording directly to the private Supabase Storage bucket.
4. Finalize verifies the token, exact filenames, non-zero bytes, maximum size, and declared-versus-stored size.
5. Gemini transcribes missing recordings in the background.
6. Every successful transcript is saved immediately, so a worker interruption does not lose completed work.
7. `pg_cron` checks every two minutes and retries pending/partial/failed submissions.
8. `vivace-mcp` exposes answers and saved transcripts read-only to the authorized assistant.

## Required secrets

- Edge Function secret: `GEMINI_API_KEY`
- Supabase Vault secret: `vivace_worker_token`
- Admin key: only its SHA-256 hash is stored in `vivace-admin`
- MCP key: only its SHA-256 hash is stored in `vivace-mcp`

Do not commit raw keys.

## Limits

- Up to 50 questions and 50 recordings.
- Maximum 18 MiB per recording.
- Maximum 100 MiB declared audio per submission.
- A worker processes at most five missing recordings per run.
- Transient Gemini failures are retried with backoff and then retried durably by cron.
- After eight worker runs, the submission stays failed/partial until an admin requeues it.

## Health checks

```sql
select id, transcription_status, transcription_attempts,
       transcription_last_error,
       jsonb_array_length(transcripts) as transcript_count,
       uploaded_recordings
from public.vivace_discovery_submissions
order by created_at desc;

select jobid, jobname, schedule, active
from cron.job
where jobname = 'vivace-transcription-retry';

select jobid, status, return_message, start_time, end_time
from cron.job_run_details
where jobid in (
  select jobid from cron.job
  where jobname = 'vivace-transcription-retry'
)
order by start_time desc
limit 20;
```

## Privacy decision still required

The current Gemini key is on the unpaid Gemini API tier. Do not use real confidential owner/business recordings until the data-use terms are acceptable for the project. For private production use, enable a paid Gemini API/Cloud Billing setup or replace the provider with one whose data terms meet the requirement.

## Google Drive

Google Drive is not in the production transcription path. The earlier one-off Drive bridge is disabled. Add Drive later only as an idempotent archive job; it must not be treated as the transcription engine.
