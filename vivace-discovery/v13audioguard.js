(()=>{'use strict';
const AUDIO_DB='vivace-owner-discovery-audio-v1',AUDIO_STORE='recordings';
const APPROVED='vivaceAudioGuardApproved';
const $=(s,r=document)=>r.querySelector(s);
function status(msg,bad=false){const el=$('#v9Status');if(el){el.textContent=msg;el.style.color=bad?'#ffd8cc':''}}
function toast(msg){let n=$('#v13AudioToast');if(!n){n=document.createElement('div');n.id='v13AudioToast';Object.assign(n.style,{position:'fixed',left:'16px',right:'16px',bottom:'18px',zIndex:'100000',padding:'14px 18px',borderRadius:'14px',background:'#8b2f25',color:'#fff',font:'600 14px Arial',textAlign:'center',boxShadow:'0 10px 35px #0005'});document.body.appendChild(n)}n.textContent=msg;n.style.display='block';clearTimeout(n._t);n._t=setTimeout(()=>n.style.display='none',6500)}
async function getRecordings(){return new Promise(resolve=>{try{const req=indexedDB.open(AUDIO_DB,1);req.onerror=()=>resolve([]);req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains(AUDIO_STORE))req.result.createObjectStore(AUDIO_STORE,{keyPath:'questionId'})};req.onsuccess=()=>{const db=req.result;try{const tx=db.transaction(AUDIO_STORE,'readonly'),r=tx.objectStore(AUDIO_STORE).getAll();r.onsuccess=()=>{db.close();resolve(r.result||[])};r.onerror=()=>{db.close();resolve([])}}catch{db.close();resolve([])}}}catch{resolve([])}})}
async function audioDuration(blob){return await new Promise(resolve=>{let done=false,url='';const finish=v=>{if(done)return;done=true;try{URL.revokeObjectURL(url)}catch{}resolve(Number.isFinite(v)&&v>0?v:0)};try{const a=document.createElement('audio');url=URL.createObjectURL(blob);a.preload='metadata';a.onloadedmetadata=()=>finish(Number(a.duration)||0);a.onerror=()=>finish(0);a.src=url;setTimeout(()=>finish(0),5000)}catch{finish(0)}})}
const db=x=>20*Math.log10(Math.max(Number(x)||0,1e-12));
async function analyze(blob){
 const duration=await audioDuration(blob),size=Number(blob?.size||0),bps=duration>0?size/duration:0;
 let rmsDb=null,peakDb=null,decoded=false;
 const AudioCtx=window.AudioContext||window.webkitAudioContext;
 if(AudioCtx){let ctx;try{ctx=new AudioCtx();const buffer=await ctx.decodeAudioData((await blob.arrayBuffer()).slice(0));let sum=0,count=0,peak=0,total=0;for(let ch=0;ch<buffer.numberOfChannels;ch++)total+=buffer.getChannelData(ch).length;const stride=Math.max(1,Math.floor(total/250000));for(let ch=0;ch<buffer.numberOfChannels;ch++){const data=buffer.getChannelData(ch);for(let i=0;i<data.length;i+=stride){const v=data[i],a=Math.abs(v);if(a>peak)peak=a;sum+=v*v;count++}}if(count){rmsDb=db(Math.sqrt(sum/count));peakDb=db(peak);decoded=true}}catch(e){console.warn('Vivace audio signal decode unavailable',e)}finally{try{await ctx?.close()}catch{}}}
 const nearSilentSignal=decoded&&peakDb!==null&&peakDb<-40&&rmsDb!==null&&rmsDb<-60;
 const nearSilentVbr=duration>=2&&bps>0&&bps<1200;
 const tooShort=duration>0&&duration<0.35;
 return {usable:!(nearSilentSignal||nearSilentVbr||tooShort),durationMs:Math.round(duration*1000),bytesPerSecond:Math.round(bps),rmsDb:rmsDb===null?null:Number(rmsDb.toFixed(1)),peakDb:peakDb===null?null:Number(peakDb.toFixed(1)),decoded,reason:nearSilentSignal?'near_silence_signal':nearSilentVbr?'near_silence_bitrate':tooShort?'too_short':null};
}
function scrollToQuestion(qid){const cards=Array.from(document.querySelectorAll('.interactive-question,[data-question-id]'));const card=document.querySelector(`[data-question-id="${qid}"]`)||document.querySelector(`#question-${qid}`)||cards[qid-1];try{card?.scrollIntoView({behavior:'smooth',block:'center'})}catch{}}
async function validate(btn){
 const recordings=await getRecordings();
 for(let i=0;i<recordings.length;i++){
  const rec=recordings[i],qid=Number(rec?.questionId||0);status(`בודק איכות הקלטה ${i+1} מתוך ${recordings.length}…`);
  if(!rec?.blob){return {ok:false,qid,reason:'missing_blob'}}
  const q=await analyze(rec.blob);
  console.info('Vivace audio guard',{questionId:qid,...q});
  if(!q.usable)return {ok:false,qid,reason:q.reason,quality:q};
 }
 return {ok:true};
}
window.__vivaceAnalyzeAudio=analyze;
window.__vivaceGetLocalRecordings=getRecordings;
document.addEventListener('click',e=>{
 const btn=e.target?.closest?.('#v9Send');if(!btn)return;
 if(btn.dataset[APPROVED]==='1'){delete btn.dataset[APPROVED];return}
 e.preventDefault();e.stopImmediatePropagation();
 if(btn.dataset.vivaceAudioChecking==='1')return;
 btn.dataset.vivaceAudioChecking='1';
 const old=btn.textContent;btn.disabled=true;btn.textContent='בודק הקלטות…';
 void validate(btn).then(result=>{
  if(!result.ok){const q=result.qid||'?';const msg=`ההקלטה בשאלה ${q} לא נקלטה עם קול ברור. יש להקליט אותה מחדש לפני השליחה.`;status(msg,true);toast(msg);scrollToQuestion(Number(result.qid||0));btn.disabled=false;btn.textContent=old;return}
  status('✓ איכות ההקלטות נבדקה. שולח…');btn.disabled=false;btn.textContent=old;btn.dataset[APPROVED]='1';btn.click();
 }).catch(err=>{console.error('Vivace audio guard failed',err);const msg='לא הצלחנו לבדוק את תקינות ההקלטות. כדי למנוע תמלול שגוי, השליחה נעצרה. נסה לרענן ולשלוח שוב.';status(msg,true);toast(msg);btn.disabled=false;btn.textContent=old}).finally(()=>{delete btn.dataset.vivaceAudioChecking})
},true);
})();
