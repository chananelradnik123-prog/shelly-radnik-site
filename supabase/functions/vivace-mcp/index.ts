import { createClient } from 'npm:@supabase/supabase-js@2.95.0'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const raw = Deno.env.get('SUPABASE_SECRET_KEYS')
const legacy = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
const serviceKey = raw ? JSON.parse(raw).default : legacy
if (!serviceKey) throw new Error('Missing Supabase secret key')
const db = createClient(SUPABASE_URL, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const BUCKET = 'vivace-discovery-private'
const KEY_HASH = '29e35774a50c3a765441c21a06005f995fac189721b9385c30f81d70987cf1a1'
const ADMIN = 'https://chananelradnik123-prog.github.io/shelly-radnik-site/vivace-discovery/?admin=1'
const PROTOCOL_VERSION = '2025-11-25'
const SERVER_VERSION = '0.4.0'
const MAX_INLINE_AUDIO_BYTES = 8 * 1024 * 1024

const tools = [
  {
    name: 'search',
    title: 'Search Vivace submissions',
    description: 'Find Vivace Discovery submissions, including the latest submission and transcription readiness.',
    inputSchema: {
      type: 'object',
      properties: { query: { type: 'string' } },
      required: ['query'],
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: false,
      idempotentHint: true,
    },
  },
  {
    name: 'fetch',
    title: 'Fetch Vivace submission',
    description:
      'Return the full questionnaire answers, recording metadata, saved transcripts, and transcription status for a Vivace submission.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string' } },
      required: ['id'],
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: false,
      idempotentHint: true,
    },
  },
  {
    name: 'get_recording',
    title: 'Get Vivace recording',
    description:
      'Return a specific original recording. Prefer the saved transcript from fetch for analysis; use this only when the original audio is explicitly required.',
    inputSchema: {
      type: 'object',
      properties: {
        submission_id: { type: 'string', format: 'uuid' },
        question_id: { type: 'integer', minimum: 1, maximum: 50 },
      },
      required: ['submission_id', 'question_id'],
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: false,
      idempotentHint: true,
    },
  },
]

function clean(value: unknown, max = 20000) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max)
}

function bytesToBase64(bytes: Uint8Array) {
  const chunk = 0x8000
  let binary = ''
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

async function hash(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

async function allowed(req: Request) {
  const url = new URL(req.url)
  const queryKey = url.searchParams.get('key') || ''
  const auth = req.headers.get('authorization') || ''
  const bearer = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : ''
  const parts = url.pathname.split('/').filter(Boolean)
  const last = parts.at(-1) || ''
  const pathKey = last === 'vivace-mcp' ? '' : last
  const candidate = queryKey || bearer || pathKey
  return Boolean(candidate) && (await hash(candidate)) === KEY_HASH
}

function output(id: any, result: any, status = 200) {
  return new Response(JSON.stringify({ jsonrpc: '2.0', id, result }), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  })
}

function rpcError(id: any, code: number, message: string, status = 200) {
  return new Response(JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } }), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  })
}

function transcriptCount(row: any) {
  return Array.isArray(row?.transcripts)
    ? row.transcripts.filter((item: any) => clean(item?.text)).length
    : 0
}

function rowTitle(row: any) {
  const rawDate = row.completed_at || row.created_at
  const when = rawDate
    ? new Date(rawDate).toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem' })
    : 'ללא תאריך'
  return `Vivace Discovery — ${when} — ${row.answered_count ?? 0} תשובות, ${row.uploaded_recordings ?? 0} הקלטות, ${transcriptCount(row)} תמלולים`
}

function answerText(items: any) {
  return Array.isArray(items)
    ? items.map((item: any) =>
      `${item?.name ? clean(item.name, 200) + ': ' : ''}${clean(item?.value, 10000)}`
    ).filter(Boolean).join(' | ')
    : ''
}

function normalizeTranscripts(input: any) {
  const map = new Map<number, any>()
  if (!Array.isArray(input)) return []
  for (const item of input) {
    const questionId = Number(item?.questionId || 0)
    const text = clean(item?.text)
    if (!Number.isInteger(questionId) || questionId < 1 || questionId > 50 || !text) continue
    map.set(questionId, {
      questionId,
      text,
      language: clean(item?.language || 'he', 20),
      source: clean(item?.source || 'unknown', 100),
      updatedAt: item?.updatedAt || null,
    })
  }
  return [...map.values()].sort((a, b) => a.questionId - b.questionId)
}

