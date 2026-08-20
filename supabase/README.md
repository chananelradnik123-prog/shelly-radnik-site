# Vivace OS — Supabase backend

This directory is the source of truth for the production backend used by the Vivace Discovery questionnaire.

## Production Edge Functions

- `vivace-discovery-submit` — prepares signed uploads, validates and finalizes submissions, and runs Gemini transcription with locking and retries.
- `vivace-admin` — private administration UI/API for submissions, recordings, transcripts, retry actions, and manual corrections.
- `vivace-mcp` — read-only MCP connector used by ChatGPT to search and fetch Vivace submissions.
- `vivace-maintenance` — scheduled cleanup of abandoned uploads, old failed rows, and stale rate-limit records.

Old one-off debugging functions are intentionally not part of the production source tree. Their deployed endpoints return `410 DISABLED` until they are deleted from the Supabase project.

## Required secrets

Never commit raw secret values.

- Supabase Edge Function secret: `GEMINI_API_KEY`
- Supabase Vault secret: `vivace_worker_token`
- The administration key and MCP key are represented in source only by SHA-256 hashes. Their raw values must remain outside Git.

The value stored in Vault as `vivace_worker_token` must match the SHA-256 hash configured as `WORKER_KEY_SHA256` in both `vivace-discovery-submit` and `vivace-maintenance`.

## Database migrations

Apply migrations in filename order. The migrations record:

1. Core pipeline hardening, RLS, rate limits, transcription locking, and retry cron.
2. A bounded extra retry round so submissions with up to 50 recordings can finish.
3. Hourly cleanup of abandoned uploads and old failed submissions.
4. A transcription quality gate that marks suspicious output for review.

## Deployment

From a machine with the Supabase CLI linked to project `eadljasmuqnzcrfudsib`:

```bash
supabase db push
supabase functions deploy vivace-discovery-submit --no-verify-jwt
supabase functions deploy vivace-admin --no-verify-jwt
supabase functions deploy vivace-mcp --no-verify-jwt
supabase functions deploy vivace-maintenance --no-verify-jwt
```

After deployment, verify:

- all migrations are listed as applied;
- `vivace-transcription-retry` and `vivace-maintenance-hourly` are active in `cron.job`;
- the storage bucket `vivace-discovery-private` remains private;
- no raw API key or worker token exists in the repository;
- a test submission reaches `transcription_status = complete` and is then removed.

## Data handling

The current free Gemini tier must not be used for sensitive personal, payroll, banking, medical, identity, or confidential business data. Move to a provider/tier with suitable data-use terms before production use with sensitive information.
