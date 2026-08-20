import { createClient } from 'npm:@supabase/supabase-js@2.95.0'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const raw = Deno.env.get('SUPABASE_SECRET_KEYS')
const legacy = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
const serviceKey = raw ? JSON.parse(raw).default : legacy
if (!serviceKey) throw new Error('Missing Supabase service key')
const db = createClient(SUPABASE_URL, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
const BUCKET = 'vivace-discovery-private'
const WORKER_KEY_SHA256 = 'd6e36b7fd4aa4fb2021e49a73e85e186ba1e0f1bcfd89153f5ac8224e7863255'
const MAX_ROWS = 20

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

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

async function authorized(req: Request) {
  const token = req.headers.get('x-vivace-worker') || ''
  return token.length >= 40 && (await sha256Hex(token)) === WORKER_KEY_SHA256
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json({ error: 'METHOD_NOT_ALLOWED' }, 405)
  if (!(await authorized(req))) return json({ error: 'UNAUTHORIZED' }, 403)

  const now = new Date()
  const cutoffUploading = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString()
  const cutoffFailed = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const revokedSessionCutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString()
  const deleted: any[] = []
  const errors: any[] = []

  try {
    const { data: rows, error } = await db
      .from('vivace_discovery_submissions')
      .select('id,status,created_at')
      .or(`and(status.eq.uploading,created_at.lt.${cutoffUploading}),and(status.eq.failed,created_at.lt.${cutoffFailed})`)
      .order('created_at', { ascending: true })
      .limit(MAX_ROWS)
    if (error) throw error

    for (const row of rows || []) {
      const id = String(row.id)
      try {
        const { data: files, error: listError } = await db.storage.from(BUCKET).list(id, { limit: 100 })
        if (listError) throw listError
        const paths = (files || [])
          .filter((file: any) => file?.name && !file.name.endsWith('/'))
          .map((file: any) => `${id}/${file.name}`)
        if (paths.length) {
          const { error: removeError } = await db.storage.from(BUCKET).remove(paths)
          if (removeError) throw removeError
        }
        const { error: deleteError } = await db.from('vivace_discovery_submissions').delete().eq('id', id)
        if (deleteError) throw deleteError
        deleted.push({ id, status: row.status, objects: paths.length })
      } catch (error) {
        errors.push({ id, detail: error instanceof Error ? error.message : String(error) })
      }
    }

    await db.from('vivace_request_rate_limits').delete().lt(
      'window_start',
      new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    )

    const expiredSessions = await db.from('vivace_admin_sessions').delete().lt('expires_at', now.toISOString()).select('id')
    if (expiredSessions.error) throw expiredSessions.error
    const revokedSessions = await db.from('vivace_admin_sessions').delete().lt('revoked_at', revokedSessionCutoff).select('id')
    if (revokedSessions.error) throw revokedSessions.error

    return json({
      ok: errors.length === 0,
      deleted,
      errors,
      checked: (rows || []).length,
      adminSessionsCleaned: (expiredSessions.data?.length || 0) + (revokedSessions.data?.length || 0),
    }, errors.length ? 207 : 200)
  } catch (error) {
    return json({ error: 'MAINTENANCE_FAILED', detail: error instanceof Error ? error.message : String(error) }, 500)
  }
})
