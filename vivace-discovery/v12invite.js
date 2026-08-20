(()=>{'use strict';
const CHECK_URL='https://eadljasmuqnzcrfudsib.supabase.co/functions/v1/vivace-invite-check';
const SUBMIT_URL='https://eadljasmuqnzcrfudsib.supabase.co/functions/v1/vivace-discovery-submit';
const STORAGE_KEY='vivace-invite-token-v1';
const COMPLETED_KEY='vivace-submission-complete-v1';
const CLIENT_SESSION_KEY='vivace-client-session-key-v1';
const INVITE_FIELD='__vivace_invite_token';
const SESSION_FIELD='__vivace_client_session';
const nativeFetch=window.fetch.bind(window);
let inviteToken='';
let inviteValid=false;
let alreadySubmitted=false;
let clientSessionKey='';
function randomHex(bytes=32){const buf=new Uint8Array(bytes);crypto.getRandomValues(buf);return Array.from(buf,b=>b.toString(16).padStart(2,'0')).join('')}
try{
 inviteToken=sessionStorage.getItem(STORAGE_KEY)||'';
 alreadySubmitted=sessionStorage.getItem(COMPLETED_KEY)==='1';
 const urlSession=new URLSearchParams(location.search).get('session');
 clientSessionKey=urlSession&&urlSession.length<=128?urlSession:(sessionStorage.getItem(CLIENT_SESSION_KEY)||'');
 if(!clientSessionKey){clientSessionKey=randomHex(32);sessionStorage.setItem(CLIENT_SESSION_KEY,clientSessionKey)}
}catch{clientSessionKey=clientSessionKey||randomHex(32)}
function validFormat(v){return /^[0-9a-f]{64}$/i.test(String(v||''))}
function validClientSession(v){const s=String(v||'');return s.length>=16&&s.length<=128&&/^[A-Za-z0-9._:-]+$/.test(s)}
function syntheticError(code,status=403){return Promise.resolve(new Response(JSON.stringify({error:code}),{status,headers:{'content-type':'application/json'}}))}
function decorateQuestions(input){
 const hidden=new Set([INVITE_FIELD,SESSION_FIELD,'__vivace_privacy_ack']);
 const questions=Array.isArray(input)?input.map(q=>({...q,answers:Array.isArray(q?.answers)?q.answers.filter(a=>!hidden.has(a?.name)).map(a=>({...a})):[]})):[];
 if(!questions.length)questions.push({number:1,question:'שאלה 1',answers:[]});
 questions[0].answers.push({name:INVITE_FIELD,value:inviteToken});
 questions[0].answers.push({name:SESSION_FIELD,value:clientSessionKey});
 return questions;
}
function markCompleted(){
 alreadySubmitted=true;
 try{sessionStorage.setItem(COMPLETED_KEY,'1')}catch{}
 setTimeout(()=>refreshState(),0);
}
window.fetch=function(input,init){
 const url=typeof input==='string'?input:input?.url||'';
 let action='';
 if(url===SUBMIT_URL&&String(init?.method||'GET').toUpperCase()==='POST'&&typeof init?.body==='string'){
  try{
   const body=JSON.parse(init.body);action=String(body?.action||'');
   if(action==='prepare'){
    if(alreadySubmitted)return syntheticError('SUBMISSION_ALREADY_COMPLETED',409);
    if(!validFormat(inviteToken))return syntheticError('INVITE_REQUIRED');
    if(!validClientSession(clientSessionKey))return syntheticError('CLIENT_SESSION_INVALID',400);
    body.questions=decorateQuestions(body.questions);
    init={...init,body:JSON.stringify(body)};
   }
  }catch{}
 }
 const pending=nativeFetch(input,init);
 if(url===SUBMIT_URL&&action==='finalize'){
  return pending.then(response=>{
   if(response.ok){response.clone().json().then(data=>{if(data?.ok)markCompleted()}).catch(()=>{})}
   return response;
  });
 }
 return pending;
};
async function checkInvite(){
 if(!validFormat(inviteToken))return{valid:false};
 const r=await nativeFetch(CHECK_URL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({inviteToken}),cache:'no-store'});
 let data={};try{data=await r.json()}catch{}
 if(!r.ok)throw new Error(data?.error||`HTTP_${r.status}`);
 return data;
}
function setButton(btn,enabled){
 if(!btn)return;
 btn.disabled=!enabled;
 btn.style.opacity=enabled?'1':'.55';
 btn.style.cursor=enabled?'pointer':'not-allowed';
}
function refreshState(message){
 const btn=document.querySelector('#v9Send'),status=document.querySelector('#v9Status');
 if(!btn||!status)return;
 if(alreadySubmitted){setButton(btn,false);status.textContent='✓ השאלון כבר נשלח מהסשן הזה.';status.style.color='';return}
 setButton(btn,inviteValid);
 if(message){status.textContent=message;status.style.color=inviteValid?'':'#ffd8cc';return}
 if(!inviteValid){status.textContent='קישור ההזמנה חסר, פג תוקף או אינו תקף.';status.style.color='#ffd8cc';return}
 status.textContent='✓ קישור ההזמנה אומת.';status.style.color='';
}
async function bindGate(){
 const btn=document.querySelector('#v9Send'),status=document.querySelector('#v9Status');
 if(!btn||!status)return false;
 if(btn.dataset.inviteGate==='1')return true;
 btn.dataset.inviteGate='1';
 if(alreadySubmitted){refreshState();return true}
 setButton(btn,false);
 status.textContent='מאמת קישור הזמנה…';
 status.style.color='';
 if(!validFormat(inviteToken)){
  inviteValid=false;
  refreshState('קישור ההזמנה חסר או אינו תקף. בקש קישור חדש.');
  return true;
 }
 try{
  const result=await checkInvite();
  inviteValid=Boolean(result?.valid);
  if(inviteValid){refreshState();return true}
  refreshState('קישור ההזמנה פג תוקף או שכבר נוצל. בקש קישור חדש.');
 }catch(e){
  console.error('invite check failed',e);
  inviteValid=false;
  refreshState('לא הצלחנו לאמת את קישור ההזמנה. נסה לרענן את הדף.');
 }
 return true;
}
function boot(){
 const observer=new MutationObserver(()=>{void tryBind()});
 async function tryBind(){if(await bindGate())observer.disconnect()}
 observer.observe(document.documentElement,{childList:true,subtree:true});
 void tryBind();
 setTimeout(()=>{void tryBind()},500);
 setTimeout(()=>{void tryBind()},1500);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();