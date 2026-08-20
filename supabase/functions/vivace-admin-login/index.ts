import { createClient } from 'npm:@supabase/supabase-js@2.95.0'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const raw = Deno.env.get('SUPABASE_SECRET_KEYS')
const legacy = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
const serviceKey = raw ? JSON.parse(raw).default : legacy
if (!serviceKey) throw new Error('Missing Supabase secret key')

const db = createClient(SUPABASE_URL, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const SESSION_TTL_MS = 8 * 60 * 60 * 1000
// Emergency fallback only if the registry RPC itself is unavailable during rollout.
const LEGACY_ADMIN_KEY_HASH = '3ae6b6af1b5000be920bd67a59a5b668bd08bf66db2dafe9980761650b870642'
const ALLOWED_ORIGINS = new Set([
  'https://chananelradnik123-prog.github.io',
  'https://eadljasmuqnzcrfudsib.supabase.co',
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
    'Access-Control-Allow-Headers': 'content-type, x-vivace-admin-key',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store, max-age=0',
    'X-Content-Type-Options': 'nosniff',
  }
}

function json(body: unknown, status: number, origin: string | null) {
  return new Response(JSON.stringify(body), { status, headers: cors(origin) })
}

function randomHex(bytes = 32) {
  const buffer = new Uint8Array(bytes)
  crypto.getRandomValues(buffer)
  return [...buffer].map((b) => b.toString(16).padStart(2, '0')).join('')
}

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

function clientAddress(req: Request) {
  const forwarded = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  return forwarded || req.headers.get('cf-connecting-ip') || req.headers.get('x-real-ip') || 'unknown'
}

async function consumeFailedAuthLimit(req: Request) {
  const fingerprint = await sha256Hex(
    `${clientAddress(req)}|${(req.headers.get('user-agent') || '').slice(0, 180)}`,
  )
  const { data, error } = await db.rpc('vivace_consume_rate_limit', {
    p_scope: 'admin_auth_failure',
    p_key_hash: fingerprint,
    p_limit: 20,
    p_window_seconds: 3600,
  })
  if (error) {
    console.error('ADMIN_LOGIN_RATE_LIMIT_FAILED', error.message)
    return false
  }
  return data === true
}

async function validMasterKey(req: Request) {
  const key = (req.headers.get('x-vivace-admin-key') || '').trim()
  if (key.length < 12 || key.length > 256) return false
  const keyHash = await sha256Hex(key)

  const { data, error } = await db.rpc('vivace_touch_admin_access_key', {
    p_key_hash: keyHash,
  })
  if (error) {
    console.error('ADMIN_KEY_REGISTRY_UNAVAILABLE', error.message)
    return keyHash === LEGACY_ADMIN_KEY_HASH
  }
  return Boolean(data)
}

async function createSession(req: Request) {
  const token = randomHex(32)
  const now = new Date()
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS).toISOString()
  const tokenHash = await sha256Hex(token)
  const userAgentHash = await sha256Hex((req.headers.get('user-agent') || '').slice(0, 300))

  await db
    .from('vivace_admin_sessions')
    .delete()
    .lt('expires_at', now.toISOString())

  const { error } = await db.from('vivace_admin_sessions').insert({
    token_hash: tokenHash,
    user_agent_hash: userAgentHash,
    expires_at: expiresAt,
  })
  if (error) throw error
  return { token, expiresAt }
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get('origin')
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors(origin) })
  if (req.method !== 'POST') return json({ error: 'METHOD_NOT_ALLOWED' }, 405, origin)
  if (origin && !ALLOWED_ORIGINS.has(origin)) return json({ error: 'ORIGIN_NOT_ALLOWED' }, 403, origin)

  try {
    const body = await req.json().catch(() => ({}))
    if (String(body?.action || 'login') !== 'login') {
      return json({ error: 'UNKNOWN_ACTION' }, 400, origin)
    }

    if (!(await validMasterKey(req))) {
      const withinLimit = await consumeFailedAuthLimit(req)
      return json({ error: withinLimit ? 'UNAUTHORIZED' : 'RATE_LIMITED' }, withinLimit ? 401 : 429, origin)
    }

    const session = await createSession(req)
    return json({
      ok: true,
      sessionToken: session.token,
      expiresAt: session.expiresAt,
      sessionTtlSeconds: Math.floor(SESSION_TTL_MS / 1000),
    }, 200, origin)
  } catch (error) {
    console.error('VIVACE_ADMIN_LOGIN_FAILED', error)
    return json({ error: 'INTERNAL_ERROR' }, 500, origin)
  }
})
