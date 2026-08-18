(() => {
  'use strict';

  const DESTINATION_EMAIL = 'chananelradnik123@gmail.com';
  const FORMSUBMIT_URL = `https://formsubmit.co/ajax/${DESTINATION_EMAIL}`;
  const AUDIO_DB = 'vivace-owner-discovery-audio-v1';
  const AUDIO_STORE = 'recordings';
  const MAX_EMAIL_ATTACHMENT = 8.5 * 1024 * 1024;
  const AUDIO_GROUP_TARGET = 6.3 * 1024 * 1024;

  const $ = (s, r=document) => r.querySelector(s);
  const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));

  function toast(msg, ms=3500) {
    let el = $('#toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'toast';
      el.className = 'toast';
      el.setAttribute('role','status');
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(el._v6Timer);
    el._v6Timer = setTimeout(() => el.classList.remove('show'), ms);
  }

  function injectStyles() {
    const st = document.createElement('style');
    st.textContent = `
      .v6-submit-card{margin:30px 0 10px;padding:26px 24px;border:1px solid #d7d8d1;border-radius:22px;background:linear-gradient(180deg,#f8f5ee,#f0e8d8);box-shadow:0 14px 36px rgba(20,57,45,.10);text-align:right}
      .v6-submit-card .kicker{display:inline-block;color:#b75b35;font-size:12px;font-weight:800;letter-spacing:.08em;margin-bottom:7px}
      .v6-submit-card h3{margin:0;color:#14392d;font-size:24px;line-height:1.3}
      .v6-submit-card p{margin:8px 0 18px;color:#58665f;font-size:14px;line-height:1.7}
      .v6-submit-btn{width:100%;min-height:56px;border:0;border-radius:14px;background:#14392d;color:#fff;font-family:inherit;font-size:16px;font-weight:800;cursor:pointer;box-shadow:0 9px 22px rgba(20,57,45,.18)}
      .v6-submit-btn:disabled{opacity:.55;cursor:wait}
      .v6-backup-btn{display:block;margin:10px auto 0;padding:8px 12px;border:0;background:transparent;color:#6f756f;font-family:inherit;font-size:12px;font-weight:650;text-decoration:underline;cursor:pointer}
      .v6-send-status{min-height:22px;margin-top:10px;color:#14392d;font-size:13px;font-weight:700;line-height:1.55}
      .v6-send-status.error{color:#9e3526}.v6-send-status.success{color:#1f6d4c}
      .v6-submit-card.sent{border-color:#8db8a0;background:#f2f8f4}
      @media(max-width:820px){.v6-submit-card{margin:24px 0 8px;padding:20px 16px;border-radius:18px}.v6-submit-card h3{font-size:21px}}
    `;
    document.head.appendChild(st);
  }

  function installBottomSubmit() {
    $('#submitAnswers')?.remove();
    $('#submitOverlay')?.remove();

    const closing = $('.closing-card');
    if (!closing || $('#v6SubmitCard')) return;
    const card = document.createElement('div');
    card.id = 'v6SubmitCard';
    card.className = 'v6-submit-card';
    card.innerHTML = `
      <span class="kicker">סיום ושליחה</span>
      <h3>סיימת? שלח את השאלון</h3>
      <p>התשובות, הסימונים וההקלטות יישלחו ישירות לחננאל. אין צורך להוריד קובץ או לבחור אפליקציה.</p>
      <button class="v6-submit-btn" id="v6DirectSubmit" type="button">שלח את השאלון</button>
      <button class="v6-backup-btn" id="v6Backup" type="button">הורד גיבוי למכשיר</button>
      <div class="v6-send-status" id="v6SendStatus" aria-live="polite"></div>
    `;
    closing.insertAdjacentElement('afterend', card);
    $('#v6DirectSubmit').addEventListener('click', sendDirect);
    $('#v6Backup').addEventListener('click', downloadJsonBackup);
  }

  function selectionText(el) {
    if (el.matches('td.check-cell')) {
      const row = el.closest('tr');
      const rowLabel = row?.cells?.[0]?.innerText?.trim() || '';
      const header = el.closest('table')?.rows?.[0]?.cells?.[el.cellIndex]?.innerText?.trim() || '';
      return `${rowLabel}: ${header}`;
    }
    return el.innerText.trim().replace(/\s+/g,' ');
  }

  function collectQuestion(q) {
    const fields = {};
    $$('[data-field-id]', q).forEach(el => {
      const id = el.dataset.fieldId || el.getAttribute('data-field-id');
      const value = el.matches('input,textarea') ? el.value : el.textContent;
      if (id && value?.trim()) fields[id] = value.trim();
    });
    const selections = $$('.cap-card.selected,.choice.selected,.priority-options>div.selected,td.check-cell.selected',q).map(selectionText);
    return {
      id: q.dataset.questionId,
      question: q.dataset.questionTitle || $('.qtitle',q)?.childNodes?.[0]?.textContent?.trim() || '',
      fields,
      selections,
      hasRecording: q.dataset.hasRecording === 'true'
    };
  }

  function answeredCount(questions) {
    return questions.filter(q => Object.keys(q.fields).length || q.selections.length || q.hasRecording).length;
  }

  async function getRecordings() {
    return new Promise((resolve) => {
      const req = indexedDB.open(AUDIO_DB, 1);
      req.onerror = () => resolve([]);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(AUDIO_STORE)) req.result.createObjectStore(AUDIO_STORE,{keyPath:'questionId'});
      };
      req.onsuccess = () => {
        const db=req.result;
        try {
          const tx=db.transaction(AUDIO_STORE,'readonly');
          const all=tx.objectStore(AUDIO_STORE).getAll();
          all.onsuccess=()=>{db.close();resolve(all.result||[])};
          all.onerror=()=>{db.close();resolve([])};
        } catch { db.close(); resolve([]); }
      };
    });
  }

  function extFor(record) {
    const m=(record.mimeType||record.blob?.type||'').toLowerCase();
    if (m.includes('mp4')||m.includes('m4a')) return 'm4a';
    if (m.includes('ogg')) return 'ogg';
    if (m.includes('wav')) return 'wav';
    return 'webm';
  }

  function summary(payload) {
    const lines=['VIVACE OS — OWNER DISCOVERY',`נשלח: ${new Date(payload.sentAt).toLocaleString('he-IL')}`,`נענו: ${payload.answered} מתוך ${payload.totalQuestions}`,''];
    payload.questions.forEach(q => {
      lines.push(`שאלה ${q.id}: ${q.question}`);
      Object.entries(q.fields).forEach(([k,v])=>lines.push(`  • ${k}: ${v}`));
      if(q.selections.length) lines.push(`  • סימונים: ${q.selections.join(' | ')}`);
      if(q.hasRecording) lines.push('  • קיימת תשובה קולית');
      if(!Object.keys(q.fields).length&&!q.selections.length&&!q.hasRecording) lines.push('  • ללא תשובה');
      lines.push('');
    });
    return lines.join('\n');
  }

  async function makePackages() {
    if (!window.JSZip) throw new Error('ZIP_NOT_READY');
    const questions=$$('.interactive-question').map(collectQuestion);
    const recordings=await getRecordings();
    const payload={form:'Vivace OS Owner Discovery',version:'v6-direct-email',sentAt:new Date().toISOString(),totalQuestions:questions.length,answered:answeredCount(questions),questions,recordings:recordings.map(r=>({questionId:String(r.questionId),mimeType:r.mimeType||r.blob?.type||'',size:r.blob?.size||0}))};

    const groups=[]; let group=[]; let size=0;
    recordings.sort((a,b)=>Number(a.questionId)-Number(b.questionId)).forEach(r=>{
      const n=r.blob?.size||0;
      if(group.length && size+n>AUDIO_GROUP_TARGET){groups.push(group);group=[];size=0;}
      group.push(r);size+=n;
    });
    if(group.length)groups.push(group);
    if(!groups.length)groups.push([]);

    const files=[];
    for(let i=0;i<groups.length;i++){
      setStatus(groups.length>1?`מכין חלק ${i+1} מתוך ${groups.length}…`:'מכין את החבילה…');
      const zip=new JSZip();
      zip.file('answers.json',JSON.stringify(payload,null,2));
      zip.file('summary.txt',summary(payload));
      const folder=zip.folder('audio');
      groups[i].forEach(r=>{if(r.blob)folder.file(`Q${String(r.questionId).padStart(2,'0')}.${extFor(r)}`,r.blob)});
      const blob=await zip.generateAsync({type:'blob',compression:'DEFLATE',compressionOptions:{level:6}});
      if(blob.size>MAX_EMAIL_ATTACHMENT)throw new Error('PACKAGE_TOO_LARGE');
      const d=new Date().toISOString().slice(0,10),suffix=groups.length>1?`-part-${i+1}-of-${groups.length}`:'';
      files.push(new File([blob],`Vivace-OS-Discovery-${d}${suffix}.zip`,{type:'application/zip'}));
    }
    return {files,payload,recordings};
  }

  function setStatus(msg,type='') {
    const el=$('#v6SendStatus'); if(!el)return;
    el.textContent=msg; el.className=`v6-send-status ${type}`;
  }

  async function postFile(file,index,total,payload) {
    const fd=new FormData();
    fd.append('_subject',`Vivace OS — Discovery${total>1?` (${index}/${total})`:''}`);
    fd.append('_captcha','false');
    fd.append('_template','table');
    fd.append('טופס','Vivace OS Owner Discovery');
    fd.append('נענו',`${payload.answered} מתוך ${payload.totalQuestions}`);
    fd.append('תאריך',new Date().toLocaleString('he-IL'));
    fd.append('הערה','קובץ ZIP מצורף: answers.json + summary.txt + audio');
    fd.append('attachment',file,file.name);
    const res=await fetch(FORMSUBMIT_URL,{method:'POST',body:fd,headers:{Accept:'application/json'}});
    let data={}; try{data=await res.json()}catch{}
    if(!res.ok||data.success===false)throw new Error(data.message||`SEND_${res.status}`);
    return data;
  }

  async function sendDirect() {
    const btn=$('#v6DirectSubmit'); if(!btn||btn.disabled)return;
    btn.disabled=true; btn.textContent='שולח…'; setStatus('אוסף תשובות והקלטות…');
    try{
      const {files,payload,recordings}=await makePackages();
      for(let i=0;i<files.length;i++){
        setStatus(`שולח ${i+1} מתוך ${files.length}${recordings.length?` · ${recordings.length} הקלטות`:''}…`);
        await postFile(files[i],i+1,files.length,payload);
      }
      setStatus('✓ השאלון נשלח בהצלחה','success');
      $('#v6SubmitCard')?.classList.add('sent');
      btn.textContent='✓ נשלח בהצלחה';
      toast('השאלון נשלח בהצלחה לחננאל',4500);
    }catch(err){
      console.error('Vivace direct send failed',err);
      const msg=err?.message==='PACKAGE_TOO_LARGE'?'ההקלטות גדולות מדי לשליחה במייל. הורד גיבוי ופנה לחננאל.':'השליחה לא הושלמה. כל המידע עדיין שמור במכשיר. אפשר לנסות שוב.';
      setStatus(msg,'error'); btn.disabled=false; btn.textContent='נסה לשלוח שוב'; toast(msg,6000);
    }
  }

  async function downloadJsonBackup() {
    const questions=$$('.interactive-question').map(collectQuestion);
    const recordings=await getRecordings();
    const payload={form:'Vivace OS Owner Discovery',version:'v6-backup',exportedAt:new Date().toISOString(),answered:answeredCount(questions),totalQuestions:questions.length,questions,recordings:recordings.map(r=>({questionId:String(r.questionId),mimeType:r.mimeType||r.blob?.type||'',size:r.blob?.size||0}))};
    const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');
    a.href=url;a.download=`Vivace-OS-Discovery-backup-${new Date().toISOString().slice(0,10)}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1200);toast('גיבוי הורד למכשיר');
  }

  function init() {
    injectStyles();
    installBottomSubmit();
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
