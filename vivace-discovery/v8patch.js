(()=>{'use strict';
const EMAIL='chananelradnik123@gmail.com',WA='972559241585',ENDPOINT=`https://formsubmit.co/ajax/${EMAIL}`;
const $$=(s,r=document)=>Array.from(r.querySelectorAll(s));
function text(el){return (el?.textContent||'').replace(/\s+/g,' ').trim()}
function toast(msg,ok=true){let n=document.getElementById('v8toast');if(!n){n=document.createElement('div');n.id='v8toast';Object.assign(n.style,{position:'fixed',left:'16px',right:'16px',bottom:'18px',zIndex:'99999',padding:'14px 18px',borderRadius:'14px',font:'600 14px Arial',textAlign:'center',boxShadow:'0 10px 35px #0005',transition:'opacity .2s'});document.body.appendChild(n)}n.style.background=ok?'#14392D':'#8b2f25';n.style.color='#fff';n.textContent=msg;n.style.opacity='1';clearTimeout(n._t);n._t=setTimeout(()=>n.style.opacity='0',5000)}
function removeOldSubmit(){
  $$('#finalSubmitCard,#shareResult,.share-result,.submit-card').forEach(x=>x.remove());
  $$('button,a').forEach(el=>{const t=text(el);if(/^(שלח( את)? השאלון|הורד גיבוי תשובות|שתף ל.?WhatsApp|פתח WhatsApp|הכן חבילה לשליחה)/.test(t)){const p=el.closest('.actions,.no-print,.submit-wrap,.share-wrap');(p||el).remove()}})
}
function getCards(){let a=$$('.question-card');if(a.length<40)a=$$('[data-question],article').filter(x=>/\b\d{1,2}\b/.test(text(x).slice(0,30)));return a.slice(0,50)}
function localSnapshot(){const o={};for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);try{o[k]=JSON.parse(localStorage.getItem(k))}catch{o[k]=localStorage.getItem(k)}}return o}
function cardData(card,i){
 const vals=[];
 $$('input,textarea,select',card).forEach(el=>{if((el.type==='checkbox'||el.type==='radio')&&!el.checked)return;if(el.value!==undefined&&String(el.value).trim())vals.push({name:el.name||el.getAttribute('aria-label')||el.placeholder||'',value:String(el.value)})});
 $$('[aria-checked="true"],.selected,.checked,.option-on,.marker-on',card).forEach(el=>{const v=text(el.closest('button,label')||el);if(v&&v.length<180&&!vals.some(x=>x.value===v))vals.push({name:'בחירה',value:v})});
 const q=text(card.querySelector('h2,h3,.question-title,.q-title,.question-text'))||`שאלה ${i+1}`;
 return {number:i+1,question:q,answers:vals};
}
async function audioFiles(cards){const out=[];for(let i=0;i<cards.length;i++){const aud=cards[i].querySelector('audio[src]');if(!aud)continue;try{const b=await fetch(aud.src).then(r=>r.blob());if(b.size){const ext=(b.type.includes('mp4')?'m4a':b.type.includes('ogg')?'ogg':'webm');out.push(new File([b],`Q${String(i+1).padStart(2,'0')}.${ext}`,{type:b.type||'audio/webm'}))}}catch{}}return out}
async function post(fd){const r=await fetch(ENDPOINT,{method:'POST',body:fd,headers:{Accept:'application/json'}});let j={};try{j=await r.json()}catch{}if(!r.ok||j.success===false)throw new Error(j.message||`HTTP ${r.status}`);return j}
async function sendAll(btn,status){
 btn.disabled=true;const old=btn.textContent;btn.textContent='שולח…';status.textContent='אוסף תשובות והקלטות…';
 try{
  const cards=getCards();const data={form:'Vivace OS Owner Discovery',submittedAt:new Date().toISOString(),questions:cards.map(cardData),localStorage:localSnapshot()};
  const files=await audioFiles(cards);const json=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
  const batches=[];let cur=[],size=0;for(const f of files){if(size+f.size>6.5*1024*1024&&cur.length){batches.push(cur);cur=[];size=0}cur.push(f);size+=f.size}if(cur.length)batches.push(cur);if(!batches.length)batches.push([]);
  for(let i=0;i<batches.length;i++){status.textContent=`שולח ${i+1} מתוך ${batches.length}…`;const fd=new FormData();fd.append('_subject',`Vivace OS Discovery${batches.length>1?` — חלק ${i+1}/${batches.length}`:''}`);fd.append('_captcha','false');fd.append('_template','table');fd.append('source','Vivace OS Discovery');fd.append('part',`${i+1}/${batches.length}`);if(i===0)fd.append('answers',new File([json],'answers.json',{type:'application/json'}));batches[i].forEach(f=>fd.append('attachment',f,f.name));await post(fd)}
  status.textContent='✓ השאלון נשלח בהצלחה';btn.textContent='נשלח ✓';toast('השאלון והתשובות נשלחו בהצלחה');
  setTimeout(()=>{const m=encodeURIComponent('Vivace OS — השאלון נשלח בהצלחה.');window.open(`https://wa.me/${WA}?text=${m}`,'_blank')},500);
 }catch(e){console.error(e);status.textContent='השליחה לא הושלמה. נסה שוב.';toast('השליחה לא הושלמה — לא נמחק שום מידע.',false);btn.disabled=false;btn.textContent=old}
}
function mount(){removeOldSubmit();const cards=getCards();if(!cards.length)return setTimeout(mount,300);let card=document.getElementById('v8FinalSubmit');if(card)return;card=document.createElement('section');card.id='v8FinalSubmit';card.dir='rtl';card.innerHTML=`<div style="margin-top:24px;padding:22px;border-radius:18px;background:#14392D;color:#fff;text-align:right;box-shadow:0 10px 30px #0002"><div style="font-size:20px;font-weight:800;margin-bottom:7px">סיום ושליחה</div><div style="font-size:14px;line-height:1.65;opacity:.86;margin-bottom:14px">סיימת? בלחיצה אחת התשובות וההקלטות נשלחות ישירות. אין צורך להוריד קובץ לטלפון.</div><button id="v8Send" type="button" style="width:100%;min-height:52px;border:0;border-radius:999px;background:#B85F3E;color:#fff;font-size:16px;font-weight:800;cursor:pointer">שלח את השאלון</button><div id="v8Status" style="margin-top:10px;font-size:13px;min-height:20px;text-align:center;opacity:.9"></div></div>`;
 const last=cards[cards.length-1];last.insertAdjacentElement('afterend',card);card.querySelector('#v8Send').addEventListener('click',()=>sendAll(card.querySelector('#v8Send'),card.querySelector('#v8Status')))
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount);else mount();setTimeout(mount,1200);
})();