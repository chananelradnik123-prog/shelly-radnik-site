import { createClient } from 'npm:@supabase/supabase-js@2.95.0'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const secretKeysRaw = Deno.env.get('SUPABASE_SECRET_KEYS')
const legacyServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
const secretKey = secretKeysRaw ? JSON.parse(secretKeysRaw).default : legacyServiceKey
if (!secretKey) throw new Error('Missing Supabase secret key')
const db = createClient(SUPABASE_URL, secretKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const ADMIN_KEY_SHA256 = '3ae6b6af1b5000be920bd67a59a5b668bd08bf66db2dafe9980761650b870642'
const BUCKET = 'vivace-discovery-private'
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
    : 'https://eadljasmuqnzcrfudsib.supabase.co'
  return {
    'Access-Control-Allow-Origin': allowed,
    'Vary': 'Origin',
    'Access-Control-Allow-Headers': 'content-type, x-vivace-admin-key',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Cache-Control': 'no-store, max-age=0',
    'X-Content-Type-Options': 'nosniff',
  }
}

function json(body: unknown, status: number, origin: string | null) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors(origin), 'Content-Type': 'application/json; charset=utf-8' },
  })
}

function clean(value: unknown, max = 20000) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max)
}

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

async function isAdmin(req: Request) {
  const key = req.headers.get('x-vivace-admin-key') || ''
  return key.length >= 12 && (await sha256Hex(key)) === ADMIN_KEY_SHA256
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
    console.error('ADMIN_RATE_LIMIT_FAILED', error.message)
    return false
  }
  return data === true
}

function transcriptMap(input: unknown) {
  const map = new Map<number, any>()
  if (!Array.isArray(input)) return map
  for (const item of input) {
    const questionId = Number(item?.questionId || 0)
    const text = clean(item?.text)
    if (!Number.isInteger(questionId) || questionId < 1 || questionId > 50 || !text) continue
    map.set(questionId, {
      questionId,
      text,
      language: clean(item?.language || 'he', 20),
      source: clean(item?.source || 'manual:admin', 100),
      updatedAt: new Date().toISOString(),
    })
  }
  return map
}

