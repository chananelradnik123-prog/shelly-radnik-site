(()=>{'use strict';
const Native=window.SpeechRecognition||window.webkitSpeechRecognition;
if(!Native||window.__vivaceSpeechWrapped)return;
window.__vivaceSpeechWrapped=true;
const TRANSCRIPT_KEY='vivace-live-transcripts-v1';
const DIAG_KEY='vivace-live-transcription-diag-v1';
const nativeFetch=window.fetch.bind(window);
let activeQuestionId=0;
const text=el=>(el?.textContent||'').replace(/\s+/g,' ').trim();
function readJson(key,fallback={}){try{return JSON.parse(localStorage.getItem(key)||'')||fallback}catch{return fallback}}
function writeJson(key,value){try{localStorage.setItem(key,JSON.stringify(value))}catch{}}
function signature(btn){return [text(btn),btn.getAttribute('aria-label')||'',btn.getAttribute('title')||'',btn.id||'',String(btn.className||''),btn.dataset?.action||''].join(' ').toLowerCase()}
function isRecordControl(btn){return /(הקלט|הקלטה|מיקרופון|record|microphone|\bmic\b)/i.test(signature(btn))}
function getQuestionId(btn){const card=btn?.closest?.('.interactive-question,[data-question-id]');if(!card)return 0;const explicit=Number(card.dataset.questionId||0);if(explicit)return explicit;const cards=Array.from(document.querySelectorAll('.interactive-question,[data-question-id]'));return cards.indexOf(card)+1}
function persistTranscript(qid,value){qid=Number(qid||0);value=String(value||'').replace(/\s+/g,' ').trim();if(!qid||!value)return;const all=readJson(TRANSCRIPT_KEY,{});const existing=String(all[qid]||'').trim();if(!existing||value.length>=existing.length){all[qid]=value;writeJson(TRANSCRIPT_KEY,all)}}
function diag(qid,event,detail=''){const all=readJson(DIAG_KEY,[]);all.push({questionId:Number(qid||0)||null,event:String(event),detail:String(detail||'').slice(0,250),at:new Date().toISOString()});while(all.length>100)all.shift();writeJson(DIAG_KEY,all)}
document.addEventListener('click',e=>{const btn=e.target.closest?.('button,[role="button"]');if(!btn||!isRecordControl(btn))return;const qid=getQuestionId(btn);if(qid){activeQuestionId=qid;diag(qid,'record-control-click',signature(btn).slice(0,120))}},true);
function WrappedRecognition(){
  const rec=new Native();
  const qid=activeQuestionId;
  let finals='';let interim='';
  diag(qid,'recognition-created');
  return new Proxy(rec,{
    get(target,prop){const v=target[prop];return typeof v==='function'?v.bind(target):v},
    set(target,prop,value){
      if(prop==='onresult'&&typeof value==='function'){
        target[prop]=function(e){
          let freshFinal='',freshInterim='';
          for(let i=e.resultIndex;i<e.results.length;i++){
            const chunk=String(e.results[i]?.[0]?.transcript||'').trim();
            if(!chunk)continue;
            if(e.results[i].isFinal)freshFinal+=' '+chunk;else freshInterim+=' '+chunk;
          }
          if(freshFinal.trim())finals=(finals+' '+freshFinal).replace(/\s+/g,' ').trim();
          interim=freshInterim.replace(/\s+/g,' ').trim();
          let result;
          try{result=value.call(target,e)}finally{
            const combined=(finals+' '+interim).replace(/\s+/g,' ').trim();
            if(combined){persistTranscript(qid||activeQuestionId,combined);diag(qid||activeQuestionId,'recognition-result',e.results?.length||0)}
          }
          return result;
        };
        return true;
      }
      if(prop==='onerror'&&typeof value==='function'){
        target[prop]=function(e){diag(qid||activeQuestionId,'recognition-error',e?.error||e?.message||'unknown');return value.call(target,e)};
        return true;
      }
      if(prop==='onstart'&&typeof value==='function'){
        target[prop]=function(e){diag(qid||activeQuestionId,'recognition-start');return value.call(target,e)};
        return true;
      }
      if(prop==='onend'&&typeof value==='function'){
        target[prop]=function(e){const combined=(finals+' '+interim).replace(/\s+/g,' ').trim();if(combined)persistTranscript(qid||activeQuestionId,combined);diag(qid||activeQuestionId,'recognition-end',combined?'text-saved':'no-text');return value.call(target,e)};
        return true;
      }
      target[prop]=value;return true;
    }
  });
}
try{WrappedRecognition.prototype=Native.prototype}catch{}
if(window.SpeechRecognition)window.SpeechRecognition=WrappedRecognition;
if(window.webkitSpeechRecognition)window.webkitSpeechRecognition=WrappedRecognition;
window.fetch=async function(input,init){
  try{
    const url=typeof input==='string'?input:input?.url||'';
    if(url.includes('/functions/v1/vivace-discovery-submit')&&init?.method?.toUpperCase()==='POST'&&typeof init.body==='string'){
      const body=JSON.parse(init.body);
      if(body?.action==='prepare'){
        body.liveTranscriptionDiagnostics=readJson(DIAG_KEY,[]).slice(-50);
        init={...init,body:JSON.stringify(body)};
      }
    }
  }catch{}
  return nativeFetch(input,init);
};
})();
