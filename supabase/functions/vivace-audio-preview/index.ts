import { createClient } from 'npm:@supabase/supabase-js@2.95.0'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const raw = Deno.env.get('SUPABASE_SECRET_KEYS')
const legacy = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
const serviceKey = raw ? JSON.parse(raw).default : legacy
const geminiKey = Deno.env.get('GEMINI_API_KEY') || Deno.env.get('GOOGLE_API_KEY')
if (!serviceKey) throw new Error('Missing Supabase secret key')
const db = createClient(SUPABASE_URL, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })

const FORM_HEADER = 'owner-discovery-v1'
const PRIMARY_MODEL = 'gemini-3.6-flash'
const FALLBACK_MODEL = 'gemini-3.5-flash'
const MAX_AUDIO_BYTES = 18 * 1024 * 1024
const ALLOWED_ORIGINS = new Set([
  'https://chananelradnik123-prog.github.io',
  'http://localhost:3000','http://localhost:5173','http://127.0.0.1:5173',
])
const TRANSIENT = new Set([429,500,502,503,504])

function cors(origin: string | null) {
  const allowed = origin && ALLOWED_ORIGINS.has(origin) ? origin : 'https://chananelradnik123-prog.github.io'
  return {
    'Access-Control-Allow-Origin': allowed,
    'Vary': 'Origin',
    'Access-Control-Allow-Headers': 'content-type, x-vivace-form',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store, max-age=0',
    'X-Content-Type-Options': 'nosniff',
  }
}
function json(body: unknown, status: number, origin: string | null) { return new Response(JSON.stringify(body), { status, headers: cors(origin) }) }
function clean(value: unknown, max = 20000) { return String(value || '').replace(/\s+/g,' ').trim().slice(0,max) }
async function sha256Hex(value: string) { const d=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));return [...new Uint8Array(d)].map(b=>b.toString(16).padStart(2,'0')).join('') }
function clientAddress(req: Request) { return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('cf-connecting-ip') || req.headers.get('x-real-ip') || 'unknown' }
async function rateAllowed(req: Request) {
  const key = await sha256Hex(`${clientAddress(req)}|${(req.headers.get('user-agent')||'').slice(0,180)}`)
  const { data, error } = await db.rpc('vivace_consume_rate_limit',{ p_scope:'audio_preview', p_key_hash:key, p_limit:120, p_window_seconds:3600 })
  if (error) throw error
  return data === true
}
async function inviteAllowed(token: string) {
  if (token.length < 40 || token.length > 256) return false
  const tokenHash=await sha256Hex(token),now=new Date().toISOString()
  const { data, error } = await db.from('vivace_discovery_invites').select('id,max_uses,use_count,expires_at,disabled_at').eq('token_hash',tokenHash).maybeSingle()
  if (error || !data || data.disabled_at) return false
  if (data.expires_at && String(data.expires_at) <= now) return false
  return Number(data.use_count||0) < Number(data.max_uses||0)
}
async function toBase64(blob: Blob) {
  const bytes=new Uint8Array(await blob.arrayBuffer());let binary=''
  for(let i=0;i<bytes.length;i+=0x8000) binary+=String.fromCharCode(...bytes.subarray(i,i+0x8000))
  return btoa(binary)
}
function mimeForGemini(mime: string) { const m=String(mime||'audio/webm').split(';')[0].toLowerCase();return m==='audio/webm'?'video/webm':m }
function parseQuality(raw: FormDataEntryValue | null) { try { return JSON.parse(String(raw||'{}')) || {} } catch { return {} } }
function clearlyUnusable(q: any) {
  if (q?.usable === false) return true
  const rms=Number(q?.rmsDb),peak=Number(q?.peakDb),duration=Number(q?.durationMs),bps=Number(q?.bytesPerSecond)
  if (Number.isFinite(rms)&&Number.isFinite(peak)&&rms < -60 && peak < -40) return true
  if (Number.isFinite(duration)&&duration >= 2000&&Number.isFinite(bps)&&bps > 0&&bps < 1200) return true
  return Number.isFinite(duration)&&duration > 0&&duration < 350
}
async function geminiTranscript(audio: Blob, mimeType: string) {
  if (!geminiKey) throw new Error('GEMINI_NOT_CONFIGURED')
  const payload={
    contents:[{parts:[
      {text:'You are a strict speech transcription service. Listen only to the supplied audio. Return ONLY valid JSON in this exact shape: {"status":"ok"|"unclear","transcript":"..."}. Use status "ok" only when you can clearly hear spoken words. If the audio is silent, nearly silent, corrupted, unintelligible, or you are not confident that actual speech is present, return {"status":"unclear","transcript":""}. Never invent, autocomplete, translate, infer, or guess words. Preserve the original spoken language.'},
      {inline_data:{mime_type:mimeType,data:await toBase64(audio)}}
    ]}],
    generationConfig:{maxOutputTokens:2048,responseMimeType:'application/json'},
  }
  let last=''
  for(const model of [PRIMARY_MODEL,FALLBACK_MODEL]){
    for(let attempt=0;attempt<2;attempt++){
      const r=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,{method:'POST',headers:{'content-type':'application/json','x-goog-api-key':geminiKey},body:JSON.stringify(payload)})
      const raw=await r.text();last=raw
      if(r.ok){
        let outer:any={};try{outer=JSON.parse(raw)}catch{}
        const text=clean((outer?.candidates?.[0]?.content?.parts||[]).map((p:any)=>p?.text||'').join(' '),10000)
        let parsed:any={};try{parsed=JSON.parse(text)}catch{}
        const status=parsed?.status==='ok'?'ok':'unclear',transcript=status==='ok'?clean(parsed?.transcript,10000):''
        if(status==='ok'&&transcript) return {status,transcript,model}
        return {status:'unclear',transcript:'',model}
      }
      if(!TRANSIENT.has(r.status)||attempt===1) break
      await new Promise(res=>setTimeout(res,900+attempt*1600))
    }
  }
  throw new Error(`GEMINI_PREVIEW_FAILED:${clean(last,200)}`)
}