async function getSubmission(id: string) {
  const { data, error } = await db
    .from('vivace_discovery_submissions')
    .select('*')
    .eq('id', id)
    .single()
  if (error || !data) throw new Error('SUBMISSION_NOT_FOUND')
  return data
}

async function searchTool(args: any) {
  const { data, error } = await db
    .from('vivace_discovery_submissions')
    .select('id,created_at,completed_at,status,answered_count,uploaded_recordings,transcripts,transcription_status,transcription_provider')
    .order('created_at', { ascending: false })
    .limit(30)
  if (error) throw error

  const query = clean(args?.query, 200).toLowerCase()
  const recent = !query ||
    ['latest', 'recent', 'אחרון', 'אחרונה', 'חדש', 'חדשה'].some((word) => query.includes(word))
  const rows = (data || []).filter((row: any, index: number) =>
    recent
      ? index < 10
      : row.id.toLowerCase().includes(query) || rowTitle(row).toLowerCase().includes(query)
  ).slice(0, 10)

  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        results: rows.map((row: any) => ({
          id: `submission:${row.id}`,
          title: rowTitle(row),
          url: `${ADMIN}#submission=${row.id}`,
          transcriptionStatus: row.transcription_status,
          transcriptCount: transcriptCount(row),
          recordingCount: Number(row.uploaded_recordings || 0),
        })),
      }),
    }],
  }
}

async function fetchTool(args: any) {
  const id = String(args?.id || '').replace(/^submission:/, '')
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error('INVALID_SUBMISSION_ID')

  const row = await getSubmission(id)
  const transcripts = normalizeTranscripts(row.transcripts)
  const transcriptByQuestion = new Map(transcripts.map((item: any) => [item.questionId, item]))
  const questions = (Array.isArray(row.answers) ? row.answers : []).map((question: any) => {
    const number = Number(question?.number || 0)
    const transcript = transcriptByQuestion.get(number)
    return {
      number,
      question: clean(question?.question, 1000),
      answer: answerText(question?.answers),
      transcript: transcript?.text || null,
      transcriptSource: transcript?.source || null,
    }
  })
  const recordings = (Array.isArray(row.recording_manifest) ? row.recording_manifest : []).map(
    (recording: any) => ({
      id: `recording:${id}:${Number(recording?.questionId || 0)}`,
      questionId: Number(recording?.questionId || 0),
      mimeType: clean(recording?.mimeType, 100),
      size: Number(recording?.size || 0),
      hasTranscript: transcriptByQuestion.has(Number(recording?.questionId || 0)),
    }),
  )

  const payload = {
    id: `submission:${id}`,
    title: rowTitle(row),
    text: JSON.stringify({
      status: row.status,
      answeredCount: row.answered_count,
      transcriptionStatus: row.transcription_status,
      transcriptionProvider: row.transcription_provider,
      transcriptionUpdatedAt: row.transcription_updated_at,
      recordingCount: recordings.length,
      transcriptCount: transcripts.length,
      readyForAnalysis: recordings.length === transcripts.length,
      questions,
      recordings,
      transcripts,
    }),
    url: `${ADMIN}#submission=${id}`,
    metadata: {
      createdAt: row.created_at,
      completedAt: row.completed_at,
      transcriptionStatus: row.transcription_status,
      transcriptionProvider: row.transcription_provider,
      recordings,
      transcripts,
    },
  }

  return { content: [{ type: 'text', text: JSON.stringify(payload) }] }
}

