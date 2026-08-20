import { createClient } from 'npm:@supabase/supabase-js@2.95.0'

declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void }

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const secretKeysRaw = Deno.env.get('SUPABASE_SECRET_KEYS')
const legacyServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
const secretKey = secretKeysRaw ? JSON.parse(secretKeysRaw).default : legacyServiceKey
const geminiKey = Deno.env.get('GEMINI_API_KEY') || Deno.env.get('GOOGLE_API_KEY')
if (!secretKey) throw new Error('Missing Supabase secret key')

const db = createClient(SUPABASE_URL, secretKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const BUCKET = 'vivace-discovery-private'
const FORM_HEADER = 'owner-discovery-v1'
const PRIMARY_MODEL = 'gemini-3.6-flash'
const FALLBACK_MODEL = 'gemini-3.5-flash'
const WORKER_KEY_SHA256 = 'd6e36b7fd4aa4fb2021e49a73e85e186ba1e0f1bcfd89153f5ac8224e7863255'
const MAX_QUESTIONS = 50
const MAX_RECORDINGS = 50
const MAX_RECORDING_BYTES = 18 * 1024 * 1024
const MAX_TOTAL_BYTES = 100 * 1024 * 1024
const MAX_ITEMS_PER_RUN = 5
const LOCK_MS = 4 * 60 * 1000
const MAX_WORKER_ATTEMPTS = 8
const TRANSIENT_HTTP = new Set([429, 500, 502, 503, 504])
const ALLOWED_MIME_TYPES = new Set([
  'audio/webm',
  'audio/ogg',
  'audio/wav',
  'audio/x-wav',
  'audio/mp4',
  'audio/m4a',
  'audio/aac',
  'video/webm',
  'video/mp4',
])
const ALLOWED_ORIGINS = new Set([
  'https://chananelradnik123-prog.github.io',
  'http://localhost:3000',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
])

function cors(origin: string | null) {
  const allowed = origin && ALLOWED_ORIGINS.has(origin)
    ? origin
    : 'https://chananelradnik123-prog.github.io'
  return {
    'Access-Control-Allow-Origin': allowed,
    'Vary': 'Origin',
    'Access-Control-Allow-Headers': 'content-type, x-vivace-form, x-vivace-worker',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store, max-age=0',
    'X-Content-Type-Options': 'nosniff',
  }
}

function json(body: unknown, status: number, origin: string | null) {
  return new Response(JSON.stringify(body), { status, headers: cors(origin) })
}

function clean(value: unknown, max = 20000) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max)
}

function errorDetail(error: unknown) {
  if (error instanceof Error) return clean(error.message, 1000)
  if (error && typeof error === 'object') {
    const item = error as Record<string, unknown>
    return clean(
      item.message || item.details || item.hint || item.code || JSON.stringify(item),
      1000,
    )
  }
  return clean(error, 1000)
}

function extensionFor(mime = '') {
  const m = mime.toLowerCase()
  if (m.includes('ogg')) return 'ogg'
  if (m.includes('wav')) return 'wav'
  if (m.includes('mp4') || m.includes('m4a')) return 'm4a'
  if (m.includes('aac')) return 'aac'
  return 'webm'
}

function normalizeMime(mime: unknown) {
  return String(mime || 'audio/webm').split(';')[0].trim().toLowerCase()
}

function geminiMime(recMime: string, blobMime: string, ext: string) {
  const source = normalizeMime(recMime || blobMime)
  if (ext === 'webm' || source === 'audio/webm') return 'video/webm'
  return source || 'audio/mpeg'
}

function randomHex(bytes = 32) {
  const buf = new Uint8Array(bytes)
  crypto.getRandomValues(buf)
  return [...buf].map((b) => b.toString(16).padStart(2, '0')).join('')
}

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

async function workerAllowed(req: Request) {
  const raw = req.headers.get('x-vivace-worker') || ''
  return raw.length >= 40 && (await sha256Hex(raw)) === WORKER_KEY_SHA256
}

