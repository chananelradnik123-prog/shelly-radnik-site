(()=>{'use strict';

const AUDIO_DB='vivace-owner-discovery-audio-v1';
const AUDIO_STORE='recordings';
const PREVIEW_API='https://eadljasmuqnzcrfudsib.supabase.co/functions/v1/vivace-audio-preview';
const SUBMIT_API='/functions/v1/vivace-discovery-submit';
const FORM_HEADER='owner-discovery-v1';
const APPROVED_KEY='vivace-approved-preview-transcripts-v1';
const APPROVED_ANSWER='תמלול שאושר על ידי ממלא השאלון';
const SEEN=new Map();
const RECORDING=new Set();
const GENERATION=new Map();
const nativeFetch=window.fetch.bind(window);
let running=false;
let activePreview=null;

const $=(selector,root=document)=>root.querySelector(selector);
const $$=(selector,root=document)=>Array.from(root.querySelectorAll(selector));
const clean=value=>String(value||'').replace(/\s+/g,' ').trim();

function readApproved(){try{return JSON.parse(localStorage.getItem(APPROVED_KEY)||'{}')||{}}catch{return{}}}
function writeApproved(value){try{localStorage.setItem(APPROVED_KEY,JSON.stringify(value))}catch{}}
function escapeHtml(value){return String(value).replace(/[&<>\"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[char]))}
function activeRecording(record){const ids=window.__vivaceActiveQuestionIds;return !Array.isArray(ids)||ids.includes(Number(record?.questionId))}

async function getRecordings(){
 if(typeof window.__vivaceGetLocalRecordings==='function')return (await window.__vivaceGetLocalRecordings()).filter(activeRecording);
 return await new Promise(resolve=>{try{const request=indexedDB.open(AUDIO_DB,1);request.onerror=()=>resolve([]);request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains(AUDIO_STORE))request.result.createObjectStore(AUDIO_STORE,{keyPath:'questionId'})};request.onsuccess=()=>{const db=request.result;try{const result=db.transaction(AUDIO_STORE,'readonly').objectStore(AUDIO_STORE).getAll();result.onsuccess=()=>{db.close();resolve((result.result||[]).filter(activeRecording))};result.onerror=()=>{db.close();resolve([])}}catch{db.close();resolve([])}}}catch{resolve([])}})
}

async function sha256(blob){const bytes=await blob.arrayBuffer(),digest=await crypto.subtle.digest('SHA-256',bytes);return [...new Uint8Array(digest)].map(byte=>byte.toString(16).padStart(2,'0')).join('')}
function cardFor(questionId){return document.querySelector(`[data-question-id="${questionId}"]`)||document.querySelector(`#question-${questionId}`)||$$('.interactive-question,[data-question-id]')[Number(questionId)-1]||null}

function setState(questionId,state){
 const card=cardFor(questionId);if(!card)return;
 const next=String(state||'');if(card.dataset.transcriptStatus===next)return;
 if(next)card.dataset.transcriptStatus=next;else delete card.dataset.transcriptStatus;
 document.dispatchEvent(new CustomEvent('vivace:transcript-state-changed',{detail:{questionId:Number(questionId),state:next}}));
}

function panel(questionId){
 const card=cardFor(questionId);if(!card)return null;
 let result=$(`.vivace-preview[data-qid="${questionId}"]`,card);
 if(!result){result=document.createElement('section');result.className='vivace-preview';result.dataset.qid=String(questionId);result.dir='rtl';result.setAttribute('aria-live','polite');const recorder=$('.audio-recorder',card);if(recorder)recorder.insertAdjacentElement('afterend',result);else card.appendChild(result)}
 return result;
}

function setPanel(questionId,state,html){const result=panel(questionId);if(!result)return;result.className=`vivace-preview is-${state}`;result.innerHTML=html;setState(questionId,state)}
function removePanel(questionId){const card=cardFor(questionId),result=card?.querySelector(`.vivace-preview[data-qid="${questionId}"]`);result?.remove();setState(questionId,'')}
function findRecordButton(questionId){const card=cardFor(questionId);if(!card)return null;return $('.record-button',card)||$$('button,[role="button"]',card).find(element=>/(הקלט|הקלטה|מיקרופון|record|microphone|\bmic\b)/i.test([clean(element.textContent),element.getAttribute('aria-label')||'',element.getAttribute('title')||'',String(element.className||''),element.dataset?.action||''].join(' ')))||null}

function invalidate(questionId){const all=readApproved();if(all[questionId]){delete all[questionId];writeApproved(all)}}
function wireRerecord(questionId){const result=panel(questionId),button=$(`[data-vivace-rerecord="${questionId}"]`,result);if(!button)return;button.onclick=()=>{const record=findRecordButton(questionId);if(record)record.click();else setPanel(questionId,'error','<div class="vivace-preview-error">לא מצאנו את כפתור ההקלטה. נסה לרענן את הדף.</div>')}}

function renderProcessing(questionId,label,copy='זה יכול לקחת כמה שניות. אין צורך לעזוב את השאלה.'){
 setPanel(questionId,'processing',`<div class="vivace-preview-head"><span class="vivace-preview-badge">${escapeHtml(label)}</span></div><div class="vivace-preview-copy">${escapeHtml(copy)}</div>`)
}

function renderUnclear(questionId){
 invalidate(questionId);
 setPanel(questionId,'error','<div class="vivace-preview-head"><span class="vivace-preview-badge">לא נשמע דיבור ברור</span></div><div class="vivace-preview-copy">ההקלטה נשמרה במכשיר, אבל אי אפשר לאשר אותה כתשובה. הקלט אותה מחדש.</div><div class="vivace-preview-actions"><button type="button" class="is-primary" data-vivace-rerecord="'+questionId+'">הקלט מחדש</button></div>');
 wireRerecord(questionId)
}

function renderFailure(questionId,error){
 const message=String(error?.message||'');
 let title='לא הצלחנו לתמלל כרגע',copy='ההקלטה נשמרה במכשיר. אפשר לנסות שוב בלי להקליט מחדש.';
 if(message.includes('INVITE_MISSING')||message.includes('INVITE_REQUIRED')){title='נדרש קישור ההזמנה הרשמי';copy='ההקלטה נשמרה במכשיר, אבל התמלול פועל רק מתוך קישור ההזמנה של Vivace.'}
 else if(message.includes('ORIGIN_NOT_ALLOWED')||message.includes('HTTP_403')){title='התמלול לא זמין בקישור הבדיקה';copy='ההקלטה נשמרה במכשיר. התמלול יפעל בקישור הרשמי לאחר פרסום הגרסה.'}
 setPanel(questionId,'error',`<div class="vivace-preview-head"><span class="vivace-preview-badge">${escapeHtml(title)}</span></div><div class="vivace-preview-copy">${escapeHtml(copy)}</div><div class="vivace-preview-actions"><button type="button" class="is-secondary" data-vivace-retry="${questionId}">נסה תמלול שוב</button><button type="button" class="is-primary" data-vivace-rerecord="${questionId}">הקלט מחדש</button></div>`);
 const result=panel(questionId),retry=$(`[data-vivace-retry="${questionId}"]`,result);if(retry)retry.onclick=()=>{SEEN.delete(Number(questionId));void scan()};wireRerecord(questionId)
}

function renderApproved(questionId,approved){
 const text=clean(approved?.text);if(!text)return;
 setPanel(questionId,'approved',`<div class="vivace-preview-head"><span class="vivace-preview-badge">תמלול אושר</span></div><div class="vivace-transcript-text">${escapeHtml(text)}</div><div class="vivace-preview-actions"><button type="button" class="is-secondary" data-vivace-edit="${questionId}">ערוך תמלול</button><button type="button" class="is-secondary" data-vivace-rerecord="${questionId}">הקלט מחדש</button></div>`);
 const result=panel(questionId),edit=$(`[data-vivace-edit="${questionId}"]`,result);if(edit)edit.onclick=()=>renderReview(questionId,approved.audioSha256||'',{transcript:text,source:approved.source||'user-approved'});wireRerecord(questionId)
}

function renderReview(questionId,hash,data){
 const initial=clean(data?.transcript);if(!initial){renderUnclear(questionId);return}
 setPanel(questionId,'review',`<div class="vivace-preview-head"><span class="vivace-preview-badge">התמלול מוכן לבדיקה</span></div><label class="vivace-transcript-label">זה מה שתומלל:<textarea class="vivace-transcript-editor" data-vivace-transcript="${questionId}" rows="3">${escapeHtml(initial)}</textarea></label><div class="vivace-preview-actions"><button type="button" class="is-primary" data-vivace-approve="${questionId}">התמלול נכון</button><button type="button" class="is-secondary" data-vivace-rerecord="${questionId}">הקלט מחדש</button></div><span class="vivace-preview-note">אפשר לתקן מילה או שתיים לפני האישור.</span>`);
 const result=panel(questionId),approve=$(`[data-vivace-approve="${questionId}"]`,result),editor=$(`[data-vivace-transcript="${questionId}"]`,result);
 if(approve)approve.onclick=()=>{const text=clean(editor?.value);if(!text){editor?.focus();return}const all=readApproved();all[questionId]={questionId:Number(questionId),text,source:clean(data?.source||'gemini-preview'),audioSha256:hash,approvedAt:new Date().toISOString()};writeApproved(all);renderApproved(questionId,all[questionId])};
 wireRerecord(questionId)
}

async function requestPreview(record,hash,quality){
 const questionId=Number(record?.questionId||0),blob=record?.blob;if(!questionId||!blob)throw new Error('MISSING_AUDIO');
 if(!$('#v15PrivacyAck')?.checked)throw new Error('CONSENT_REQUIRED');
 const invite=sessionStorage.getItem('vivace-invite-token-v1')||'';if(!invite)throw new Error('INVITE_MISSING');
 const form=new FormData();form.append('audio',blob,`Q${String(questionId).padStart(2,'0')}.webm`);form.append('questionId',String(questionId));form.append('invite',invite);form.append('sha256',hash);form.append('quality',JSON.stringify(quality||{}));
 const controller=new AbortController();activePreview={questionId,controller};
 let response;
 try{response=await nativeFetch(PREVIEW_API,{method:'POST',headers:{'x-vivace-form':FORM_HEADER},body:form,cache:'no-store',signal:controller.signal})}
 finally{if(activePreview?.controller===controller)activePreview=null}
 let data={};try{data=await response.json()}catch{}
 if(!response.ok||!data.ok){const error=new Error(data.error||`HTTP_${response.status}`);error.data=data;throw error}return data
}

async function scan(){
 if(running||!$('#v15PrivacyAck')?.checked)return;
 running=true;
 try{
  const recordings=await getRecordings(),approved=readApproved();
  for(const record of recordings){
   const questionId=Number(record?.questionId||0),blob=record?.blob;if(!questionId||!blob)continue;
   if(RECORDING.has(questionId))continue;
   const generation=GENERATION.get(questionId)||0;
   let hash='';try{hash=await sha256(blob)}catch{continue}
   if(RECORDING.has(questionId)||(GENERATION.get(questionId)||0)!==generation){SEEN.delete(questionId);continue}
   if(approved[questionId]?.audioSha256===hash&&clean(approved[questionId]?.text)){if(SEEN.get(questionId)!==hash||cardFor(questionId)?.dataset.transcriptStatus!=='approved')renderApproved(questionId,approved[questionId]);SEEN.set(questionId,hash);continue}
   if(SEEN.get(questionId)===hash)continue;
   SEEN.set(questionId,hash);invalidate(questionId);renderProcessing(questionId,'בודק את ההקלטה');
   try{
    const quality=typeof window.__vivaceAnalyzeAudio==='function'?await window.__vivaceAnalyzeAudio(blob):null;
    if(RECORDING.has(questionId)||(GENERATION.get(questionId)||0)!==generation){SEEN.delete(questionId);continue}
    if(quality&&quality.usable===false){renderUnclear(questionId);continue}
    renderProcessing(questionId,'מתמלל את ההקלטה');
    const result=await requestPreview(record,hash,quality);
    if(RECORDING.has(questionId)||(GENERATION.get(questionId)||0)!==generation){SEEN.delete(questionId);continue}
    if(result.status!=='ok'||!clean(result.transcript)){renderUnclear(questionId);continue}
    renderReview(questionId,hash,result)
   }catch(error){
    if(error?.name==='AbortError'){SEEN.delete(questionId);if(!RECORDING.has(questionId)&&!$('#v15PrivacyAck')?.checked)setPanel(questionId,'pending','<div class="vivace-preview-head"><span class="vivace-preview-badge">התמלול מושהה</span></div><div class="vivace-preview-copy">אישור ההקלטות בוטל. ההקלטה נשארה במכשיר ולא נשלחת לתמלול עד לאישור מחדש.</div>');continue}
    console.error('Vivace preview failed',error);renderFailure(questionId,error)
   }
  }
 }finally{running=false}
}

window.__vivaceGetApprovedPreviewTranscripts=()=>readApproved();
window.__vivaceIsTranscriptApproved=questionId=>cardFor(questionId)?.dataset.transcriptStatus==='approved';

window.fetch=async function(input,init){
 try{
  const url=typeof input==='string'?input:input?.url||'';
  if(url.includes(SUBMIT_API)&&String(init?.method||'GET').toUpperCase()==='POST'&&typeof init.body==='string'){
   const body=JSON.parse(init.body);
   if(body?.action==='prepare'){
    const approved=Object.values(readApproved()).map(item=>({questionId:Number(item.questionId),text:clean(item.text),source:'gemini-preview:user-approved',audioSha256:clean(item.audioSha256),approvedAt:item.approvedAt||null,userApproved:true})).filter(item=>item.questionId&&item.text);
    body.previewTranscripts=approved;
    if(Array.isArray(body.questions))body.questions=body.questions.map(question=>{const transcript=approved.find(item=>Number(item.questionId)===Number(question?.number));if(!transcript)return question;const answers=Array.isArray(question.answers)?question.answers.filter(answer=>answer?.name!==APPROVED_ANSWER):[];answers.push({name:APPROVED_ANSWER,value:transcript.text});return{...question,answers}});
    init={...init,body:JSON.stringify(body)}
   }
  }
 }catch(error){console.warn('Vivace preview transcript injection skipped',error)}
 return nativeFetch(input,init)
};

document.addEventListener('vivace:recording-started',event=>{const questionId=Number(event.detail?.questionId||0);if(!questionId)return;GENERATION.set(questionId,(GENERATION.get(questionId)||0)+1);RECORDING.add(questionId);if(activePreview?.questionId===questionId)activePreview.controller.abort();SEEN.delete(questionId);renderProcessing(questionId,'מקליט תשובה חדשה','אחרי העצירה התמלול החדש יופיע כאן.')});
document.addEventListener('vivace:recording-saved',event=>{const questionId=Number(event.detail?.questionId||0);if(!questionId)return;GENERATION.set(questionId,(GENERATION.get(questionId)||0)+1);RECORDING.delete(questionId);invalidate(questionId);SEEN.delete(questionId);renderProcessing(questionId,'ההקלטה נשמרה','מתחיל תמלול…');void scan()});
document.addEventListener('vivace:recording-cancelled',event=>{const questionId=Number(event.detail?.questionId||0);if(!questionId)return;GENERATION.set(questionId,(GENERATION.get(questionId)||0)+1);RECORDING.delete(questionId);SEEN.delete(questionId);if(event.detail?.hadPrevious)void scan();else removePanel(questionId)});
document.addEventListener('vivace:recording-deleted',event=>{const questionId=Number(event.detail?.questionId||0);if(!questionId)return;GENERATION.set(questionId,(GENERATION.get(questionId)||0)+1);RECORDING.delete(questionId);if(activePreview?.questionId===questionId)activePreview.controller.abort();invalidate(questionId);SEEN.delete(questionId);removePanel(questionId)});
document.addEventListener('change',event=>{if(event.target?.id!=='v15PrivacyAck')return;if(event.target.checked)void scan();else{activePreview?.controller.abort();SEEN.clear()}});

setInterval(()=>void scan(),1400);
setTimeout(()=>void scan(),600);
})();
