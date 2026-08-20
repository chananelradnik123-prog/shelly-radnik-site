import { createClient } from 'npm:@supabase/supabase-js@2.95.0'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const raw = Deno.env.get('SUPABASE_SECRET_KEYS')
const legacy = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
const serviceKey = raw ? JSON.parse(raw).default : legacy
if (!serviceKey) throw new Error('Missing Supabase secret key')

const db = createClient(SUPABASE_URL, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const ALLOWED_ORIGINS = new Set([
  'https://chananelradnik123-prog.github.io',
  'https://eadljasmuqnzcrfudsib.supabase.co',
  'http://localhost:3000',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
])
const MAX_USABLE_KEYS_PER_TYPE = 5
const CREATE_SESSION_MAX_AGE_MS = 15 * 60 * 1000

function cors(origin: string | null) {
  const allowed = origin && ALLOWED_ORIGINS.has(origin)
    ? origin
    : 'https://chananelradnik123-prog.github.io'
  return {
    'Access-Control-Allow-Origin': allowed,
    'Vary': 'Origin',
    'Access-Control-Allow-Headers': 'content-type, x-vivace-admin-session',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store, max-age=0',
    'X-Content-Type-Options': 'nosniff',
  }
}

function json(body: unknown, status: number, origin: string | null) {
  return new Response(JSON.stringify(body), { status, headers: cors(origin) })
}

function clean(value: unknown, max = 120) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max)
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

async function getAdminSession(req: Request) {
  const token = req.headers.get('x-vivace-admin-session') || ''
  if (!/^[0-9a-f]{64}$/i.test(token)) return null
  const tokenHash = await sha256Hex(token)
  const userAgentHash = await sha256Hex((req.headers.get('user-agent') || '').slice(0, 300))
  const now = new Date().toISOString()

  const { data, error } = await db
    .from('vivace_admin_sessions')
    .select('id,user_agent_hash,created_at,expires_at')
    .eq('token_hash', tokenHash)
    .is('revoked_at', null)
    .gt('expires_at', now)
    .maybeSingle()
  if (error) throw error
  if (!data || String(data.user_agent_hash) !== userAgentHash) return null

  await db.from('vivace_admin_sessions').update({ last_seen_at: now }).eq('id', data.id)
  return {
    id: String(data.id),
    tokenHash,
    createdAt: String(data.created_at || ''),
  }
}

function sessionFreshForCreation(session: { createdAt: string }) {
  const createdAt = new Date(session.createdAt).getTime()
  return Number.isFinite(createdAt)
    && createdAt <= Date.now() + 60_000
    && Date.now() - createdAt <= CREATE_SESSION_MAX_AGE_MS
}

async function consumeCreateLimit(sessionHash: string) {
  const { data, error } = await db.rpc('vivace_consume_rate_limit', {
    p_scope: 'access_key_create',
    p_key_hash: sessionHash,
    p_limit: 5,
    p_window_seconds: 86400,
  })
  if (error) {
    console.error('KEY_CREATE_RATE_LIMIT_FAILED', error.message)
    return false
  }
  return data === true
}

function tableFor(type: string) {
  if (type === 'admin') return 'vivace_admin_access_keys'
  if (type === 'mcp') return 'vivace_mcp_access_keys'
  return ''
}

async function listKeys(type: 'admin' | 'mcp') {
  const table = tableFor(type)
  const { data, error } = await db
    .from(table)
    .select('id,label,status,created_at,last_used_at,use_count,expires_at,retired_at,revoked_at')
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data || []).map((item: any) => ({ ...item, type }))
}

async function createKey(
  type: 'admin' | 'mcp',
  label: string,
  session: { id: string; tokenHash: string },
) {
  if (!(await consumeCreateLimit(session.tokenHash))) throw new Error('RATE_LIMITED')

  const table = tableFor(type)
  const { count, error: countError } = await db
    .from(table)
    .select('*', { count: 'exact', head: true })
    .in('status', ['active','retiring'])
    .is('revoked_at', null)
  if (countError) throw countError
  if ((count || 0) >= MAX_USABLE_KEYS_PER_TYPE) throw new Error('TOO_MANY_ACTIVE_KEYS')

  const rawKey = randomHex(32)
  const keyHash = await sha256Hex(rawKey)
  const defaultLabel = `${type}-rotation-${new Date().toISOString().slice(0, 10)}`
  const finalLabel = clean(label || defaultLabel, 120) || defaultLabel

  const { data, error } = await db.from(table).insert({
    key_hash: keyHash,
    label: finalLabel,
    status: 'active',
    metadata: {
      createdVia: 'vivace-key-manager-v1',
      actorSessionId: session.id,
    },
  }).select('id,label,status,created_at').single()
  if (error || !data) throw error || new Error('KEY_CREATE_FAILED')

  const audit = await db.from('vivace_security_events').insert({
    event_type: 'access_key_created',
    key_type: type,
    key_id: data.id,
    actor_session_id: session.id,
    metadata: { label: finalLabel },
  })
  if (audit.error) {
    await db.from(table).delete().eq('id', data.id)
    throw audit.error
  }

  return {
    id: data.id,
    type,
    label: data.label,
    status: data.status,
    createdAt: data.created_at,
    rawKey,
    shownOnce: true,
  }
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get('origin')
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors(origin) })
  if (req.method !== 'POST') return json({ error: 'METHOD_NOT_ALLOWED' }, 405, origin)
  if (origin && !ALLOWED_ORIGINS.has(origin)) return json({ error: 'ORIGIN_NOT_ALLOWED' }, 403, origin)

  try {
    const session = await getAdminSession(req)
    if (!session) return json({ error: 'UNAUTHORIZED' }, 401, origin)

    const body = await req.json().catch(() => ({}))
    const action = String(body?.action || 'list')

    if (action === 'list') {
      const [adminKeys, mcpKeys] = await Promise.all([listKeys('admin'), listKeys('mcp')])
      return json({
        ok: true,
        keys: { admin: adminKeys, mcp: mcpKeys },
        canCreateWithoutReauth: sessionFreshForCreation(session),
      }, 200, origin)
    }

    if (action === 'create') {
      if (!sessionFreshForCreation(session)) {
        return json({ error: 'REAUTH_REQUIRED' }, 401, origin)
      }

      const type = String(body?.type || '')
      if (type !== 'admin' && type !== 'mcp') return json({ error: 'INVALID_KEY_TYPE' }, 400, origin)
      try {
        const created = await createKey(type, String(body?.label || ''), session)
        return json({
          ok: true,
          key: created,
          warning: 'This raw key is returned once and cannot be recovered from the server.',
        }, 200, origin)
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error)
        if (detail === 'RATE_LIMITED') return json({ error: detail }, 429, origin)
        if (detail === 'TOO_MANY_ACTIVE_KEYS') return json({ error: detail }, 409, origin)
        throw error
      }
    }

    return json({ error: 'UNKNOWN_ACTION' }, 400, origin)
  } catch (error) {
    console.error('VIVACE_KEY_MANAGER_FAILED', error)
    return json({ error: 'INTERNAL_ERROR' }, 500, origin)
  }
})
