import { createClient } from 'npm:@supabase/supabase-js@2.95.0'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const raw = Deno.env.get('SUPABASE_SECRET_KEYS')
const legacy = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
const serviceKey = raw ? JSON.parse(raw).default : legacy
if (!serviceKey) throw new Error('Missing Supabase service key')

const db = createClient(SUPABASE_URL, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})

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
    'Access-Control-Allow-Headers': 'content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store, max-age=0',
    'X-Content-Type-Options': 'nosniff',
  }
}

function json(body: unknown, status: number, origin: string | null) {
  return new Response(JSON.stringify(body), { status, headers: cors(origin) })
}

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

function clientAddress(req: Request) {
  const forwarded = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  return forwarded || req.headers.get('cf-connecting-ip') || req.headers.get('x-real-ip') || 'unknown'
}

async function rateAllowed(req: Request) {
  const fingerprint = await sha256Hex(
    `${clientAddress(req)}|${(req.headers.get('user-agent') || '').slice(0, 180)}`,
  )
  const { data, error } = await db.rpc('vivace_consume_rate_limit', {
    p_scope: 'invite_check',
    p_key_hash: fingerprint,
    p_limit: 60,
    p_window_seconds: 3600,
  })
  if (error) throw error
  return data === true
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get('origin')
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors(origin) })
  if (req.method !== 'POST') return json({ error: 'METHOD_NOT_ALLOWED' }, 405, origin)
  if (!origin || !ALLOWED_ORIGINS.has(origin)) return json({ error: 'ORIGIN_NOT_ALLOWED' }, 403, origin)

  try {
    if (!(await rateAllowed(req))) return json({ error: 'RATE_LIMITED' }, 429, origin)

    const body = await req.json().catch(() => ({}))
    const token = String(body?.inviteToken || '')
    if (!/^[0-9a-f]{64}$/i.test(token)) {
      return json({ ok: true, valid: false }, 200, origin)
    }

    const tokenHash = await sha256Hex(token)
    const now = new Date().toISOString()
    const { data, error } = await db
      .from('vivace_discovery_invites')
      .select('label,expires_at,max_uses,use_count,disabled_at')
      .eq('token_hash', tokenHash)
      .is('disabled_at', null)
      .or(`expires_at.is.null,expires_at.gt.${now}`)
      .maybeSingle()

    if (error) throw error
    const valid = Boolean(data && Number(data.use_count || 0) < Number(data.max_uses || 0))
    return json({
      ok: true,
      valid,
      label: valid ? data?.label : null,
      expiresAt: valid ? data?.expires_at : null,
      remainingUses: valid ? Number(data?.max_uses || 0) - Number(data?.use_count || 0) : 0,
    }, 200, origin)
  } catch (error) {
    console.error('VIVACE_INVITE_CHECK_ERROR', {
      detail: error instanceof Error ? error.message : String(error),
    })
    return json({ error: 'INTERNAL_ERROR' }, 500, origin)
  }
})
