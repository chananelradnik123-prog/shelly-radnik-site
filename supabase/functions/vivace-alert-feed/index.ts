import { createClient } from 'npm:@supabase/supabase-js@2.95.0'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const raw = Deno.env.get('SUPABASE_SECRET_KEYS')
const legacy = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
const serviceKey = raw ? JSON.parse(raw).default : legacy
if (!serviceKey) throw new Error('Missing Supabase service key')
const db = createClient(SUPABASE_URL, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })

// Raw feed tokens are never committed. Only this SHA-256 hash is stored in source.
const FEED_TOKEN_SHA256 = 'd8e9bac839d7688f83740af9b06708f68ab1d40b2c663279f715e16f927a3dfd'

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store, max-age=0',
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'no-referrer',
    },
  })
}

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'GET' && req.method !== 'POST') return json({ error: 'METHOD_NOT_ALLOWED' }, 405)

  const url = new URL(req.url)
  const token = req.headers.get('x-vivace-alert-token') || url.searchParams.get('token') || ''
  if (token.length < 40 || (await sha256Hex(token)) !== FEED_TOKEN_SHA256) {
    return json({ error: 'UNAUTHORIZED' }, 403)
  }

  try {
    const { data, error } = await db.rpc('vivace_claim_operational_alerts', { p_limit: 20 })
    if (error) throw error

    const alerts = (data || []).map((item: any) => ({
      severity: item.severity,
      category: item.category,
      code: item.code,
      title: item.title,
      detail: item.detail,
      firstSeenAt: item.first_seen_at,
      occurrenceCount: item.occurrence_count,
    }))

    return json({ ok: true, checkedAt: new Date().toISOString(), alerts })
  } catch (error) {
    console.error('VIVACE_ALERT_FEED_ERROR', { detail: error instanceof Error ? error.message : String(error) })
    return json({ error: 'ALERT_FEED_FAILED' }, 500)
  }
})