Deno.serve(async (req: Request) => {
  const origin=req.headers.get('origin')
  if(req.method==='OPTIONS') return new Response('ok',{headers:cors(origin)})
  if(req.method!=='POST') return json({error:'METHOD_NOT_ALLOWED'},405,origin)
  if(!origin||!ALLOWED_ORIGINS.has(origin)) return json({error:'ORIGIN_NOT_ALLOWED'},403,origin)
  if(req.headers.get('x-vivace-form')!==FORM_HEADER) return json({error:'INVALID_FORM'},403,origin)
  try{
    if(!(await rateAllowed(req))) return json({error:'RATE_LIMITED'},429,origin)
    const form=await req.formData(),invite=clean(form.get('invite'),300),questionId=Number(form.get('questionId')||0)
    if(!Number.isInteger(questionId)||questionId<1||questionId>50) return json({error:'INVALID_QUESTION'},400,origin)
    if(!(await inviteAllowed(invite))) return json({error:'INVITE_REQUIRED_OR_INVALID'},403,origin)
    const audio=form.get('audio')
    if(!(audio instanceof File)||audio.size<=0||audio.size>MAX_AUDIO_BYTES) return json({error:'INVALID_AUDIO'},400,origin)
    const quality=parseQuality(form.get('quality'))
    if(clearlyUnusable(quality)) return json({ok:true,status:'unclear',transcript:'',source:null,questionId,qualityRejected:true},200,origin)
    const result=await geminiTranscript(audio,mimeForGemini(audio.type))
    return json({ok:true,status:result.status,transcript:result.transcript,source:`gemini:${result.model}`,questionId},200,origin)
  }catch(error){
    console.error('VIVACE_AUDIO_PREVIEW_FAILED',error)
    return json({error:'PREVIEW_TEMPORARILY_UNAVAILABLE'},503,origin)
  }
})