function clientAddress(req: Request) {
  const forwarded = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  return forwarded || req.headers.get('cf-connecting-ip') || req.headers.get('x-real-ip') || 'unknown'
}

async function consumeRateLimit(req: Request, scope: string, limit: number, seconds: number) {
  const fingerprint = await sha256Hex(
    `${clientAddress(req)}|${(req.headers.get('user-agent') || '').slice(0, 180)}`,
  )
  const { data, error } = await db.rpc('vivace_consume_rate_limit', {
    p_scope: scope,
    p_key_hash: fingerprint,
    p_limit: limit,
    p_window_seconds: seconds,
  })
  if (error) {
    console.error('RATE_LIMIT_RPC_FAILED', { scope, error: error.message })
    throw new Error('RATE_LIMIT_UNAVAILABLE')
  }
  return data === true
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function toBase64(blob: Blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  }
  return btoa(binary)
}

function extractGenerateContentText(data: any) {
  return clean(
    (data?.candidates?.[0]?.content?.parts || [])
      .map((part: any) => (typeof part?.text === 'string' ? part.text : ''))
      .join(' '),
  )
}

function transcriptMap(input: unknown) {
  const map = new Map<number, any>()
  if (!Array.isArray(input)) return map
  for (const item of input) {
    const questionId = Number(item?.questionId || 0)
    const text = clean(item?.text)
    if (!Number.isInteger(questionId) || questionId < 1 || questionId > MAX_QUESTIONS || !text) continue
    map.set(questionId, {
      questionId,
      text,
      language: clean(item?.language || 'he', 20),
      source: clean(item?.source || 'unknown', 100),
      updatedAt: item?.updatedAt || new Date().toISOString(),
    })
  }
  return map
}

function serializeTranscriptMap(map: Map<number, any>) {
  return [...map.values()].sort((a, b) => Number(a.questionId) - Number(b.questionId))
}

function validTranscriptCount(manifest: any[], map: Map<number, any>) {
  const validIds = new Set(
    manifest.map((item) => Number(item?.questionId || 0)).filter((id) => id >= 1 && id <= MAX_QUESTIONS),
  )
  let count = 0
  for (const [questionId, item] of map) {
    if (validIds.has(questionId) && clean(item?.text)) count++
  }
  return count
}

function statusFor(total: number, done: number, hadError = false) {
  if (total <= 0) return 'not_required'
  if (done >= total) return 'complete'
  if (done > 0) return 'partial'
  return hadError ? 'failed' : 'pending'
}

function nextRetryIso(attempt: number) {
  const minutes = Math.min(60, Math.max(2, 2 ** Math.min(5, Math.max(1, attempt))))
  return new Date(Date.now() + minutes * 60 * 1000).toISOString()
}

type GeminiResult =
  | { ok: true; text: string; model: string; http: number }
  | { ok: false; status: string; detail: string; http: number | null; model: string | null }

