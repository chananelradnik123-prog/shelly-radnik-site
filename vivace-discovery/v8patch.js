(()=>{'use strict';
const EMAIL='chananelradnik123@gmail.com',WA='972559241585',FORM_URL=`https://formsubmit.co/${EMAIL}`;
const AUDIO_DB='vivace-owner-discovery-audio-v1',AUDIO_STORE='recordings';
const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>Array.from(r.querySelectorAll(s));
function text(el){return (el?.textContent||'').replace(/\s+/g,' ').trim()}
function toast(msg,ok=true){let n=$('#v8toast');if(!n){n=document.createElement('div');n.id='v8toast';Object.assign(n.style,{position:'fixed',left:'16px',right:'16px',bottom:'18px',zIndex:'99999',padding:'14px 18px',borderRadius:'14px',font:'600 14px Arial',textAlign:'center',boxShadow:'0 10px 35px #0005',transition:'opacity .2s'});document.body.appendChild(n)}n.style.background=ok?'#14392D':'#8b2f25';n.style.color='#fff';n.textContent=msg;n.style.opacity='1';clearTimeout(n._t);n._t=setTimeout(()=>n.style.opacity='0',5000)}
function removeOldSubmit(){
  $$('#finalSubmitCard,#shareResult,.share-result,.submit-card,#v6SubmitCard').forEach(x=>x.remove());
  $$('button,a').forEach(el=>{const t=text(el);if(/^(שלח( את)? השאלון|הורד גיבוי תשובות|שתף ל.?WhatsApp|פתח WhatsApp|הכן חבילה לשליחה|נסה לשלוח שוב)/.test(t)&&!el.closest('#v8FinalSubmit')){const p=el.closest('.actions,.no-print,.submit-wrap,.share-wrap,.fixed');(p||el).remove()}})
}
function getCards(){const a=$$('.interactive-question');return a.length?a.slice(0,50):$$('[data-question-id]').slice(0,50)}
function localSnapshot(){const o={};for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);try{o[k]=JSON.parse(localStorage.getItem(k))}catch{o[k]=localStorage.getItem(k)}}return o}
function cardData(card,i){
 const vals=[];
 $$('[data-field-id],input,textarea,select',card).forEach(el=>{if((el.type==='checkbox'||el.type==='radio')&&!el.checked)return;const v=el.value!==undefined?String(el.value):'';if(v.trim())vals.push({name:el.dataset?.fieldId||el.name||el.getAttribute('aria-label')||el.placeholder||'',value:v.trim()})});
 $$('.selected,[aria-checked="true"],.checked,.option-on,.marker-on',card).forEach(el=>{const v=text(el.closest('button,label,.cap-card,.choice,td')||el);if(v&&v.length<220&&!vals.some(x=>x.value===v))vals.push({name:'בחירה',value:v})});
 const q=card.dataset.questionTitle||text($('.qtitle,.question-title,.q-title,h2,h3',card))||`שאלה ${i+1}`;
 return {number:Number(card.dataset.questionId)||i+1,question:q,answers:vals};
}
async function getRecordings(){return new Promise(resolve=>{try{const req=indexedDB.open(AUDIO_DB,1);req.onerror=()=>resolve([]);req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains(AUDIO_STORE))req.result.createObjectStore(AUDIO_STORE,{keyPath:'questionId'})};req.onsuccess=()=>{const db=req.result;try{const tx=db.transaction(AUDIO_STORE,'readonly'),r=tx.objectStore(AUDIO_STORE).getAll();r.onsuccess=()=>{db.close();resolve(r.result||[])};r.onerror=()=>{db.close();resolve([])}}catch{db.close();resolve([])}}}catch{resolve([])}})}
function extFor(r){const m=(r.mimeType||r.blob?.type||'').toLowerCase();return m.includes('mp4')||m.includes('m4a')?'m4a':m.includes('ogg')?'ogg':m.includes('wav')?'wav':'webm'}
async function makePackages(){
 const cards=getCards(),recordings=await getRecordings(),data={form:'Vivace OS Owner Discovery',submittedAt:new Date().toISOString(),questions:cards.map(cardData),localStorage:localSnapshot(),recordings:recordings.map(r=>({questionId:r.questionId,mimeType:r.mimeType||r.blob?.type||'',size:r.blob?.size||0}))};
 const groups=[];let g=[],size=0;recordings.forEach(r=>{const n=r.blob?.size||0;if(g.length&&size+n>6.2*1024*1024){groups.push(g);g=[];size=0}g.push(r);size+=n});if(g.length)groups.push(g);if(!groups.length)groups.push([]);
 const files=[];
 for(let i=0;i<groups.length;i++){
   if(!window.JSZip)throw new Error('ZIP_NOT_READY');const zip=new JSZip();zip.file('answers.json',JSON.stringify(data,null,2));const folder=zip.folder('audio');groups[i].forEach(r=>{if(r.blob)folder.file(`Q${String(r.questionId).padStart(2,'0')}.${extFor(r)}`,r.blob)});const blob=await zip.generateAsync({type:'blob',compression:'DEFLATE',compressionOptions:{level:6}});if(blob.size>9*1024*1024)throw new Error('TOO_LARGE');files.push(new File([blob],`Vivace-OS-Discovery-${new Date().toISOString().slice(0,10)}${groups.length>1?`-part-${i+1}-of-${groups.length}`:''}.zip`,{type:'application/zip'}));
 }
 return {files,data};
}
function submitMultipart(file,index,total,data){return new Promise((resolve,reject)=>{
 const frame=document.createElement('iframe');frame.name=`vivaceSubmit_${Date.now()}_${index}`;frame.style.display='none';document.body.appendChild(frame);
 const form=document.createElement('form');form.method='POST';form.action=FORM_URL;form.enctype='multipart/form-data';form.target=frame.name;form.style.display='none';
 const add=(n,v)=>{const i=document.createElement('input');i.type='hidden';i.name=n;i.value=v;form.appendChild(i)};
 add('_subject',`Vivace OS — Discovery${total>1?` (${index}/${total})`:''}`);add('_captcha','false');add('_template','table');add('_url',location.href);add('נענו',`${data.questions.filter(q=>q.answers.length).length} מתוך ${data.questions.length}`);add('חלק',`${index}/${total}`);
 const fi=document.createElement('input');fi.type='file';fi.name='attachment';const dt=new DataTransfer();dt.items.add(file);fi.files=dt.files;form.appendChild(fi);document.body.appendChild(form);
 let done=false;const finish=(ok)=>{if(done)return;done=true;setTimeout(()=>{form.remove();frame.remove()},800);ok?resolve():reject(new Error('FORM_POST_FAILED'))};
 frame.onload=()=>finish(true);setTimeout(()=>finish(true),5000);try{form.submit()}catch(e){finish(false)}
 })}
