(()=>{'use strict';
const CHECK_URL='https://eadljasmuqnzcrfudsib.supabase.co/functions/v1/vivace-invite-check';
const SUBMIT_URL='https://eadljasmuqnzcrfudsib.supabase.co/functions/v1/vivace-discovery-submit';
const STORAGE_KEY='vivace-invite-token-v1';
const HIDDEN_FIELD='__vivace_invite_token';
const nativeFetch=window.fetch.bind(window);
let inviteToken='';
try{inviteToken=sessionStorage.getItem(STORAGE_KEY)||''}catch{}
function validFormat(v){return /^[0-9a-f]{64}$/i.test(String(v||''))}
function syntheticError(code,status=403){return Promise.resolve(new Response(JSON.stringify({error:code}),{status,headers:{'content-type':'application/json'}}))}
function decorateQuestions(input){
 const questions=Array.isArray(input)?input.map(q=>({...q,answers:Array.isArray(q?.answers)?q.answers.filter(a=>a?.name!==HIDDEN_FIELD).map(a=>({...a})):[]})):[];
 if(!questions.length)questions.push({number:1,question:'שאלה 1',answers:[]});
 questions[0].answers.push({name:HIDDEN_FIELD,value:inviteToken});
 return questions;
}
window.fetch=function(input,init){
 const url=typeof input==='string'?input:input?.url||'';
 if(url===SUBMIT_URL&&String(init?.method||'GET').toUpperCase()==='POST'&&typeof init?.body==='string'){
  try{
   const body=JSON.parse(init.body);
   if(body?.action==='prepare'){
    if(!validFormat(inviteToken))return syntheticError('INVITE_REQUIRED');
    body.questions=decorateQuestions(body.questions);
    init={...init,body:JSON.stringify(body)};
   }
  }catch{}
 }
 return nativeFetch(input,init);
};
async function checkInvite(){
 if(!validFormat(inviteToken))return{valid:false};
 const r=await nativeFetch(CHECK_URL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({inviteToken}),cache:'no-store'});
 let data={};try{data=await r.json()}catch{}
 if(!r.ok)throw new Error(data?.error||`HTTP_${r.status}`);
 return data;
}
function setStatus(btn,status,valid,message){
 if(!btn||!status)return;
 btn.disabled=!valid;
 btn.style.opacity=valid?'1':'.55';
 btn.style.cursor=valid?'pointer':'not-allowed';
 status.textContent=message||'';
 if(!valid)status.style.color='#ffd8cc';
 else status.style.color='';
}
async function bindGate(){
 const btn=document.querySelector('#v9Send'),status=document.querySelector('#v9Status');
 if(!btn||!status||btn.dataset.inviteGate==='1')return false;
 btn.dataset.inviteGate='1';
 setStatus(btn,status,false,'מאמת קישור הזמנה…');
 if(!validFormat(inviteToken)){
  setStatus(btn,status,false,'קישור ההזמנה חסר או אינו תקף. בקש קישור חדש.');
  return true;
 }
 try{
  const result=await checkInvite();
  if(result?.valid){setStatus(btn,status,true,'✓ קישור ההזמנה אומת.');return true}
  setStatus(btn,status,false,'קישור ההזמנה פג תוקף או שכבר נוצל. בקש קישור חדש.');
 }catch(e){
  console.error('invite check failed',e);
  setStatus(btn,status,false,'לא הצלחנו לאמת את קישור ההזמנה. נסה לרענן את הדף.');
 }
 return true;
}
function boot(){
 if(bindGate())return;
 const observer=new MutationObserver(()=>{bindGate()});
 observer.observe(document.documentElement,{childList:true,subtree:true});
 setTimeout(()=>bindGate(),500);
 setTimeout(()=>bindGate(),1500);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();