async function callGemini(blob: Blob, mimeType: string): Promise<GeminiResult> {
  if (!geminiKey) {
    return { ok: false, status: 'not_configured', detail: 'GEMINI_API_KEY is missing', http: null, model: null }
  }

  const encoded = await toBase64(blob)
  const payload = {
    contents: [{
      parts: [
        {
          text:
            'Transcribe every spoken word accurately in the original language. Return only the transcript. Do not translate, summarize, add timestamps, speaker labels, markdown, explanations, or guessed content. If speech is unclear, preserve only words you can hear.',
        },
        { inline_data: { mime_type: mimeType, data: encoded } },
      ],
    }],
    generationConfig: { maxOutputTokens: 8192 },
  }

  let last: GeminiResult = {
    ok: false,
    status: 'unknown',
    detail: 'No Gemini attempt completed',
    http: null,
    model: null,
  }

  for (const model of [PRIMARY_MODEL, FALLBACK_MODEL]) {
    for (let attempt = 0; attempt < 3; attempt++) {
      let response: Response
      let rawText = ''
      try {
        response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
          {
            method: 'POST',
            headers: { 'content-type': 'application/json', 'x-goog-api-key': geminiKey },
            body: JSON.stringify(payload),
          },
        )
        rawText = await response.text()
      } catch (error) {
        last = {
          ok: false,
          status: 'network_error',
          detail: errorDetail(error),
          http: null,
          model,
        }
        if (attempt < 2) {
          await sleep([900, 2400, 5500][attempt] + Math.floor(Math.random() * 500))
          continue
        }
        break
      }

      let parsed: any = {}
      try {
        parsed = JSON.parse(rawText)
      } catch {
        parsed = {}
      }

      if (response.ok) {
        const text = extractGenerateContentText(parsed)
        if (text) return { ok: true, text, model, http: response.status }
        last = {
          ok: false,
          status: 'empty',
          detail: 'Gemini returned no transcript text',
          http: response.status,
          model,
        }
        break
      }

      const detail = clean(parsed?.error?.message || rawText || `HTTP ${response.status}`, 500)
      last = {
        ok: false,
        status: TRANSIENT_HTTP.has(response.status) ? 'transient_api_error' : 'api_error',
        detail,
        http: response.status,
        model,
      }

      if (TRANSIENT_HTTP.has(response.status) && attempt < 2) {
        await sleep([900, 2400, 5500][attempt] + Math.floor(Math.random() * 500))
        continue
      }
      break
    }

    if (last.ok) return last
    if (last.http && !TRANSIENT_HTTP.has(last.http) && last.http !== 404) break
  }

  return last
}

async function acquireLock(id: string) {
  const now = new Date().toISOString()
  const lockUntil = new Date(Date.now() + LOCK_MS).toISOString()
  const { data, error } = await db
    .from('vivace_discovery_submissions')
    .update({
      transcription_lock_until: lockUntil,
      transcription_next_retry_at: null,
    })
    .eq('id', id)
    .eq('status', 'complete')
    .or(`transcription_lock_until.is.null,transcription_lock_until.lt.${now}`)
    .select('id,recording_manifest,transcripts,analysis,transcription_attempts,uploaded_recordings')
    .maybeSingle()

  if (error) throw error
  if (!data) return null

  const attempt = Number(data.transcription_attempts || 0) + 1
  const { error: attemptError } = await db
    .from('vivace_discovery_submissions')
    .update({
      transcription_attempts: attempt,
      transcription_status: 'pending',
      transcription_updated_at: new Date().toISOString(),
    })
    .eq('id', id)
  if (attemptError) throw attemptError

  return { ...data, attempt }
}

async function persistProgress(
  id: string,
  manifest: any[],
  map: Map<number, any>,
  model: string,
  debug: any[],
  final = false,
  hadError = false,
  attempt = 1,
  lastError: string | null = null,
) {
  const transcripts = serializeTranscriptMap(map)
  const done = validTranscriptCount(manifest, map)
  const total = manifest.length
  const status = statusFor(total, done, hadError)
  const update: Record<string, unknown> = {
    transcripts,
    transcription_status: status,
    transcription_provider: model ? `gemini:${model}` : `gemini:${PRIMARY_MODEL}`,
    transcription_updated_at: new Date().toISOString(),
    transcription_last_error: status === 'complete' ? null : lastError,
    analysis: { transcription_debug: debug.slice(-50) },
  }
  if (final) {
    update.transcription_lock_until = null
    update.transcription_next_retry_at =
      status === 'complete' || attempt >= MAX_WORKER_ATTEMPTS ? null : nextRetryIso(attempt)
  }
  const { data: current } = await db
    .from('vivace_discovery_submissions')
    .select('analysis')
    .eq('id', id)
    .single()
  const base = current?.analysis && typeof current.analysis === 'object' && !Array.isArray(current.analysis)
    ? current.analysis
    : {}
  update.analysis = { ...base, transcription_debug: debug.slice(-50) }

  const { error } = await db.from('vivace_discovery_submissions').update(update).eq('id', id)
  if (error) throw error
  return { status, done, total }
}