async function recordingTool(args: any) {
  const id = String(args?.submission_id || '')
  const questionId = Number(args?.question_id || 0)
  if (
    !/^[0-9a-f-]{36}$/i.test(id) ||
    !Number.isInteger(questionId) ||
    questionId < 1 ||
    questionId > 50
  ) throw new Error('INVALID_RECORDING_ID')

  const row = await getSubmission(id)
  const manifest = Array.isArray(row.recording_manifest) ? row.recording_manifest : []
  const recording = manifest.find((item: any) => Number(item?.questionId) === questionId)
  if (!recording) throw new Error('RECORDING_NOT_FOUND')

  const ext = String(recording?.ext || 'webm').replace(/[^a-z0-9]/gi, '') || 'webm'
  const path = `${id}/Q${String(questionId).padStart(2, '0')}.${ext}`
  const downloaded = await db.storage.from(BUCKET).download(path)
  if (downloaded.error || !downloaded.data) throw new Error('AUDIO_DOWNLOAD_FAILED')

  const question = (Array.isArray(row.answers) ? row.answers : [])
    .find((item: any) => Number(item?.number) === questionId)
  const questionText = clean(question?.question || `שאלה ${questionId}`, 1000)
  const resourceMimeType = clean(
    recording?.mimeType || downloaded.data.type || 'audio/webm',
    100,
  )
  const audioMimeType = resourceMimeType.split(';')[0].trim().toLowerCase() || 'audio/webm'
  const size = Number(recording?.size || downloaded.data.size || 0)
  const fileName = `Vivace-${id.slice(0, 8)}-Q${String(questionId).padStart(2, '0')}.${ext}`
  const transcripts = normalizeTranscripts(row.transcripts)
  const savedTranscript = transcripts.find((item: any) => item.questionId === questionId)
  const signed = await db.storage.from(BUCKET).createSignedUrl(path, 600, { download: true })

  const content: any[] = [{
    type: 'text',
    text: JSON.stringify({
      questionId,
      question: questionText,
      savedTranscript: savedTranscript?.text || null,
      transcriptSource: savedTranscript?.source || null,
      fileName,
      mimeType: resourceMimeType,
      size,
    }),
  }]

  if (downloaded.data.size <= MAX_INLINE_AUDIO_BYTES) {
    const audioBytes = new Uint8Array(await downloaded.data.arrayBuffer())
    content.push({ type: 'audio', data: bytesToBase64(audioBytes), mimeType: audioMimeType })
  } else {
    content.push({
      type: 'text',
      text: 'The original audio is larger than the safe inline MCP limit; use the temporary resource link.',
    })
  }

  if (!signed.error && signed.data?.signedUrl) {
    content.push({
      type: 'resource_link',
      uri: signed.data.signedUrl,
      name: fileName,
      title: `Vivace Q${questionId}`,
      description: questionText,
      mimeType: resourceMimeType,
      size,
    })
  }

  return { content }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'GET') {
    return new Response(`Vivace MCP ${SERVER_VERSION}`, {
      status: 200,
      headers: { 'Cache-Control': 'no-store' },
    })
  }
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })

  let message: any
  try {
    message = await req.json()
  } catch {
    return rpcError(null, -32700, 'Parse error', 400)
  }

  const method = String(message?.method || '')
  const id = message?.id ?? null

  if (method === 'initialize') {
    return output(id, {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: { tools: {} },
      serverInfo: { name: 'vivace-discovery', version: SERVER_VERSION },
      instructions:
        'Read-only Vivace OS Discovery connector. Use search, then fetch. fetch returns questionnaire answers and saved Gemini transcripts. Use get_recording only when the original audio is explicitly required.',
    })
  }
  if (method === 'notifications/initialized') return new Response(null, { status: 202 })
  if (method === 'ping') return output(id, {})
  if (method === 'tools/list') return output(id, { tools })
  if (method !== 'tools/call') return rpcError(id, -32601, 'Method not found')

  if (!(await allowed(req))) {
    return new Response(
      JSON.stringify({
        jsonrpc: '2.0',
        id,
        error: { code: -32001, message: 'Unauthorized' },
      }),
      {
        status: 401,
        headers: {
          'Content-Type': 'application/json',
          'WWW-Authenticate': 'Bearer realm="vivace-mcp"',
          'Cache-Control': 'no-store',
        },
      },
    )
  }

  const name = String(message?.params?.name || '')
  const args = message?.params?.arguments || {}
  try {
    if (name === 'search') return output(id, await searchTool(args))
    if (name === 'fetch') return output(id, await fetchTool(args))
    if (name === 'get_recording') return output(id, await recordingTool(args))
    return output(id, {
      isError: true,
      content: [{ type: 'text', text: 'Unknown tool' }],
    })
  } catch (error) {
    console.error('VIVACE_MCP_TOOL_FAILED', { name, error })
    return output(id, {
      isError: true,
      content: [{
        type: 'text',
        text: error instanceof Error ? error.message : 'Tool failed',
      }],
    })
  }
})
