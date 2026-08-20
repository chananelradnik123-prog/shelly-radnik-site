import { createClient } from 'npm:@supabase/supabase-js@2.95.0'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const raw = Deno.env.get('SUPABASE_SECRET_KEYS')
const legacy = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
const serviceKey = raw ? JSON.parse(raw).default : legacy
if (!serviceKey) throw new Error('Missing Supabase service key')
const db = createClient(SUPABASE_URL, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })

const BUCKET = 'vivace-discovery-private'
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwfz549wt6VGKoPUrN48Xc_0N0N9yGGWGNAIXFG9Tjh8TjP0cG7uqatIc06s-ohIbxFkA/exec'
const WORKER_KEY_SHA256 = 'd6e36b7fd4aa4fb2021e49a73e85e186ba1e0f1bcfd89153f5ac8224e7863255'
const MAX_SEED_SUBMISSIONS = 200
const MAX_ITEMS_PER_RUN = 2

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store, max-age=0',
      'x-content-type-options': 'nosniff',
    },
  })
}

async function sha256Hex(value: string | Uint8Array) {
  const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

async function authorized(req: Request) {
  const token = req.headers.get('x-vivace-worker') || ''
  return token.length >= 40 && (await sha256Hex(token)) === WORKER_KEY_SHA256
}

function canonicalize(value: any): any {
  if (Array.isArray(value)) return value.map(canonicalize)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]))
  }
  return value
}

function canonicalStringify(value: any) {
  return JSON.stringify(canonicalize(value), null, 2)
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + 0x8000, bytes.length)))
  }
  return btoa(binary)
}

function safeDate(value: unknown) {
  const date = value ? new Date(String(value)) : new Date(0)
  if (Number.isNaN(date.getTime())) return 'unknown-date'
  return date.toISOString().slice(0, 10)
}

function cleanAnalysis(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const result = { ...(value as Record<string, unknown>) }
  delete result._assistant_audio_cache
  return result
}

function snapshotFor(row: any) {
  return {
    schema_version: 'vivace-discovery-backup-v1',
    submission: {
      id: row.id,
      created_at: row.created_at,
      completed_at: row.completed_at,
      client_submitted_at: row.client_submitted_at,
      status: row.status,
      answered_count: row.answered_count,
      question_count: row.question_count,
      expected_recordings: row.expected_recordings,
      uploaded_recordings: row.uploaded_recordings,
      answers: row.answers,
      recording_manifest: row.recording_manifest,
      client_meta: row.client_meta,
      transcripts: row.transcripts,
      analysis: cleanAnalysis(row.analysis),
      transcription_status: row.transcription_status,
      transcription_provider: row.transcription_provider,
      transcription_updated_at: row.transcription_updated_at,
      transcription_quality_status: row.transcription_quality_status,
      transcription_review_questions: row.transcription_review_questions,
    },
  }
}

async function seedItems() {
  const columns = [
    'id','created_at','completed_at','client_submitted_at','status','answered_count','question_count',
    'expected_recordings','uploaded_recordings','answers','recording_manifest','client_meta','transcripts',
    'analysis','transcription_status','transcription_provider','transcription_updated_at',
    'transcription_quality_status','transcription_review_questions',
  ].join(',')
  const { data: submissions, error } = await db
    .from('vivace_discovery_submissions')
    .select(columns)
    .eq('status', 'complete')
    .order('created_at', { ascending: true })
    .limit(MAX_SEED_SUBMISSIONS)
  if (error) throw error
  if (!submissions?.length) return 0

  const ids = submissions.map((row: any) => String(row.id))
  const { data: existing, error: existingError } = await db
    .from('vivace_drive_backup_items')
    .select('submission_id,item_key,source_fingerprint')
    .in('submission_id', ids)
  if (existingError) throw existingError
  const existingKeys = new Set((existing || []).map((item: any) => `${item.submission_id}|${item.item_key}|${item.source_fingerprint}`))

  const inserts: any[] = []
  for (const row of submissions) {
    const snapshot = snapshotFor(row)
    const snapshotText = canonicalStringify(snapshot)
    const snapshotFingerprint = await sha256Hex(snapshotText)
    const snapshotKey = 'submission.json'
    const snapshotComposite = `${row.id}|${snapshotKey}|${snapshotFingerprint}`
    if (!existingKeys.has(snapshotComposite)) {
      inserts.push({
        submission_id: row.id,
        item_type: 'submission_json',
        item_key: snapshotKey,
        question_id: null,
        source_path: null,
        source_fingerprint: snapshotFingerprint,
        source_size: new TextEncoder().encode(snapshotText).length,
        payload_json: snapshot,
        mime_type: 'application/json',
        file_name: `BACKUP-DATA-Vivace-${safeDate(row.completed_at || row.created_at)}-${row.id}-${snapshotFingerprint.slice(0, 10)}.json`,
      })
    }

    for (const rec of Array.isArray(row.recording_manifest) ? row.recording_manifest : []) {
      const questionId = Number(rec?.questionId || 0)
      if (!Number.isInteger(questionId) || questionId < 1 || questionId > 50) continue
      const ext = String(rec?.ext || 'webm').replace(/[^a-z0-9]/gi, '') || 'webm'
      const path = `${row.id}/Q${String(questionId).padStart(2, '0')}.${ext}`
      const mimeType = String(rec?.mimeType || 'audio/webm').split(';')[0]
      const size = Math.max(0, Number(rec?.size || 0))
      const fingerprint = await sha256Hex(`storage-v1|${path}|${size}|${mimeType}`)
      const itemKey = `recording:Q${String(questionId).padStart(2, '0')}`
      const composite = `${row.id}|${itemKey}|${fingerprint}`
      if (existingKeys.has(composite)) continue
      inserts.push({
        submission_id: row.id,
        item_type: 'recording',
        item_key: itemKey,
        question_id: questionId,
        source_path: path,
        source_fingerprint: fingerprint,
        source_size: size,
        payload_json: null,
        mime_type: mimeType,
        file_name: `BACKUP-AUDIO-Vivace-${safeDate(row.completed_at || row.created_at)}-${row.id}-Q${String(questionId).padStart(2, '0')}.${ext}`,
      })
    }
  }

  if (!inserts.length) return 0
  const { error: insertError } = await db
    .from('vivace_drive_backup_items')
    .upsert(inserts, {
      onConflict: 'submission_id,item_key,source_fingerprint',
      ignoreDuplicates: true,
    })
  if (insertError) throw insertError
  return inserts.length
}

