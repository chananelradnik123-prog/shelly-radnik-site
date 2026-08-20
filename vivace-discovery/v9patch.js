(()=>{'use strict';
const API_URL='https://eadljasmuqnzcrfudsib.supabase.co/functions/v1/vivace-discovery-submit';
const FORM_HEADER='owner-discovery-v1';
const AUDIO_DB='vivace-owner-discovery-audio-v1',AUDIO_STORE='recordings';
const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>Array.from(r.querySelectorAll(s));
const wait=ms=>new Promise(r=>setTimeout(r,ms));
function text(el){return (el?.textContent||'').replace(/\s+/g,' ').trim()}
function toast(msg,ok=true){let n=$('#v9toast');if(!n){n=document.createElement('div');n.id='v9toast';Object.assign(n.style,{position:'fixed',left:'16px',right:'16px',bottom:'18px',zIndex:'99999',padding:'14px 18px',borderRadius:'14px',font:'600 14px Arial',textAlign:'center',boxShadow:'0 10px 35px #0005',transition:'opacity .2s'});document.body.appendChild(n)}n.style.background=ok?'#14392D':'#8b2f25';n.style.color='#fff';n.textContent=msg;n.style.opacity='1';clearTimeout(n._t);n._t=setTimeout(()=>n.style.opacity='0',5000)}
function removeOldSubmit(){
  $$('#finalSubmitCard,#shareResult,.share-result,.submit-card,#v6SubmitCard,#v8FinalSubmit').forEach(x=>x.remove());
  $$('button,a').forEach(el=>{const t=text(el);if(/^(שלח( את)? השאלון|הורד גיבוי תשובות|שתף ל.?WhatsApp|פתח WhatsApp|הכן חבילה לשליחה|נסה לשלוח שוב)/.test(t)&&!el.closest('#v9FinalSubmit')){const p=el.closest('.actions,.no-print,.submit-wrap,.share-wrap,.fixed');(p||el).remove()}})
}
function getCards(){const a=$$('.interactive-question');return a.length?a.slice(0,50):$$('[data-question-id]').slice(0,50)}
function cardData(card,i){
 const vals=[];
 $$('[data-field-id],input,textarea,select',card).forEach(el=>{if((el.type==='checkbox'||el.type==='radio')&&!el.checked)return;const v=el.value!==undefined?String(el.value):'';if(v.trim())vals.push({name:el.dataset?.fieldId||el.name||el.getAttribute('aria-label')||el.placeholder||'',value:v.trim()})});
 $$('.selected,[aria-checked="true"],.checked,.option-on,.marker-on',card).forEach(el=>{const v=text(el.closest('button,label,.cap-card,.choice,td')||el);if(v&&v.length<220&&!vals.some(x=>x.value===v))vals.push({name:'בחירה',value:v})});
 const q=card.dataset.questionTitle||text($('.qtitle,.question-title,.q-title,h2,h3',card))||`שאלה ${i+1}`;
 return {number:Number(card.dataset.questionId)||i+1,question:q,answers:vals};
}
async function getRecordings(){return new Promise(resolve=>{try{const req=indexedDB.open(AUDIO_DB,1);req.onerror=()=>resolve([]);req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains(AUDIO_STORE))req.result.createObjectStore(AUDIO_STORE,{keyPath:'questionId'})};req.onsuccess=()=>{const db=req.result;try{const tx=db.transaction(AUDIO_STORE,'readonly'),r=tx.objectStore(AUDIO_STORE).getAll();r.onsuccess=()=>{db.close();resolve(r.result||[])};r.onerror=()=>{db.close();resolve([])}}catch{db.close();resolve([])}}}catch{resolve([])}})}
async function api(body){
 const r=await fetch(API_URL,{method:'POST',headers:{'Content-Type':'application/json','x-vivace-form':FORM_HEADER},body:JSON.stringify(body)});
 let data={};try{data=await r.json()}catch{}
 if(!r.ok||!data.ok){const e=new Error(data.error||`HTTP_${r.status}`);e.status=r.status;e.data=data;throw e}
 return data;
}
async function uploadRecordingOnce(target,rec){
 if(!rec?.blob)throw new Error('MISSING_AUDIO_BLOB');
 const fd=new FormData();fd.append('cacheControl','3600');fd.append('',rec.blob);
 const r=await fetch(target.signedUrl,{method:'PUT',headers:{'x-upsert':'false'},body:fd});
 if(!r.ok){let detail='';try{detail=await r.text()}catch{}throw new Error(`AUDIO_UPLOAD_FAILED_${r.status}_${detail.slice(0,120)}`)}
}
async function uploadRecording(target,rec){
 let last;
 for(let attempt=0;attempt<3;attempt++){
  try{return await uploadRecordingOnce(target,rec)}catch(e){last=e;if(attempt<2)await wait([700,1800][attempt]+Math.floor(Math.random()*300))}
 }
 throw last||new Error('AUDIO_UPLOAD_FAILED');
}
function friendlyError(e){
 const code=String(e?.message||'');
 if(code.includes('SUBMISSION_ALREADY_COMPLETED'))return'השאלון כבר נשלח מהסשן הזה. אין צורך לשלוח אותו שוב.';
 if(code.includes('PRIVACY_ACK_REQUIRED'))return'כדי לשלוח יש לאשר שלא הוזן מידע אישי, סודי או רגיש.';
 if(code.includes('INVITE_REQUIRED')||code.includes('INVITE_EXPIRED')||code.includes('INVITE_ACCESS'))return'קישור ההזמנה חסר, פג תוקף או אינו תקף. בקש קישור חדש.';
 if(code.includes('CLIENT_SESSION_INVALID'))return'לא הצלחנו לזהות את סשן הטופס. פתח מחדש את קישור ההזמנה ונסה שוב.';
 if(code.includes('RATE_LIMITED'))return'בוצעו יותר מדי ניסיונות בזמן קצר. המתן כמה דקות ונסה שוב.';
 if(code.includes('RECORDING_SIZE_INVALID')||code.includes('SUBMISSION_TOO_LARGE'))return'אחת ההקלטות ארוכה או גדולה מדי. קצר אותה ונסה שוב.';
 if(code.includes('UPLOADS_INCOMPLETE_OR_INVALID'))return'אחת ההקלטות לא עלתה בשלמותה. כל המידע נשאר במכשיר; נסה שוב.';
 if(code.includes('SERVICE_TEMPORARILY_UNAVAILABLE'))return'השירות זמנית לא זמין. כל המידע נשאר במכשיר; נסה שוב בעוד כמה דקות.';
 return'לא הצלחנו להשלים את השליחה. כל המידע עדיין שמור במכשיר.';
}
async function sendAll(btn,status){
 btn.disabled=true;const old=btn.textContent;btn.textContent='שולח…';status.textContent='אוסף תשובות והקלטות…';
 try{
   const cards=getCards(),questions=cards.map(cardData),recordings=await getRecordings();
   const meta=recordings.map(r=>({questionId:Number(r.questionId),mimeType:r.mimeType||r.blob?.type||'audio/webm',size:r.blob?.size||0}));
   status.textContent='פותח שליחה מאובטחת…';
   const prepared=await api({action:'prepare',submittedAt:new Date().toISOString(),questions,recordings:meta});
   if(!prepared.submissionId||!prepared.submissionToken)throw new Error('PREPARE_RESPONSE_INVALID');
   for(let i=0;i<prepared.uploads.length;i++){
     const target=prepared.uploads[i],rec=recordings.find(r=>Number(r.questionId)===Number(target.questionId));
     status.textContent=`מעלה הקלטה ${i+1} מתוך ${prepared.uploads.length}…`;
     await uploadRecording(target,rec);
   }
   status.textContent='מאמת שהכול התקבל…';
   const done=await api({action:'finalize',submissionId:prepared.submissionId,submissionToken:prepared.submissionToken});
   status.textContent=done.transcriptionQueued?'✓ השאלון התקבל. התמלול מתבצע ברקע.':'✓ השאלון התקבל בהצלחה.';
   btn.textContent='נשלח ✓';toast('השאלון נשלח בהצלחה.');
 }catch(e){
   console.error(e);const msg=friendlyError(e);status.textContent=msg;toast(msg,false);btn.disabled=false;btn.textContent=old;
 }
}
function mount(){
 removeOldSubmit();const cards=getCards();if(cards.length<1)return setTimeout(mount,400);if($('#v9FinalSubmit'))return;
 const card=document.createElement('section');card.id='v9FinalSubmit';card.dir='rtl';
 card.innerHTML=`<div style="margin:28px 0 12px;padding:22px;border-radius:18px;background:#14392D;color:#fff;text-align:right;box-shadow:0 10px 30px #0002"><div style="font-size:20px;font-weight:800;margin-bottom:7px">סיום ושליחה</div><div style="font-size:14px;line-height:1.65;opacity:.86;margin-bottom:14px">סיימת? בלחיצה אחת התשובות וההקלטות נשלחות בצורה מאובטחת. התמלול מתבצע אוטומטית לאחר השליחה.</div><button id="v9Send" type="button" style="width:100%;min-height:52px;border:0;border-radius:999px;background:#B85F3E;color:#fff;font-size:16px;font-weight:800;cursor:pointer">שלח את השאלון</button><div id="v9Status" style="margin-top:10px;font-size:13px;min-height:20px;text-align:center;opacity:.9"></div></div>`;
 const last=$('#question-50')||cards[cards.length-1];last.insertAdjacentElement('afterend',card);$('#v9Send').addEventListener('click',()=>sendAll($('#v9Send'),$('#v9Status')));
}
function init(){mount()}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();setTimeout(mount,900);
})();