const ADMIN_HTML = `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Vivace OS — ניהול Discovery</title><style>
:root{--g:#14392D;--g2:#0e2b22;--gold:#d6b36c;--rust:#b85f3e;--cream:#f7f3eb;--ink:#17231e;--muted:#68756f;--bad:#9b2e21;--warn:#8a5a10}*{box-sizing:border-box}body{margin:0;background:linear-gradient(180deg,var(--g2),var(--g));font-family:Arial,sans-serif;color:var(--ink);min-height:100vh}.wrap{max-width:980px;margin:auto;padding:18px}.head{color:#fff;padding:12px 4px 20px}.head h1{margin:0 0 6px;font-size:25px}.head p{margin:0;opacity:.75}.card{background:var(--cream);border-radius:20px;padding:18px;margin-bottom:14px;box-shadow:0 12px 30px #0003}.login{max-width:520px;margin:40px auto}.input{width:100%;padding:14px;border:1px solid #d7d7d1;border-radius:12px;font-size:16px;margin:10px 0}.btn{border:0;border-radius:999px;background:var(--rust);color:#fff;padding:12px 18px;font-weight:800;cursor:pointer}.btn:disabled{opacity:.55;cursor:default}.btn.secondary{background:var(--g)}.btn.small{padding:9px 13px;font-size:13px}.row{display:flex;gap:10px;align-items:center;justify-content:space-between;flex-wrap:wrap}.pill{display:inline-block;padding:5px 9px;border-radius:999px;background:#e8efe9;color:var(--g);font-size:12px;font-weight:700}.pill.warn{background:#fff1d2;color:var(--warn)}.pill.bad{background:#f8ded8;color:var(--bad)}.muted{color:var(--muted);font-size:13px}.submission{cursor:pointer;border:1px solid #dedbd3}.submission:hover{border-color:var(--gold)}.q{padding:13px 0;border-bottom:1px solid #e2ddd4}.q:last-child{border-bottom:0}.qtitle{font-weight:800;margin-bottom:6px}.ans{white-space:pre-wrap;line-height:1.55}.audio{background:#fff;border:1px solid #e1ddd5;border-radius:14px;padding:12px;margin-top:10px}audio{width:100%;margin-top:8px}.trans{background:#eef3ef;border-radius:10px;padding:10px;margin-top:8px;line-height:1.55;white-space:pre-wrap}.empty{padding:30px;text-align:center;color:var(--muted)}.back{margin-bottom:12px}.error{color:var(--bad);font-weight:700;margin-top:10px}.notice{background:#fff1d2;border-radius:12px;padding:11px;margin-top:10px;line-height:1.5}.stats{display:flex;gap:8px;flex-wrap:wrap;margin-top:8px}@media(max-width:600px){.wrap{padding:12px}.card{border-radius:16px;padding:14px}.head h1{font-size:22px}}</style></head><body><div class="wrap"><div class="head"><h1>Vivace OS — Discovery</h1><p>מסך ניהול פרטי לתשובות, הקלטות ותמלולים</p></div><div id="app"></div></div><script>
const ENDPOINT=location.href.split('?')[0];const app=document.getElementById('app');let key=sessionStorage.getItem('vivace_admin_key')||'';
async function api(body){const r=await fetch(ENDPOINT,{method:'POST',headers:{'content-type':'application/json','x-vivace-admin-key':key},body:JSON.stringify(body)});const j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(j.error||('HTTP '+r.status));return j}
function esc(s){return String(s??'').replace(/[&<>\"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]))}
function fmtDate(s){try{return new Date(s).toLocaleString('he-IL',{dateStyle:'short',timeStyle:'short'})}catch{return s||''}}
function txStatus(s){return s==='complete'?'תמלול הושלם':s==='partial'?'תמלול חלקי':s==='failed'?'תמלול נכשל':s==='pending'?'ממתין לתמלול':'אין צורך בתמלול'}
function txClass(s){return s==='complete'?'':s==='pending'?'warn':'bad'}
function login(msg=''){app.innerHTML='<div class="card login"><h2>כניסה לניהול</h2><p class="muted">המידע וההקלטות פרטיים. המפתח נשמר רק עד סגירת לשונית הדפדפן.</p><input id="k" class="input" type="password" autocomplete="current-password" placeholder="מפתח ניהול"><button id="go" class="btn">כניסה</button><div class="error">'+esc(msg)+'</div></div>';document.getElementById('k').value=key;document.getElementById('go').onclick=async()=>{key=document.getElementById('k').value.trim();try{await api({action:'list',limit:1});sessionStorage.setItem('vivace_admin_key',key);showList()}catch(e){login(e.message==='RATE_LIMITED'?'יותר מדי ניסיונות. נסה שוב מאוחר יותר.':'מפתח לא תקין')}}}
async function showList(){app.innerHTML='<div class="card">טוען שליחות…</div>';try{const {submissions}=await api({action:'list',limit:30});if(!submissions.length){app.innerHTML='<div class="card empty">עדיין אין שליחות.</div>';return}app.innerHTML=submissions.map(s=>'<div class="card submission" data-id="'+esc(s.id)+'"><div class="row"><div><b>'+fmtDate(s.completed_at||s.created_at)+'</b><div class="muted">'+esc(s.id.slice(0,8))+'…</div></div><span class="pill">'+(s.status==='complete'?'הושלם':'בתהליך')+'</span></div><div class="stats"><span class="pill">'+s.answered_count+' תשובות</span><span class="pill">'+s.uploaded_recordings+' הקלטות</span><span class="pill">'+((s.transcripts||[]).length)+' תמלולים</span><span class="pill '+txClass(s.transcription_status)+'">'+txStatus(s.transcription_status)+'</span></div></div>').join('');document.querySelectorAll('.submission').forEach(x=>x.onclick=()=>showDetail(x.dataset.id))}catch(e){if(String(e.message).includes('UNAUTHORIZED')){key='';sessionStorage.removeItem('vivace_admin_key');login('יש להתחבר מחדש')}else app.innerHTML='<div class="card error">שגיאה בטעינה: '+esc(e.message)+'</div>'}}
function answersOf(q){const a=Array.isArray(q.answers)?q.answers:[];return a.map(x=>x.name?'<b>'+esc(x.name)+':</b> '+esc(x.value):esc(x.value)).join('<br>')||'<span class="muted">ללא תשובה כתובה</span>'}
async function retry(id,btn){const old=btn.textContent;btn.disabled=true;btn.textContent='מכניס לתור…';try{await api({action:'retry_transcription',id});btn.textContent='נכנס לתור ✓';setTimeout(()=>showDetail(id),1800)}catch(e){btn.disabled=false;btn.textContent=old;alert('לא ניתן להפעיל תמלול מחדש: '+e.message)}}
async function showDetail(id){app.innerHTML='<div class="card">טוען שליחה…</div>';try{const {submission:s,recordings}=await api({action:'detail',id});const trans=new Map((s.transcripts||[]).map(t=>[Number(t.questionId),t.text]));const recMap=new Map(recordings.map(r=>[Number(r.questionId),r]));let qs=(s.answers||[]).map(q=>{const n=Number(q.number||0),r=recMap.get(n),t=trans.get(n);return '<div class="q"><div class="qtitle">'+esc(n+'. '+(q.question||('שאלה '+n)))+'</div><div class="ans">'+answersOf(q)+'</div>'+(r?'<div class="audio"><b>הקלטה</b><div class="muted">'+Math.round((r.size||0)/1024)+' KB</div>'+(r.signedUrl?'<audio controls preload="none" src="'+esc(r.signedUrl)+'"></audio>':'<div class="error">לא ניתן לטעון את ההקלטה</div>')+(t?'<div class="trans"><b>תמלול:</b><br>'+esc(t)+'</div>':'<div class="muted" style="margin-top:8px">התמלול עדיין לא נוסף.</div>')+'</div>':'')+'</div>'}).join('');const needs=(s.uploaded_recordings||0)>(s.transcripts||[]).length;const err=s.transcription_last_error?'<div class="notice"><b>שגיאת תמלול אחרונה:</b><br>'+esc(s.transcription_last_error)+'</div>':'';const retryBtn=needs?'<button id="retryTx" class="btn small" type="button">נסה תמלול מחדש</button>':'';app.innerHTML='<button class="btn secondary back" id="back">חזרה לכל השליחות</button><div class="card"><div class="row"><div><h2 style="margin:0">שליחה '+esc(id.slice(0,8))+'…</h2><div class="muted">'+fmtDate(s.completed_at||s.created_at)+'</div></div><span class="pill">'+(s.status==='complete'?'הושלם':'בתהליך')+'</span></div><div class="stats"><span class="pill">'+s.answered_count+' תשובות</span><span class="pill">'+s.uploaded_recordings+' הקלטות</span><span class="pill">'+(s.transcripts||[]).length+' תמלולים</span><span class="pill '+txClass(s.transcription_status)+'">'+txStatus(s.transcription_status)+'</span></div>'+err+'<div style="margin-top:12px">'+retryBtn+'</div></div><div class="card">'+(qs||'<div class="empty">אין נתונים להצגה</div>')+'</div>';document.getElementById('back').onclick=showList;const rb=document.getElementById('retryTx');if(rb)rb.onclick=()=>retry(id,rb)}catch(e){app.innerHTML='<button class="btn secondary back" onclick="location.reload()">חזרה</button><div class="card error">שגיאה: '+esc(e.message)+'</div>'}}
if(key){showList()}else login();
</script></body></html>`

