# Vivace OS — Supabase backend

This directory is the source of truth for the production backend used by the Vivace Discovery questionnaire.

## Production Edge Functions

- `vivace-discovery-submit` — prepares signed uploads, validates and finalizes submissions, and runs Gemini transcription with locking and retries.
- `vivace-admin` — private administration UI/API for submissions, recordings, transcripts, retry actions, and manual corrections.
- `vivace-mcp` — read-only MCP connector used by ChatGPT to search and fetch Vivace submissions.
- `vivace-maintenance` — scheduled cleanup of abandoned uploads, old failed rows, and stale rate-limit records.
- `vivace-drive-backup` — creates immutable, checksummed Google Drive backups of submission JSON and original recordings.
- `vivace-invite-check` — validates private Discovery invitation tokens before submit.
- `vivace-alert-feed` — exposes sanitized operational alerts to the ChatGPT monitoring task.

Old one-off debugging functions are intentionally not part of the production source tree. Their deployed endpoints return `410 DISABLED` until they are deleted from the Supabase project.

## Required secrets

Never commit raw secret values.

- Supabase Edge Function secret: `GEMINI_API_KEY`
- Supabase Vault secret: `vivace_worker_token`
- Supabase Vault secret: `vivace_drive_bridge_secret`
- The administration, MCP, and alert-feed keys are represented in source only by SHA-256 hashes. Their raw values must remain outside Git.

The value stored in Vault as `vivace_worker_token` must match the SHA-256 hash configured as `WORKER_KEY_SHA256` in `vivace-discovery-submit`, `vivace-maintenance`, and `vivace-drive-backup`.

The `vivace_drive_bridge_secret` value must match the private Script Property used by the Google Apps Script bridge. See [DRIVE_BACKUP.md](./DRIVE_BACKUP.md) for backup and recovery details.

## Database migrations

Apply migrations in filename order. The migrations record:

1. Core pipeline hardening, RLS, rate limits, transcription locking, and retry cron.
2. A bounded extra retry round so submissions with up to 50 recordings can finish.
3. Hourly cleanup of abandoned uploads and old failed submissions.
4. A transcription quality gate that marks suspicious output for review.
5. A durable external Drive backup queue with locking, checksums, retries, and a five-minute cron.
6. Private invitation enforcement and duplicate-session protection.
7. Durable operational alerting with deduplication and resolution tracking.
8. Gemini Paid privacy mode; the old Free-tier acknowledgement marker is accepted only for backward compatibility and is stripped before storage.

## Deployment

From a machine with the Supabase CLI linked to project `eadljasmuqnzcrfudsib`:

```bash
supabase db push
supabase functions deploy vivace-discovery-submit --no-verify-jwt
supabase functions deploy vivace-admin --no-verify-jwt
supabase functions deploy vivace-mcp --no-verify-jwt
supabase functions deploy vivace-maintenance --no-verify-jwt
supabase functions deploy vivace-drive-backup --no-verify-jwt
supabase functions deploy vivace-invite-check --no-verify-jwt
supabase functions deploy vivace-alert-feed --no-verify-jwt
```

After deployment, verify:

- all migrations are listed as applied;
- `vivace-transcription-retry`, `vivace-maintenance-hourly`, `vivace-drive-backup-every-5m`, and `vivace-operational-alert-refresh-every-5m` are active in `cron.job`;
- the storage bucket `vivace-discovery-private` remains private;
- no raw API key, worker token, alert token, or Drive bridge secret exists in the repository;
- a test submission reaches `transcription_status = complete` and is then removed;
- all corresponding `vivace_drive_backup_items` rows eventually reach `complete`, with Drive IDs, byte sizes, and SHA-256 values.

## Data handling

Vivace is operated in **Gemini Paid** mode. New submissions are tagged with `transcription_data_policy = 'gemini-paid'`. Historical rows created while the Free-tier restriction was active remain marked separately as historical Free-tier data. The temporary browser checkbox that prohibited sensitive data is no longer required in Paid mode.

Paid-mode configuration does not replace normal privacy and security controls: invitation gating, private Storage, least-privilege access, backups, monitoring, and data minimization remain required.
