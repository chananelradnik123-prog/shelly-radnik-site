# Vivace Discovery — Operations

## Current production flow

1. The browser keeps each recording locally in IndexedDB.
2. Before microphone access, the user approves temporary transcription through the Vivace service and Google Gemini.
3. After recording, the browser performs a local audio-quality check and sends the audio temporarily to `vivace-audio-preview`. A valid invitation is required.
4. The returned transcript is shown on screen. The user can edit it, approve it, or record again.
5. Submission sends the questionnaire answers and only the approved transcripts to `vivace-discovery-submit`. The current web client sends `recordings: []`; raw audio is not attached to the submission.
6. After a successful submission, local recordings are deleted. If cleanup fails, the browser retries it on the next opening.
7. `vivace-admin` provides the private administration UI, and `vivace-mcp` exposes saved answers and transcripts read-only to the authorized assistant.

## Required secrets

- Edge Function secret: `GEMINI_API_KEY` (Gemini Paid mode).
- Supabase Vault secret: `vivace_worker_token` for the retained background transcription pipeline.
- Admin key: only its SHA-256 hash is stored in `vivace-admin`.
- MCP key: only its SHA-256 hash is stored in `vivace-mcp`.

Do not commit raw keys.

## Active limits and controls

- Preview requires an allowed production origin, the `owner-discovery-v1` header, and a valid, unexpired, unexhausted invitation.
- Maximum preview recording size: 18 MiB.
- Maximum recording duration in the browser: five minutes.
- Preview requests are rate-limited.
- The Storage bucket remains private for the retained backend upload pipeline; the current questionnaire UI does not upload raw recordings there.
- Gemini receives the audio only for transcription. Normal data minimization still applies: do not record passwords or payment-card details.

## Release checks

- Open a fresh invitation link and confirm that the legacy questionnaire never flashes.
- Confirm the questionnaire loads on current Chrome, Safari, Edge, and Firefox.
- Complete one real microphone flow: record, transcribe, edit, approve, and re-record.
- Submit once and confirm the saved row contains the approved transcript and no raw recording manifest from the web client.
- Reopen the same session and confirm duplicate submission is blocked.
- Open `?admin=1`, sign in, and confirm submissions load.
- Run the Supabase Security Advisor and verify there are no new findings.

## Health checks

```sql
select id, created_at, completed_at, status,
       transcription_status, transcription_data_policy,
       jsonb_array_length(transcripts) as transcript_count,
       jsonb_array_length(recording_manifest) as recording_count
from public.vivace_discovery_submissions
order by created_at desc
limit 20;
```

## Data handling

Vivace is configured for **Gemini Paid** mode. New submissions are tagged with `transcription_data_policy = 'gemini-paid'`. The consent in the questionnaire covers the temporary audio transfer used to produce the preview transcript. Only the transcript approved by the user is submitted by the current web client.

## Google Drive

Google Drive is not the transcription engine. If the separate backup pipeline is enabled, treat it only as an idempotent archive and verify its access controls independently.