Deno.serve(async (req: Request) => {
  const origin = req.headers.get('origin')
  if (req.method === 'GET') {
    return new Response(ADMIN_HTML, {
      status: 200,
      headers: { ...cors(origin), 'Content-Type': 'text/html; charset=utf-8' },
    })
  }
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors(origin) })
  if (req.method !== 'POST') return json({ error: 'METHOD_NOT_ALLOWED' }, 405, origin)
  if (origin && !ALLOWED_ORIGINS.has(origin)) return json({ error: 'ORIGIN_NOT_ALLOWED' }, 403, origin)

  if (!(await isAdmin(req))) {
    const allowed = await consumeFailedAuthLimit(req)
    return json({ error: allowed ? 'UNAUTHORIZED' : 'RATE_LIMITED' }, allowed ? 401 : 429, origin)
  }

  try {
    const body = await req.json().catch(() => ({}))
    const action = String(body?.action || 'list')

    if (action === 'list') {
      const limit = Math.max(1, Math.min(50, Number(body?.limit || 20)))
      const { data, error } = await db
        .from('vivace_discovery_submissions')
        .select('id,created_at,completed_at,status,answered_count,question_count,expected_recordings,uploaded_recordings,transcripts,transcription_status,transcription_provider,transcription_updated_at,transcription_last_error')
        .order('created_at', { ascending: false })
        .limit(limit)
      if (error) throw error
      return json({ ok: true, submissions: data || [] }, 200, origin)
    }

    if (action === 'detail') {
      const id = String(body?.id || '')
      if (!/^[0-9a-f-]{36}$/i.test(id)) return json({ error: 'INVALID_ID' }, 400, origin)
      const { data: row, error } = await db
        .from('vivace_discovery_submissions')
        .select('*')
        .eq('id', id)
        .single()
      if (error || !row) return json({ error: 'NOT_FOUND' }, 404, origin)

      const recordings = []
      for (const rec of Array.isArray(row.recording_manifest) ? row.recording_manifest : []) {
        const questionId = Number(rec?.questionId || 0)
        const ext = String(rec?.ext || 'webm').replace(/[^a-z0-9]/gi, '') || 'webm'
        const path = `${id}/Q${String(questionId).padStart(2, '0')}.${ext}`
        const { data: signed, error: signError } = await db.storage
          .from(BUCKET)
          .createSignedUrl(path, 60 * 15)
        recordings.push({
          questionId,
          mimeType: rec?.mimeType || '',
          size: Number(rec?.size || 0),
          path,
          signedUrl: signError ? null : signed?.signedUrl || null,
        })
      }
      return json({ ok: true, submission: row, recordings }, 200, origin)
    }

    if (action === 'retry_transcription') {
      const id = String(body?.id || '')
      if (!/^[0-9a-f-]{36}$/i.test(id)) return json({ error: 'INVALID_ID' }, 400, origin)
      const { data: row, error } = await db
        .from('vivace_discovery_submissions')
        .select('status,uploaded_recordings')
        .eq('id', id)
        .single()
      if (error || !row) return json({ error: 'NOT_FOUND' }, 404, origin)
      if (row.status !== 'complete') return json({ error: 'SUBMISSION_NOT_COMPLETE' }, 409, origin)

      const { error: updateError } = await db
        .from('vivace_discovery_submissions')
        .update({
          transcription_status: Number(row.uploaded_recordings || 0) > 0 ? 'pending' : 'not_required',
          transcription_attempts: 0,
          transcription_lock_until: null,
          transcription_next_retry_at: new Date().toISOString(),
          transcription_last_error: null,
          transcription_updated_at: new Date().toISOString(),
        })
        .eq('id', id)
      if (updateError) throw updateError
      return json({ ok: true, queued: true }, 200, origin)
    }

    if (action === 'save_transcripts') {
      const id = String(body?.id || '')
      if (!/^[0-9a-f-]{36}$/i.test(id)) return json({ error: 'INVALID_ID' }, 400, origin)
      const { data: row, error: rowError } = await db
        .from('vivace_discovery_submissions')
        .select('recording_manifest')
        .eq('id', id)
        .single()
      if (rowError || !row) return json({ error: 'NOT_FOUND' }, 404, origin)

      const map = transcriptMap(body?.transcripts)
      const manifest = Array.isArray(row.recording_manifest) ? row.recording_manifest : []
      const validIds = new Set(manifest.map((rec: any) => Number(rec?.questionId || 0)))
      const transcripts = [...map.values()].filter((item) => validIds.has(item.questionId))
        .sort((a, b) => a.questionId - b.questionId)
      const status = manifest.length === 0
        ? 'not_required'
        : transcripts.length >= manifest.length
        ? 'complete'
        : transcripts.length > 0
        ? 'partial'
        : 'pending'

      const { error } = await db
        .from('vivace_discovery_submissions')
        .update({
          transcripts,
          transcription_status: status,
          transcription_provider: 'manual:admin',
          transcription_updated_at: new Date().toISOString(),
          transcription_last_error: null,
          transcription_next_retry_at: status === 'complete' ? null : new Date().toISOString(),
        })
        .eq('id', id)
      if (error) throw error
      return json({ ok: true, saved: transcripts.length, transcriptionStatus: status }, 200, origin)
    }

    if (action === 'save_analysis') {
      const id = String(body?.id || '')
      if (!/^[0-9a-f-]{36}$/i.test(id)) return json({ error: 'INVALID_ID' }, 400, origin)
      const patch = body?.analysis && typeof body.analysis === 'object' && !Array.isArray(body.analysis)
        ? body.analysis
        : {}
      const { data: row, error: rowError } = await db
        .from('vivace_discovery_submissions')
        .select('analysis')
        .eq('id', id)
        .single()
      if (rowError || !row) return json({ error: 'NOT_FOUND' }, 404, origin)
      const base = row.analysis && typeof row.analysis === 'object' && !Array.isArray(row.analysis)
        ? row.analysis
        : {}
      const { error } = await db
        .from('vivace_discovery_submissions')
        .update({ analysis: { ...base, ...patch } })
        .eq('id', id)
      if (error) throw error
      return json({ ok: true }, 200, origin)
    }

    return json({ error: 'UNKNOWN_ACTION' }, 400, origin)
  } catch (error) {
    console.error('VIVACE_ADMIN_ERROR', error)
    return json({ error: 'INTERNAL_ERROR' }, 500, origin)
  }
})
