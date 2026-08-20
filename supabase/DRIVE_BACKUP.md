# Vivace OS — Google Drive backup

## Purpose

Supabase Free does not provide a complete external backup of both database rows and Storage objects. The Vivace backup worker therefore creates an independent Google Drive copy of every completed Discovery submission.

## What is backed up

For each completed submission, the worker stores:

1. A canonical JSON snapshot containing the answers, recording manifest, transcripts, non-ephemeral analysis, transcription status, and transcription quality flags.
2. Every original recording from the private `vivace-discovery-private` Storage bucket.

The snapshot deliberately excludes submission authorization hashes, administration tokens, MCP tokens, and the temporary `_assistant_audio_cache` field.

## File naming

- Data snapshot: `BACKUP-DATA-Vivace-YYYY-MM-DD-<submission UUID>-<content hash>.json`
- Audio: `BACKUP-AUDIO-Vivace-YYYY-MM-DD-<submission UUID>-QNN.<extension>`

A changed submission creates a new immutable JSON version because the content fingerprint changes. Unchanged items are not uploaded twice.

## Integrity and retries

The database table `public.vivace_drive_backup_items` records:

- the source fingerprint;
- the final SHA-256 checksum;
- the exact byte size;
- the Drive file ID and URL;
- attempt count, lock, retry time, error, and completion timestamp.

The worker claims rows with `FOR UPDATE SKIP LOCKED`, validates audio sizes before upload, retries failed items with bounded exponential delay, and stops after ten failed attempts.

The scheduled job `vivace-drive-backup-every-5m` runs every five minutes. Each run uploads at most two items to stay within Edge Function and Apps Script limits. A large submission is completed over multiple runs.

## Secrets

Never commit the raw values.

- Supabase Vault: `vivace_worker_token`
- Supabase Vault: `vivace_drive_bridge_secret`

`vivace_drive_bridge_secret` must match the private Script Property used by the Google Apps Script web app.

## Current Drive destination

The existing Google Apps Script bridge is currently hardcoded to the `Owner Discovery/Recordings` folder. The worker therefore uses strong `BACKUP-DATA-` and `BACKUP-AUDIO-` prefixes to keep backup files distinguishable.

A separate `Owner Discovery/Backups` folder has been created, but it will remain unused until the Apps Script bridge is upgraded to accept and validate a destination folder or is changed to point directly to that folder. This is an organizational limitation, not a backup-integrity limitation.

## Recovery outline

1. Download the latest `BACKUP-DATA` JSON file for each submission UUID.
2. Verify its SHA-256 against `vivace_drive_backup_items.source_sha256` when the original database is available, or retain the hash embedded in the file name as a version identifier.
3. Insert the JSON `submission` object into a restored `vivace_discovery_submissions` table, excluding generated/internal fields not present in the snapshot.
4. Upload each matching `BACKUP-AUDIO` file to:
   `<submission UUID>/QNN.<extension>` in `vivace-discovery-private`.
5. Verify that `uploaded_recordings`, `recording_manifest`, and the number of restored Storage objects agree.
6. Run transcription only for recordings whose transcript is absent from the JSON snapshot.

A destructive restore must first be tested in a separate Supabase project or development branch.

## Operational checks

```sql
select status, count(*)
from public.vivace_drive_backup_items
group by status;

select submission_id, item_key, source_sha256, source_size,
       drive_file_id, backed_up_at, last_error
from public.vivace_drive_backup_items
order by created_at desc;

select jobname, schedule, active
from cron.job
where jobname = 'vivace-drive-backup-every-5m';
```

Healthy state:

- all due items are `complete`;
- `last_error` is null;
- Drive IDs and SHA-256 values are present;
- the cron job is active.