async function transcribeSubmission(id: string) {
  let claimed: any = null
  try {
    claimed = await acquireLock(id)
    if (!claimed) {
      console.log('TRANSCRIPTION_LOCK_BUSY', { id })
      return
    }

    const manifest = Array.isArray(claimed.recording_manifest) ? claimed.recording_manifest : []
    const map = transcriptMap(claimed.transcripts)
    const debug: any[] = []
    let lastModel = PRIMARY_MODEL
    let lastError: string | null = null
    let hadError = false

    const missing = manifest.filter((rec: any) => {
      const q = Number(rec?.questionId || 0)
      return q >= 1 && q <= MAX_QUESTIONS && !clean(map.get(q)?.text)
    })

    if (missing.length === 0) {
      await persistProgress(id, manifest, map, lastModel, debug, true, false, claimed.attempt, null)
      return
    }

    for (const rec of missing.slice(0, MAX_ITEMS_PER_RUN)) {
      const questionId = Number(rec?.questionId || 0)
      const ext = String(rec?.ext || 'webm').replace(/[^a-z0-9]/gi, '') || 'webm'
      const path = `${id}/Q${String(questionId).padStart(2, '0')}.${ext}`
      const { data: blob, error: downloadError } = await db.storage.from(BUCKET).download(path)

      if (downloadError || !blob) {
        hadError = true
        lastError = `Q${questionId}: audio missing`
        debug.push({ questionId, status: 'audio_missing', detail: clean(downloadError?.message, 300) })
        continue
      }

      if (blob.size <= 0 || blob.size > MAX_RECORDING_BYTES) {
        hadError = true
        lastError = `Q${questionId}: invalid audio size`
        debug.push({ questionId, status: 'invalid_size', bytes: blob.size })
        continue
      }

      const mimeType = geminiMime(String(rec?.mimeType || ''), blob.type || '', ext)
      const result = await callGemini(blob, mimeType)
      if (result.ok === false) {
        hadError = true
        lastError = `Q${questionId}: ${result.detail}`
        debug.push({
          questionId,
          status: result.status,
          http: result.http,
          model: result.model,
          detail: clean(result.detail, 300),
          mimeType,
        })
        continue
      }

      lastModel = result.model
      map.set(questionId, {
        questionId,
        text: result.text,
        language: 'he',
        source: `gemini:${result.model}`,
        updatedAt: new Date().toISOString(),
      })
      debug.push({
        questionId,
        status: 'ok',
        chars: result.text.length,
        model: result.model,
        mimeType,
      })

      await persistProgress(
        id,
        manifest,
        map,
        lastModel,
        debug,
        false,
        hadError,
        claimed.attempt,
        lastError,
      )
    }

    const remaining = manifest.filter((rec: any) => {
      const q = Number(rec?.questionId || 0)
      return q >= 1 && q <= MAX_QUESTIONS && !clean(map.get(q)?.text)
    }).length

    if (remaining > 0 && !lastError) lastError = `${remaining} recording(s) remain`
    const finalState = await persistProgress(
      id,
      manifest,
      map,
      lastModel,
      debug,
      true,
      hadError || remaining > 0,
      claimed.attempt,
      lastError,
    )
    console.log('TRANSCRIPTION_RUN_DONE', { id, attempt: claimed.attempt, remaining, ...finalState })
  } catch (error) {
    const detail = errorDetail(error)
    console.error('TRANSCRIPTION_FATAL', { id, detail })
    const attempt = Number(claimed?.attempt || 1)
    await db
      .from('vivace_discovery_submissions')
      .update({
        transcription_lock_until: null,
        transcription_status: 'failed',
        transcription_last_error: clean(detail, 1000),
        transcription_next_retry_at: attempt >= MAX_WORKER_ATTEMPTS ? null : nextRetryIso(attempt),
        transcription_updated_at: new Date().toISOString(),
      })
      .eq('id', id)
  }
}