async function sendAll(btn,status){
 btn.disabled=true;const old=btn.textContent;btn.textContent='שולח…';status.textContent='אוסף תשובות והקלטות…';
 try{const {files,data}=await makePackages();for(let i=0;i<files.length;i++){status.textContent=`מעלה ${i+1} מתוך ${files.length}…`;await submitMultipart(files[i],i+1,files.length,data)}status.textContent='✓ החבילה נשלחה. אם זו הפעם הראשונה, ייתכן שתקבל מייל אישור חד־פעמי.';btn.textContent='נשלח ✓';toast('החבילה נשלחה. בדוק את המייל לאישור חד־פעמי אם נדרש.');setTimeout(()=>{window.open(`https://wa.me/${WA}?text=${encodeURIComponent('Vivace OS — השאלון הושלם ונשלח.')}`,'_blank')},700)}catch(e){console.error(e);status.textContent='השליחה לא הושלמה. כל המידע עדיין שמור במכשיר.';toast('השליחה לא הושלמה — לא נמחק שום מידע.',false);btn.disabled=false;btn.textContent=old}}
function mount(){removeOldSubmit();const cards=getCards();if(cards.length<1)return setTimeout(mount,400);if($('#v8FinalSubmit'))return;const card=document.createElement('section');card.id='v8FinalSubmit';card.dir='rtl';card.innerHTML=`<div style="margin:28px 0 12px;padding:22px;border-radius:18px;background:#14392D;color:#fff;text-align:right;box-shadow:0 10px 30px #0002"><div style="font-size:20px;font-weight:800;margin-bottom:7px">סיום ושליחה</div><div style="font-size:14px;line-height:1.65;opacity:.86;margin-bottom:14px">סיימת? בלחיצה אחת התשובות וההקלטות נשלחות. אין צורך להוריד קובץ לטלפון.</div><button id="v8Send" type="button" style="width:100%;min-height:52px;border:0;border-radius:999px;background:#B85F3E;color:#fff;font-size:16px;font-weight:800;cursor:pointer">שלח את השאלון</button><div id="v8Status" style="margin-top:10px;font-size:13px;min-height:20px;text-align:center;opacity:.9"></div></div>`;const last=$('#question-50')||cards[cards.length-1];last.insertAdjacentElement('afterend',card);$('#v8Send').addEventListener('click',()=>sendAll($('#v8Send'),$('#v8Status')))}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount);else mount();setTimeout(mount,900);
})();