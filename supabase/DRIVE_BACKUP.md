# Vivace OS — Google Drive backup

## Purpose

Supabase Free does not provide a complete external backup of both database rows and Storage objects. The Vivace backup worker therefore creates an independent Google Drive copy of every completed Discovery submission.

## What is backed up

For each completed submission, the worker stores:

1. A canonical JSON snapshot (`vivace-discovery-backup-v2`) containing answers, recording manifest, transcripts, non-ephemeral analysis, transcription state, quality state, `transcription_data_policy`, retry counters, client-session hash, and invitation linkage metadata.
2. Every original recording from the private `vivace-discovery-private` Storage bucket.

The snapshot deliberately excludes credentials and stale runtime state:

- `submission_token_hash`
- `assistant_access_token`
- `assistant_access_issued_at`
- `transcription_lock_until`
- `transcription_next_retry_at`
- `_assistant_audio_cache`

These values must be regenerated or left null after a disaster restore rather than restored from old backups.

## File naming

- Data snapshot: `BACKUP-DATA-Vivace-YYYY-MM-DD-<submission UUID>-<content hash>.json`
- Audio: `BACKUP-AUDIO-Vivace-YYYY-MM-DD-<submission UUID>-QNN.<extension>`

A changed submission creates a new immutable JSON version because the content fingerprint changes. Unchanged items are not uploaded twice. Recording fingerprints are independent from JSON schema changes, so upgrading a data snapshot does not duplicate the audio backup.

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

## Recovery procedure

1. For each submission UUID, download the latest `BACKUP-DATA` file whose `schema_version` is `vivace-discovery-backup-v2`.
2. Verify the complete JSON file SHA-256 against `vivace_drive_backup_items.source_sha256` when the original database is available. The filename also contains the leading content-hash characters for human version identification.
3. Parse the JSON and validate that `submission.id`, `recording_manifest`, `uploaded_recordings`, `transcripts`, and `transcription_data_policy` are present and internally consistent.
4. Recreate the completed submission row from the JSON `submission` object. Do **not** restore excluded security/runtime fields. Generate new access credentials only if the restored application needs them.
5. If the original invite table is unavailable, restore `invite_id` as null rather than creating a broken foreign-key reference. `invite_claimed_at` may be retained as historical metadata if the target schema allows it.
6. Download every matching `BACKUP-AUDIO` file and verify its exact byte size and SHA-256 against the backup index.
7. Upload each recording to `<submission UUID>/QNN.<extension>` in the private `vivace-discovery-private` bucket.
8. Verify that the set of restored `QNN` files exactly matches the question IDs in `recording_manifest`.
9. Run transcription only for a manifest entry whose transcript is absent from the restored JSON.
10. Before any destructive production restore, repeat the procedure in an isolated project/environment.

## Verified recovery drill — 2026-08-21

A non-destructive external recovery drill was performed using completed submission `da8d4d9d-a61e-415d-aaa5-ba94a289c3aa`.

Results:

- The `vivace-discovery-backup-v2` JSON was downloaded from Google Drive, not read from the live Storage bucket.
- JSON SHA-256 matched the checksum recorded by the backup pipeline.
- The external JSON matched the live Supabase row for answers, recording manifest, transcripts, non-ephemeral analysis, answer/recording counts, transcription state/provider, data-policy field, and client-session hash.
- All five backed-up audio files (Q01, Q03, Q04, Q05, Q06) were independently downloaded from Google Drive.
- 5/5 audio SHA-256 checks matched the backup index.
- 5/5 byte-size checks matched.
- 5/5 files had the expected WebM EBML header (`1A45DFA3`).
- The restored file set exactly matched the five question IDs in the JSON recording manifest.
- A local isolated restore bundle containing the JSON plus all five audio files was assembled successfully; no live production row or Storage object was modified.

This proves the current external backup is readable and reconstructable for a real multi-recording submission. It does not replace a future clean-room restore into a separate Supabase project before a destructive disaster recovery.

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