function normalizeQuestions(input: unknown) {
  const questions = Array.isArray(input) ? input.slice(0, MAX_QUESTIONS) : []
  return questions.map((q: any, index: number) => {
    const number = Number(q?.number || index + 1)
    const answers = Array.isArray(q?.answers)
      ? q.answers.slice(0, 100).map((a: any) => ({
          name: clean(a?.name, 200),
          value: clean(a?.value, 10000),
        })).filter((a: any) => a.value)
      : []
    return {
      number: Number.isInteger(number) && number >= 1 && number <= MAX_QUESTIONS ? number : index + 1,
      question: clean(q?.question || `שאלה ${index + 1}`, 1000),
      answers,
    }
  })
}

function normalizeRecordings(input: unknown) {
  if (!Array.isArray(input)) return { ok: true as const, manifest: [] as any[] }
  if (input.length > MAX_RECORDINGS) {
    return { ok: false as const, error: 'TOO_MANY_RECORDINGS' }
  }
  const seen = new Set<number>()
  const manifest: any[] = []
  let totalBytes = 0

  for (const raw of input) {
    const questionId = Number(raw?.questionId || 0)
    const size = Number(raw?.size || 0)
    const mimeType = normalizeMime(raw?.mimeType)

    if (!Number.isInteger(questionId) || questionId < 1 || questionId > MAX_QUESTIONS) {
      return { ok: false as const, error: 'INVALID_RECORDING_QUESTION' }
    }
    if (seen.has(questionId)) return { ok: false as const, error: 'DUPLICATE_RECORDING_QUESTION' }
    if (!Number.isFinite(size) || size <= 0 || size > MAX_RECORDING_BYTES) {
      return { ok: false as const, error: 'RECORDING_SIZE_INVALID' }
    }
    if (!ALLOWED_MIME_TYPES.has(mimeType)) {
      return { ok: false as const, error: 'RECORDING_MIME_NOT_ALLOWED' }
    }

    seen.add(questionId)
    totalBytes += Math.floor(size)
    manifest.push({
      questionId,
      mimeType,
      size: Math.floor(size),
      ext: extensionFor(mimeType),
    })
  }

  if (totalBytes > MAX_TOTAL_BYTES) {
    return { ok: false as const, error: 'SUBMISSION_TOO_LARGE' }
  }
  return { ok: true as const, manifest }
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get('origin')
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors(origin) })
  if (req.method !== 'POST') return json({ error: 'METHOD_NOT_ALLOWED' }, 405, origin)
  if (!origin || !ALLOWED_ORIGINS.has(origin)) return json({ error: 'ORIGIN_NOT_ALLOWED' }, 403, origin)
  if (req.headers.get('x-vivace-form') !== FORM_HEADER) {
    return json({ error: 'INVALID_FORM' }, 403, origin)
  }

  try {
    const body = await req.json().catch(() => ({}))
    const action = String(body?.action || '')

    if (action === 'prepare') {
      if (!(await consumeRateLimit(req, 'prepare', 10, 3600))) {
        return json({ error: 'RATE_LIMITED' }, 429, origin)
      }

      const questions = normalizeQuestions(body?.questions)
      const normalized = normalizeRecordings(body?.recordings)
      if (!normalized.ok) return json({ error: normalized.error }, 400, origin)
      const manifest = normalized.manifest

      const answeredIds = new Set<number>()
      questions.forEach((q: any) => {
        if (q.answers.length > 0) answeredIds.add(q.number)
      })
      manifest.forEach((rec: any) => answeredIds.add(rec.questionId))

      const submissionToken = randomHex(32)
      const submissionTokenHash = await sha256Hex(submissionToken)
      const { data: row, error: insertError } = await db
        .from('vivace_discovery_submissions')
        .insert({
          client_submitted_at: body?.submittedAt || null,
          status: 'uploading',
          answered_count: answeredIds.size,
          question_count: questions.length || MAX_QUESTIONS,
          expected_recordings: manifest.length,
          uploaded_recordings: 0,
          answers: questions,
          recording_manifest: manifest,
          transcripts: [],
          transcription_status: manifest.length ? 'pending' : 'not_required',
          transcription_provider: manifest.length && geminiKey ? `gemini:${PRIMARY_MODEL}` : null,
          transcription_updated_at: null,
          transcription_attempts: 0,
          transcription_lock_until: null,
          transcription_next_retry_at: null,
          transcription_last_error: null,
          submission_token_hash: submissionTokenHash,
          client_meta: {
            userAgent: req.headers.get('user-agent') || null,
            serverTranscription: true,
          },
        })
        .select('id')
        .single()

      if (insertError || !row?.id) throw insertError || new Error('SUBMISSION_CREATE_FAILED')

      try {
        const uploads = []
        for (const rec of manifest) {
          const path = `${row.id}/Q${String(rec.questionId).padStart(2, '0')}.${rec.ext}`
          const { data, error } = await db.storage
            .from(BUCKET)
            .createSignedUploadUrl(path, { upsert: false })
          if (error || !data?.token || !data?.signedUrl) {
            throw error || new Error('SIGNED_UPLOAD_FAILED')
          }
          uploads.push({
            questionId: rec.questionId,
            path,
            token: data.token,
            signedUrl: data.signedUrl,
            mimeType: rec.mimeType,
          })
        }

        return json({
          ok: true,
          submissionId: row.id,
          submissionToken,
          uploads,
          transcriptionStatus: manifest.length ? 'pending' : 'not_required',
        }, 200, origin)
      } catch (error) {
        await db
          .from('vivace_discovery_submissions')
          .update({ status: 'failed', transcription_last_error: 'SIGNED_UPLOAD_SETUP_FAILED' })
          .eq('id', row.id)
        throw error
      }
    }

    if (action === 'finalize') {
      if (!(await consumeRateLimit(req, 'finalize', 30, 3600))) {
        return json({ error: 'RATE_LIMITED' }, 429, origin)
      }

      const submissionId = String(body?.submissionId || '')
      const submissionToken = String(body?.submissionToken || '')
      if (!/^[0-9a-f-]{36}$/i.test(submissionId)) {
        return json({ error: 'INVALID_SUBMISSION_ID' }, 400, origin)
      }
      if (!/^[0-9a-f]{64}$/i.test(submissionToken)) {
        return json({ error: 'INVALID_SUBMISSION_TOKEN' }, 403, origin)
      }

      const { data: row, error: rowError } = await db
        .from('vivace_discovery_submissions')
        .select('status,recording_manifest,transcripts,submission_token_hash')
        .eq('id', submissionId)
        .single()
      if (rowError || !row) return json({ error: 'SUBMISSION_NOT_FOUND' }, 404, origin)
      if ((await sha256Hex(submissionToken)) !== String(row.submission_token_hash || '')) {
        return json({ error: 'SUBMISSION_ACCESS_DENIED' }, 403, origin)
      }

      const manifest = Array.isArray(row.recording_manifest) ? row.recording_manifest : []
      const { data: files, error: listError } = await db.storage.from(BUCKET).list(submissionId, {
        limit: 100,
      })
      if (listError) throw listError

      const fileMap = new Map(
        (files || []).filter((file: any) => file?.name && !file.name.endsWith('/'))
          .map((file: any) => [String(file.name), file]),
      )
      const problems: any[] = []

      for (const rec of manifest) {
        const expectedName = `Q${String(Number(rec.questionId)).padStart(2, '0')}.${rec.ext}`
        const file: any = fileMap.get(expectedName)
        if (!file) {
          problems.push({ questionId: rec.questionId, error: 'MISSING_FILE' })
          continue
        }
        const storedSize = Number(file?.metadata?.size || 0)
        if (storedSize <= 0) {
          problems.push({ questionId: rec.questionId, error: 'EMPTY_FILE' })
        } else if (storedSize > MAX_RECORDING_BYTES) {
          problems.push({ questionId: rec.questionId, error: 'FILE_TOO_LARGE' })
        } else if (storedSize !== Number(rec.size || 0)) {
          problems.push({
            questionId: rec.questionId,
            error: 'SIZE_MISMATCH',
            expected: Number(rec.size || 0),
            actual: storedSize,
          })
        }
      }

      if (problems.length) {
        return json({ error: 'UPLOADS_INCOMPLETE_OR_INVALID', problems }, 409, origin)
      }

      const map = transcriptMap(row.transcripts)
      const done = validTranscriptCount(manifest, map)
      const transcriptionStatus = statusFor(manifest.length, done, false)
      const { error: updateError } = await db
        .from('vivace_discovery_submissions')
        .update({
          status: 'complete',
          uploaded_recordings: manifest.length,
          completed_at: new Date().toISOString(),
          transcription_status: transcriptionStatus,
          transcription_provider: manifest.length && geminiKey ? `gemini:${PRIMARY_MODEL}` : null,
          transcription_updated_at: done ? new Date().toISOString() : null,
          transcription_next_retry_at: manifest.length > done ? new Date().toISOString() : null,
          transcription_last_error: null,
        })
        .eq('id', submissionId)
      if (updateError) throw updateError

      if (manifest.length > done) EdgeRuntime.waitUntil(transcribeSubmission(submissionId))

      return json({
        ok: true,
        submissionId,
        uploadedRecordings: manifest.length,
        transcriptionStatus,
        transcriptionQueued: manifest.length > done,
        geminiConfigured: Boolean(geminiKey),
      }, 200, origin)
    }

    if (action === 'internal_retry') {
      if (!(await workerAllowed(req))) return json({ error: 'WORKER_UNAUTHORIZED' }, 403, origin)
      const submissionId = String(body?.submissionId || '')
      if (!/^[0-9a-f-]{36}$/i.test(submissionId)) {
        return json({ error: 'INVALID_SUBMISSION_ID' }, 400, origin)
      }
      const { data: row, error } = await db
        .from('vivace_discovery_submissions')
        .select('status,uploaded_recordings,transcription_attempts')
        .eq('id', submissionId)
        .single()
      if (error || !row) return json({ error: 'SUBMISSION_NOT_FOUND' }, 404, origin)
      if (row.status !== 'complete') return json({ error: 'SUBMISSION_NOT_COMPLETE' }, 409, origin)
      if (Number(row.transcription_attempts || 0) >= MAX_WORKER_ATTEMPTS) {
        return json({ error: 'MAX_RETRIES_REACHED' }, 409, origin)
      }

      EdgeRuntime.waitUntil(transcribeSubmission(submissionId))
      return json({ ok: true, submissionId, queued: true }, 200, origin)
    }

    return json({ error: 'UNKNOWN_ACTION' }, 400, origin)
  } catch (error) {
    const detail = errorDetail(error)
    const upper = detail.toUpperCase()
    console.error('VIVACE_SUBMIT_ERROR', { detail })

    if (upper.includes('RATE_LIMIT_UNAVAILABLE')) {
      return json({ error: 'SERVICE_TEMPORARILY_UNAVAILABLE' }, 503, origin)
    }
    if (
      upper.includes('SUBMISSION_ALREADY_COMPLETED') ||
      detail.includes('vivace_discovery_completed_session_unique_idx')
    ) {
      return json({ error: 'SUBMISSION_ALREADY_COMPLETED' }, 409, origin)
    }
    if (upper.includes('CLIENT_SESSION_INVALID')) {
      return json({ error: 'CLIENT_SESSION_INVALID' }, 400, origin)
    }
    if (upper.includes('INVITE_EXPIRED_OR_EXHAUSTED')) {
      return json({ error: 'INVITE_EXPIRED_OR_EXHAUSTED' }, 403, origin)
    }
    if (upper.includes('INVITE_REQUIRED_OR_INVALID')) {
      return json({ error: 'INVITE_REQUIRED_OR_INVALID' }, 403, origin)
    }
    if (upper.includes('PRIVACY_ACK_REQUIRED')) {
      return json({ error: 'PRIVACY_ACK_REQUIRED' }, 403, origin)
    }

    return json({ error: 'INTERNAL_ERROR' }, 500, origin)
  }
})