async function bridgeSecret() {
  const { data, error } = await db.rpc('vivace_get_drive_backup_secret')
  if (error) throw error
  const secret = typeof data === 'string' ? data : Array.isArray(data) ? String(data[0] || '') : String(data || '')
  if (!secret) throw new Error('DRIVE_BRIDGE_SECRET_MISSING')
  return secret
}

async function uploadToDrive(secret: string, bytes: Uint8Array, fileName: string, mimeType: string) {
  const response = await fetch(APPS_SCRIPT_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      secret,
      base64: bytesToBase64(bytes),
      fileName,
      mimeType,
    }),
  })
  const text = await response.text()
  let parsed: any = {}
  try { parsed = JSON.parse(text) } catch {}
  if (!response.ok || !parsed?.ok || !parsed?.fileId) {
    throw new Error(`DRIVE_UPLOAD_${response.status}_${String(parsed?.error || text).slice(0, 300)}`)
  }
  return parsed
}

function retryTime(attempts: number) {
  const minutes = Math.min(60, Math.max(1, 2 ** Math.min(6, Math.max(0, attempts - 1))))
  return new Date(Date.now() + minutes * 60 * 1000).toISOString()
}

async function processItem(item: any, secret: string) {
  try {
    let bytes: Uint8Array
    if (item.item_type === 'submission_json') {
      bytes = new TextEncoder().encode(canonicalStringify(item.payload_json))
    } else {
      const { data: blob, error } = await db.storage.from(BUCKET).download(String(item.source_path))
      if (error || !blob) throw new Error(`SOURCE_AUDIO_MISSING_${error?.message || item.source_path}`)
      bytes = new Uint8Array(await blob.arrayBuffer())
      if (item.source_size != null && Number(item.source_size) !== bytes.length) {
        throw new Error(`SOURCE_SIZE_MISMATCH_expected_${item.source_size}_actual_${bytes.length}`)
      }
    }

    const sourceSha256 = await sha256Hex(bytes)
    const uploaded = await uploadToDrive(secret, bytes, String(item.file_name), String(item.mime_type))
    const { error: updateError } = await db.from('vivace_drive_backup_items').update({
      status: 'complete',
      source_sha256: sourceSha256,
      source_size: bytes.length,
      drive_file_id: String(uploaded.fileId),
      drive_file_name: String(uploaded.fileName || item.file_name),
      drive_url: String(uploaded.url || ''),
      backed_up_at: new Date().toISOString(),
      lock_until: null,
      next_retry_at: null,
      last_error: null,
      updated_at: new Date().toISOString(),
    }).eq('id', item.id)
    if (updateError) throw updateError
    return { id: item.id, status: 'complete', fileName: uploaded.fileName || item.file_name, fileId: uploaded.fileId }
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    const attempts = Number(item.attempts || 1)
    await db.from('vivace_drive_backup_items').update({
      status: 'failed',
      lock_until: null,
      next_retry_at: attempts >= 10 ? null : retryTime(attempts),
      last_error: detail.slice(0, 1000),
      updated_at: new Date().toISOString(),
    }).eq('id', item.id)
    return { id: item.id, status: 'failed', error: detail.slice(0, 300) }
  }
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json({ error: 'METHOD_NOT_ALLOWED' }, 405)
  if (!(await authorized(req))) return json({ error: 'UNAUTHORIZED' }, 403)

  try {
    const seeded = await seedItems()
    const secret = await bridgeSecret()
    const { data: claimed, error: claimError } = await db.rpc('vivace_claim_drive_backup_items', { p_limit: MAX_ITEMS_PER_RUN })
    if (claimError) throw claimError

    const results = []
    for (const item of claimed || []) results.push(await processItem(item, secret))

    const { count: pendingCount } = await db
      .from('vivace_drive_backup_items')
      .select('*', { count: 'exact', head: true })
      .in('status', ['pending','processing','failed'])
      .lt('attempts', 10)

    return json({
      ok: results.every((result: any) => result.status === 'complete'),
      seeded,
      claimed: (claimed || []).length,
      results,
      remaining: pendingCount || 0,
    }, results.some((result: any) => result.status === 'failed') ? 207 : 200)
  } catch (error) {
    console.error('vivace-drive-backup failed', error)
    return json({ error: 'BACKUP_FAILED', detail: error instanceof Error ? error.message : String(error) }, 500)
  }
})
