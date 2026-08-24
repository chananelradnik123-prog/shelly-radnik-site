(()=>{'use strict';

window.__vivaceAudioEnabled=true;

const FORM_STORAGE_KEY='vivace-owner-short-v15';
const REQUIRED_IDS=new Set(['1','2','3','4','5','6','7','8','9','10','11','12','13','14']);
const $=(selector,root=document)=>root.querySelector(selector);
const $$=(selector,root=document)=>Array.from(root.querySelectorAll(selector));
let saveTimer=null;
let lastRequirementState='';

const questions=[
 {id:1,title:'באיזה סניף נריץ את הפיילוט הראשון?',tag:'בחירה אחת',body:radio('pilot_branch',['קריית יערים','בית שמש','סניף אחר'])+textInput('pilot_branch_other','אם בחרת סניף אחר — כתוב את שמו')},
 {id:2,title:'איזו תוצאה הכי דחוף לך לשפר ב־90 הימים הקרובים?',tag:'בחירה אחת',body:radio('urgent_result',['לדעת מה צפוי להיכנס ומתי','לא לפספס תשלום או זיכוי','לקצר רדיפה ידנית אחרי מידע ומסמכים','לראות חריגות לפני שהן הופכות לבעיה','לקבל תמונת מצב יומית של הסניף'])},
 {id:3,title:'איזו החלטה פיננסית אתה מקבל היום בלי תמונה מהירה ואמינה מספיק?',tag:'משפט אחד',body:textarea('uncertain_decision','לדוגמה: האם צריך לטפל בתקבול שחסר?')},
 {id:4,title:'מה חייב להופיע במסך הבוקר שלך? סמן עד 5.',tag:'עד 5',body:checkboxes('morning_view',['תקבולים צפויים','תשלומים קרובים','זיכוי או תקבול שחסר','חשבוניות ממתינות','משימות אישור פתוחות','חריגה בין מקורות מידע','מצב הסניף','התראות שעדיין לא טופלו','אחר'],5)+textInput('morning_view_other','אם בחרת אחר — כתוב בקצרה')},
 {id:5,title:'על אילו אירועים אתה רוצה התראה מיידית? סמן עד 5.',tag:'עד 5',body:checkboxes('instant_alerts',['תקבול או זיכוי שלא הגיעו','פער בין שני מקורות מידע','חשבונית כפולה או חסרה','תשלום קרוב שעדיין לא אושר','מסמך שממתין יותר מדי זמן','חריגת קופה','משימה קריטית שלא בוצעה','אחר'],5)+textInput('instant_alerts_other','אם בחרת אחר — כתוב בקצרה')},
 {id:6,title:'אילו מערכות כבר מחזיקות את המידע שנחוץ לפיילוט?',tag:'סמן את הקיים',body:checkboxes('existing_systems',['Tabit','Wolt','Cibus / Pluxee','10bis','סליקה / בנק','הנהלת חשבונות','מערכת חשבוניות / ספקים','Excel / Google Sheets','WhatsApp','מערכת אחרת'])+textInput('existing_systems_other','אם בחרת מערכת אחרת — כתוב את שמה')},
 {id:7,title:'מאיזו מערכת הכי חשוב להתחיל למשוך מידע לפיילוט?',tag:'בחירה אחת',body:select('first_system',[['','בחר מערכת'],['לא בטוח','לא בטוח']],'האפשרויות יתעדכנו לפי השאלה הקודמת')},
 {id:8,title:'עד כמה אתה סומך היום על התמונה שאתה מקבל לפני החלטה פיננסית?',tag:'דירוג 1–5',body:rating('trust_level')},
 {id:9,title:'כמה שעות בשבוע, בערך, מושקעות באיסוף מידע, בדיקה, התאמות ורדיפה?',tag:'מספר',body:numberWithUnknown('hours_per_week','מספר שעות בשבוע')},
 {id:10,title:'כמה פעמים בחודש האחרון נדרש בירור ידני בגלל תקבול, זיכוי, תשלום או מסמך לא ברור?',tag:'מספר',body:numberWithUnknown('manual_checks_month','מספר אירועים בחודש')},
 {id:11,title:'כמה זמן עובר בדרך כלל מאירוע שדורש בדיקה עד שאתה יודע עליו בוודאות?',tag:'בחירה אחת',body:radio('discovery_delay',['בזמן אמת','עד סוף היום','יום–יומיים','יותר מיומיים','לא עקבי'])},
 {id:12,title:'מי יטפל בפיילוט ביום־יום מצד העסק?',tag:'שם ותפקיד',body:textInput('pilot_owner_name','שם')+radio('pilot_owner_role',['בעלים','מנהל סניף','מזכירה / משרד','הנהלת חשבונות','אחר'])+textInput('pilot_owner_role_other','אם בחרת אחר — כתוב תפקיד')},
 {id:13,title:'מי צריך לראות את מסך השליטה בפיילוט?',tag:'בחירה מרובה',body:checkboxes('dashboard_viewers',['בעלים בלבד','בעלים ומנהל סניף','בעלים ומשרד','מנהל סניף בלבד','הנהלת חשבונות','אחר'])+textInput('dashboard_viewers_other','אם בחרת אחר — כתוב תפקיד')},
 {id:14,title:'איזה מדד יוכיח לך שהפיילוט הצליח בתוך 90 יום?',tag:'מדד ויעד',body:select('success_metric',[['','בחר מדד'],['פחות שעות עבודה ידנית בשבוע','פחות שעות עבודה ידנית בשבוע'],['פחות בירורים ידניים בחודש','פחות בירורים ידניים בחודש'],['קיצור זמן גילוי חריגות','קיצור זמן גילוי חריגות'],['יותר פריטים שנסגרים בזמן','יותר פריטים שנסגרים בזמן']])+numberInput('success_target','יעד מספרי — לדוגמה 3 שעות פחות בשבוע')},
 {id:15,title:'מה עלול לעצור את הפיילוט אם לא נטפל בו מראש?',tag:'לא חובה',body:textarea('pilot_blocker','עד שני משפטים: גישה למערכת, בעל תפקיד חסר, תהליך לא מסודר או עומס צוות')}
];
window.__vivaceActiveQuestionIds=questions.map(question=>question.id);

function escapeHtml(value){return String(value).replace(/[&<>\"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[char]))}
function radio(name,options){return `<div class="v15-options" role="radiogroup">${options.map(value=>`<label class="v15-option"><input type="radio" name="${name}" value="${escapeHtml(value)}"><span>${escapeHtml(value)}</span></label>`).join('')}</div>`}
function checkboxes(name,options,limit=0){return `<div class="v15-options" data-choice-group="${name}"${limit?` data-limit="${limit}"`:''}>${options.map(value=>`<label class="v15-option"><input type="checkbox" name="${name}" value="${escapeHtml(value)}"><span>${escapeHtml(value)}</span></label>`).join('')}</div>${limit?`<div class="v15-counter" data-counter-for="${name}" aria-live="polite">0 מתוך ${limit}</div>`:''}`}
function textInput(name,placeholder){return `<label class="v15-field"><span class="sr-only">${escapeHtml(placeholder)}</span><input type="text" name="${name}" placeholder="${escapeHtml(placeholder)}" autocomplete="off"></label>`}
function numberInput(name,placeholder){return `<label class="v15-field"><span class="sr-only">${escapeHtml(placeholder)}</span><input type="number" min="0" step="1" inputmode="numeric" name="${name}" placeholder="${escapeHtml(placeholder)}"></label>`}
function textarea(name,placeholder){return `<label class="v15-field"><span class="sr-only">${escapeHtml(placeholder)}</span><textarea name="${name}" rows="2" placeholder="${escapeHtml(placeholder)}"></textarea></label>`}
function select(name,options,hint=''){return `<label class="v15-field"><span class="sr-only">בחר אפשרות</span><select name="${name}">${options.map(([value,label])=>`<option value="${escapeHtml(value)}">${escapeHtml(label)}</option>`).join('')}</select>${hint?`<small>${escapeHtml(hint)}</small>`:''}</label>`}
function rating(name){return `<div class="v15-rating" role="radiogroup" aria-label="דירוג אמון מ־1 עד 5">${[1,2,3,4,5].map(value=>`<label><input type="radio" name="${name}" value="${value}"><span>${value}</span></label>`).join('')}</div><div class="v15-rating-labels"><span>לא סומך</span><span>סומך מאוד</span></div>`}
function numberWithUnknown(name,placeholder){return `${numberInput(name,placeholder)}<label class="v15-unknown"><input type="checkbox" name="${name}_unknown" value="לא יודע" data-unknown-for="${name}"><span>לא יודע</span></label>`}
function audioRecorder(id){return `<div class="audio-recorder" data-recorder-for="${id}"><button aria-label="הקלטת תשובה לשאלה ${id}" class="record-button" data-action="record" type="button" disabled><svg aria-hidden="true" class="mic-icon" viewBox="0 0 24 24"><path d="M12 15.5a3.5 3.5 0 0 0 3.5-3.5V6a3.5 3.5 0 1 0-7 0v6a3.5 3.5 0 0 0 3.5 3.5Z" fill="none" stroke="currentColor" stroke-width="1.8"></path><path d="M5.8 11.5a6.2 6.2 0 0 0 12.4 0M12 17.7V21M9 21h6" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.8"></path></svg><span class="record-label">הקלט תשובה</span><span aria-live="polite" class="record-timer">00:00</span></button><span aria-live="polite" class="record-status">יש לאשר את הסכמת התמלול לפני הקלטה</span><div class="record-playback" hidden></div></div>`}

function questionMarkup(question){
 return `<article class="v15-question interactive-question" id="question-${question.id}" data-question-id="${question.id}" data-question-title="${escapeHtml(question.title)}" data-required="${REQUIRED_IDS.has(String(question.id))?'true':'false'}">
  <div class="v15-question-head"><span class="qnum">${question.id}</span><div><h2 class="qtitle">${escapeHtml(question.title)}</h2><span class="qtag">${escapeHtml(question.tag)}</span></div></div>${audioRecorder(question.id)}
  <div class="v15-answer">${question.body}</div>
  <div class="v15-error" aria-live="polite"></div>
 </article>`;
}

function formMarkup(){
 return `<main class="v15-shell" id="v15ShortForm">
  <section class="v15-intro" aria-labelledby="v15IntroTitle">
   <div><span class="v15-kicker">OWNER DISCOVERY · PILOT</span><h1 id="v15IntroTitle">15 שאלות. פיילוט אחד. החלטה ברורה.</h1><p>6–8 דקות כדי לבחור את הפיילוט הראשון של Vivace OS. מחברים את המערכות הקיימות למסך שליטה, התראות ופעולות ברורות.</p></div>
   <div class="v15-privacy"><strong>אפשר לענות גם בהקלטה.</strong><span>ההקלטה נשמרת במערכת Vivace OS ונשלחת ל־Google Gemini לצורך תמלול. השאלון לא מבקש יתרות או סכומים פרטיים; אין למסור סיסמאות, פרטי כרטיס, מספרי תעודה או מידע שאינו נחוץ.</span></div>
   <div class="v15-identity">
    <label><span>שם ממלא השאלון</span><input id="v15RespondentName" name="respondent_name" type="text" autocomplete="name"></label>
    <label><span>תפקיד</span><input id="v15RespondentRole" name="respondent_role" type="text" autocomplete="organization-title"></label>
   </div>
   <label class="v15-consent"><input id="v15PrivacyAck" name="privacy_ack" type="checkbox"><span>אם אשתמש בהקלטה, אני מאשר שהאודיו והתוכן שבו יעובדו באמצעות Google Gemini לצורך תמלול. לא אמסור מידע שאינו נחוץ.</span></label>
  </section>
  <form id="v15Questions" novalidate>
   ${questions.slice(0,5).map(questionMarkup).join('')}
   <div class="v15-divider"><span>מערכות וקו בסיס</span></div>
   ${questions.slice(5,10).map(questionMarkup).join('')}
   <div class="v15-divider"><span>אחריות והצלחת הפיילוט</span></div>
   ${questions.slice(10).map(questionMarkup).join('')}
  </form>
  <section class="v15-closing" aria-live="polite"><div><strong id="v15ClosingTitle">נשארו שאלות חובה.</strong><span id="v15ClosingText">הטיוטה נשמרת אוטומטית במכשיר הזה.</span></div><div class="v15-check" aria-hidden="true">✓</div></section>
 </main>`;
}

function styles(){
 const style=document.createElement('style');style.id='v15Styles';style.textContent=`
  :root{--v15-green:#14392D;--v15-cream:#F7F3EA;--v15-gold:#D6B36C;--v15-orange:#C86D4E;--v15-ink:#173027;--v15-line:#D8DDD8}
  html,body{background:#dfe5e1;color:var(--v15-ink);overflow-x:hidden}
  body{display:block!important;min-height:100vh;text-align:initial!important}
  .sr-only{position:absolute!important;width:1px!important;height:1px!important;padding:0!important;margin:-1px!important;overflow:hidden!important;clip:rect(0,0,0,0)!important;white-space:nowrap!important;border:0!important}
  @media screen{.page.cover{width:min(900px,calc(100% - 28px));height:auto;min-height:760px;margin:18px auto 0;border-radius:24px;overflow:hidden;box-shadow:0 18px 60px rgba(20,57,45,.16)}.cover-main{margin-top:80px}.network{bottom:75px;height:300px}.cover-bottom{bottom:20px}}
  .v15-shell{width:min(900px,calc(100% - 28px));margin:18px auto 60px;direction:rtl}
  .v15-intro,.v15-question,.v15-closing{background:var(--v15-cream);border:1px solid rgba(20,57,45,.12);box-shadow:0 12px 34px rgba(20,57,45,.08)}
  .v15-intro{border-radius:24px;padding:30px;margin-bottom:16px}.v15-kicker{display:block;color:var(--v15-orange);font-size:12px;font-weight:900;letter-spacing:1.3px}.v15-intro h1{margin:7px 0 8px;color:var(--v15-green);font-size:30px;line-height:1.25}.v15-intro p{margin:0;color:#536a60;font-size:16px;line-height:1.65;max-width:720px}.v15-privacy{display:flex;flex-direction:column;gap:3px;margin-top:18px;padding:14px 16px;border-radius:14px;background:#efe6d6;color:#5d4a2f}.v15-privacy strong{font-size:15px}.v15-privacy span{font-size:13px;line-height:1.5}.v15-identity{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:18px}.v15-identity label>span{display:block;font-size:13px;font-weight:800;margin-bottom:6px}.v15-identity input,.v15-field input,.v15-field textarea,.v15-field select{width:100%;min-height:48px;border:1px solid #bdcac3;border-radius:12px;background:#fffdf8;color:var(--v15-ink);padding:11px 13px;font:inherit;font-size:15px;direction:rtl}.v15-field textarea{min-height:74px;resize:vertical}.v15-field small{display:block;margin-top:5px;color:#6b7d75;font-size:12px}.v15-consent{display:flex;align-items:flex-start;gap:9px;margin-top:16px;font-size:13px;line-height:1.5;color:#3d554b}.v15-consent input{width:20px;height:20px;flex:0 0 20px;margin-top:1px;accent-color:var(--v15-green)}
  #v15Questions{display:grid;gap:12px}.v15-question{border-radius:20px;padding:22px 24px}.v15-question-head{display:grid;grid-template-columns:42px 1fr;gap:12px;align-items:start}.v15-question .qnum{width:40px;min-width:40px;height:40px;padding:0;border-radius:12px;background:var(--v15-green);color:var(--v15-gold);display:grid;place-items:center;font-size:15px}.v15-question .qtitle{font-size:18px;line-height:1.45;margin:0;color:var(--v15-green)}.v15-question .qtag{display:inline-block;margin:5px 0 0;background:#eee3d1;color:#7b5d35;font-size:11px;padding:3px 8px;border-radius:999px}.v15-question>.audio-recorder{margin:14px 54px 0 0}.v15-question>.audio-recorder .record-button{min-height:40px;padding:8px 13px;font-size:13px}.v15-question>.audio-recorder .record-status{font-size:12px;line-height:1.45}.v15-question>.audio-recorder .record-button:disabled{opacity:.55;cursor:not-allowed}.v15-answer{margin:16px 54px 0 0}.v15-options{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.v15-option{position:relative;display:block}.v15-option input{position:absolute;opacity:0;pointer-events:none}.v15-option span{display:flex;align-items:center;min-height:48px;border:1px solid #cad4cf;border-radius:12px;background:#fffdf8;padding:10px 13px;font-size:14px;line-height:1.35;cursor:pointer;transition:.16s}.v15-option span::before{content:'';width:18px;height:18px;flex:0 0 18px;margin-left:9px;border:1.5px solid #8ca096;border-radius:5px}.v15-option input[type=radio]+span::before{border-radius:50%}.v15-option input:checked+span{border-color:var(--v15-orange);background:#f7eae4;box-shadow:0 0 0 1px rgba(200,109,78,.16)}.v15-option input:checked+span::before{background:var(--v15-orange);border-color:var(--v15-orange);box-shadow:inset 0 0 0 4px #f7eae4}.v15-option input:focus-visible+span,.v15-field input:focus,.v15-field textarea:focus,.v15-field select:focus,.v15-identity input:focus{outline:3px solid rgba(214,179,108,.5);outline-offset:2px}.v15-field{display:block;margin-top:10px}.v15-counter{margin-top:7px;color:#687970;font-size:12px}.v15-rating{display:grid;grid-template-columns:repeat(5,1fr);gap:8px}.v15-rating label{position:relative}.v15-rating input{position:absolute;opacity:0}.v15-rating span{display:grid;place-items:center;min-height:48px;border:1px solid #cad4cf;border-radius:12px;background:#fffdf8;font-weight:900;cursor:pointer}.v15-rating input:checked+span{background:var(--v15-green);border-color:var(--v15-green);color:#fff}.v15-rating input:focus-visible+span{outline:3px solid rgba(214,179,108,.5);outline-offset:2px}.v15-rating-labels{display:flex;justify-content:space-between;margin-top:5px;color:#6b7d75;font-size:11px}.v15-unknown{display:flex;align-items:center;gap:8px;margin-top:9px;font-size:13px}.v15-unknown input{width:19px;height:19px;accent-color:var(--v15-green)}.v15-error{min-height:18px;margin:8px 54px 0 0;color:#9c3d2f;font-size:12px;font-weight:700}.v15-question.is-answered{border-color:#9cbcac}.v15-question.has-error{border-color:#cc725f;box-shadow:0 0 0 2px rgba(200,109,78,.12)}.v15-divider{margin:14px 0 2px;color:var(--v15-orange);font-size:13px;font-weight:900;letter-spacing:.7px}.v15-closing{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-top:16px;border-radius:20px;padding:22px 24px;background:var(--v15-green);color:#fff}.v15-closing strong{display:block;font-size:20px}.v15-closing span{display:block;margin-top:4px;color:#c9d7d0;font-size:13px}.v15-check{font-size:38px;color:var(--v15-gold)}.v15-shell #v9FinalSubmit{margin-top:16px}.v15-audio-note{margin:10px 0 0;text-align:center;color:#d8e2dd;font-size:12px}.app-toolbar{grid-template-columns:minmax(180px,1fr) minmax(220px,460px) auto}.toolbar-button{min-height:42px}.submit-overlay{display:none!important}
  @media(max-width:820px){.page.cover{width:100%;margin:0;border-radius:0;min-height:760px}.cover-main{margin-top:74px}.network{bottom:78px;height:310px}.v15-shell{width:100%;margin:0 0 36px}.v15-intro{border-radius:0;padding:22px 16px;margin:0;border-width:0 0 1px}.v15-intro h1{font-size:25px}.v15-intro p{font-size:14px}.v15-identity{grid-template-columns:1fr}.v15-question{border-radius:0;border-width:0 0 1px;padding:18px 15px;box-shadow:none}.v15-question-head{grid-template-columns:38px 1fr;gap:9px}.v15-question .qnum{width:36px;min-width:36px;height:36px}.v15-question .qtitle{font-size:16px}.v15-question>.audio-recorder,.v15-answer{margin:14px 0 0}.v15-options{grid-template-columns:1fr}.v15-error{margin:7px 0 0}.v15-closing{border-radius:0;margin:0;padding:20px 16px}.v15-rating{gap:5px}.v15-rating span{min-height:44px}.app-toolbar{grid-template-columns:1fr}.toolbar-actions{display:grid;grid-template-columns:1fr 1fr}.toolbar-brand{display:none}}
  @media print{.page.cover{display:none}.v15-shell{width:100%;margin:0}.v15-question{break-inside:avoid;box-shadow:none}.app-toolbar{display:none!important}}
 `;document.head.appendChild(style);
}

function loadSaved(){
 let saved={};try{saved=JSON.parse(localStorage.getItem(FORM_STORAGE_KEY)||'{}')||{}}catch{}
 const form=$('#v15ShortForm');if(!form)return;
 $$('input,textarea,select',form).forEach(element=>{
  const value=saved[element.name];if(value===undefined)return;
  if(element.type==='checkbox')element.checked=Array.isArray(value)?value.includes(element.value):Boolean(value);
  else if(element.type==='radio')element.checked=value===element.value;
  else element.value=String(value);
 });
}

function collectSaved(){
 const form=$('#v15ShortForm'),saved={};if(!form)return saved;
 $$('input,textarea,select',form).forEach(element=>{
  if(!element.name)return;
  if(element.type==='checkbox'){
   if(element.name==='privacy_ack'){saved[element.name]=element.checked;return}
   if(!Array.isArray(saved[element.name]))saved[element.name]=[];
   if(element.checked)saved[element.name].push(element.value);
  }else if(element.type==='radio'){if(element.checked)saved[element.name]=element.value}
  else saved[element.name]=element.value;
 });return saved;
}

function persist(){clearTimeout(saveTimer);const saveState=$('#saveState');if(saveState)saveState.textContent='שומר…';saveTimer=setTimeout(()=>{try{localStorage.setItem(FORM_STORAGE_KEY,JSON.stringify(collectSaved()));if(saveState){saveState.textContent='נשמר עכשיו';setTimeout(()=>{saveState.textContent='נשמר במכשיר'},1200)}}catch{if(saveState)saveState.textContent='נשמר זמנית'}},250)}

function selectedValue(name){return $(`input[name="${name}"]:checked`)?.value||''}
function checkedValues(name){return $$(`input[name="${name}"]:checked`).map(input=>input.value)}
function fieldValue(name){return $(`[name="${name}"]`)?.value?.trim()||''}
function nonNegativeInteger(value){return /^\d+$/.test(String(value||''))}

function isAnswered(card){
 if(card.dataset.hasRecording==='true')return true;
 const id=Number(card.dataset.questionId);
 if(id===1)return Boolean(selectedValue('pilot_branch'))&&(selectedValue('pilot_branch')!=='סניף אחר'||Boolean(fieldValue('pilot_branch_other')));
 if(id===2)return Boolean(selectedValue('urgent_result'));
 if(id===3)return Boolean(fieldValue('uncertain_decision'));
 if(id===4)return checkedValues('morning_view').length>0&&(checkedValues('morning_view').includes('אחר')?Boolean(fieldValue('morning_view_other')):true);
 if(id===5)return checkedValues('instant_alerts').length>0&&(checkedValues('instant_alerts').includes('אחר')?Boolean(fieldValue('instant_alerts_other')):true);
 if(id===6)return checkedValues('existing_systems').length>0&&(checkedValues('existing_systems').includes('מערכת אחרת')?Boolean(fieldValue('existing_systems_other')):true);
 if(id===7)return Boolean(fieldValue('first_system'));
 if(id===8)return Boolean(selectedValue('trust_level'));
 if(id===9)return nonNegativeInteger(fieldValue('hours_per_week'))||$('[name="hours_per_week_unknown"]')?.checked;
 if(id===10)return nonNegativeInteger(fieldValue('manual_checks_month'))||$('[name="manual_checks_month_unknown"]')?.checked;
 if(id===11)return Boolean(selectedValue('discovery_delay'));
 if(id===12)return Boolean(fieldValue('pilot_owner_name'))&&Boolean(selectedValue('pilot_owner_role'))&&(selectedValue('pilot_owner_role')!=='אחר'||Boolean(fieldValue('pilot_owner_role_other')));
 if(id===13)return checkedValues('dashboard_viewers').length>0&&(checkedValues('dashboard_viewers').includes('אחר')?Boolean(fieldValue('dashboard_viewers_other')):true);
 if(id===14)return Boolean(fieldValue('success_metric'))&&nonNegativeInteger(fieldValue('success_target'));
 if(id===15)return Boolean(fieldValue('pilot_blocker'));
 return false;
}

function updateSystemSelect(){
 const selectEl=$('[name="first_system"]');if(!selectEl)return;
 const current=selectEl.value,systems=checkedValues('existing_systems').map(value=>value==='מערכת אחרת'?fieldValue('existing_systems_other'):value).filter(Boolean);
 const values=[...new Set(systems)];selectEl.innerHTML='<option value="">בחר מערכת</option>'+values.map(value=>`<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join('')+'<option value="לא בטוח">לא בטוח</option>';
 if([...values,'לא בטוח'].includes(current))selectEl.value=current;
}

function showToast(message){
 const existing=$('#toast');if(existing){existing.textContent=message;existing.classList.add('show');clearTimeout(showToast.timer);showToast.timer=setTimeout(()=>existing.classList.remove('show'),3600);return}
 let toast=document.createElement('div');toast.id='v15Toast';toast.textContent=message;toast.style.cssText='position:fixed;left:16px;right:16px;bottom:18px;z-index:999999;background:#14392D;color:#fff;padding:13px 16px;border-radius:12px;text-align:center;font-weight:700';document.body.appendChild(toast);setTimeout(()=>toast.remove(),3600);
}

function updateCounters(){
 $$('[data-counter-for]').forEach(counter=>{const name=counter.dataset.counterFor,limit=Number($(`[data-choice-group="${name}"]`)?.dataset.limit||0);counter.textContent=`${checkedValues(name).length} מתוך ${limit}`});
}

function enhanceSubmit(){
 const card=$('#v9FinalSubmit');if(!card)return;
 const copy=$('div[style*="font-size:14px"]',card);if(copy)copy.textContent='סיימת? התשובות וההקלטות נשלחות בצורה מאובטחת. ההקלטות עוברות בדיקת איכות ונשלחות ל־Google Gemini לצורך תמלול.';
 const button=$('#v9Send',card),status=$('#v9Status',card);if(button&&button.dataset.inviteGate!=='1'){button.disabled=true;button.style.opacity='.55';button.style.cursor='not-allowed';if(status&&!status.textContent)status.textContent='מאמת קישור הזמנה…'}
 if(!$('.v15-audio-note',card)){const note=document.createElement('div');note.className='v15-audio-note';note.textContent='אין למסור בהקלטה סיסמאות, פרטי כרטיס, מספרי תעודה או מידע שאינו נחוץ.';$('#v9Status',card)?.insertAdjacentElement('afterend',note)}
}

function syncAudioConsent(){
 const approved=Boolean($('#v15PrivacyAck')?.checked);
 $$('.audio-recorder').forEach(box=>{const button=$('.record-button',box),status=$('.record-status',box),recorded=box.closest('.v15-question')?.dataset.hasRecording==='true';if(button)button.disabled=!approved;if(status&&!button?.classList.contains('recording'))status.textContent=approved?(recorded?'ההקלטה נשמרה וניתן להאזין לה':'אפשר לענות בקול במקום להקליד'):(recorded?'ההקלטה שמורה במכשיר; יש לאשר כדי לתמלל ולשלוח':'יש לאשר את הסכמת התמלול לפני הקלטה')});
}

function updateProgress({showErrors=false}={}){
 const cards=$$('.v15-question'),required=cards.filter(card=>REQUIRED_IDS.has(card.dataset.questionId)),answeredRequired=required.filter(isAnswered),optionalAnswered=cards.filter(card=>!REQUIRED_IDS.has(card.dataset.questionId)&&isAnswered(card)),missing=required.filter(card=>!isAnswered(card));
 cards.forEach(card=>{const ok=isAnswered(card);card.classList.toggle('is-answered',ok);if(showErrors&&REQUIRED_IDS.has(card.dataset.questionId)&&!ok){card.classList.add('has-error');$('.v15-error',card).textContent='צריך להשלים את השאלה לפני השליחה.'}else{card.classList.remove('has-error');$('.v15-error',card).textContent=''}});
 const progressText=$('#progressText'),progressBar=$('#progressBar');if(progressText)progressText.textContent=`${answeredRequired.length} מתוך 14 שאלות חובה${optionalAnswered.length?' · שאלת הרשות נענתה':''}`;if(progressBar)progressBar.style.width=`${Math.round(answeredRequired.length/required.length*100)}%`;
 const nameReady=Boolean($('#v15RespondentName')?.value.trim()),roleReady=Boolean($('#v15RespondentRole')?.value.trim()),privacyReady=Boolean($('#v15PrivacyAck')?.checked),missingCount=missing.length+(nameReady?0:1)+(roleReady?0:1)+(privacyReady?0:1),complete=missingCount===0;
 document.documentElement.dataset.vivaceRequiredComplete=complete?'1':'0';document.documentElement.dataset.vivaceMissingRequired=String(missingCount);
 const requirementState=`${complete?'1':'0'}:${missingCount}`;if(lastRequirementState!==requirementState){lastRequirementState=requirementState;document.dispatchEvent(new CustomEvent('vivace:requirements-changed',{detail:{complete,missing:missingCount}}))}
 const title=$('#v15ClosingTitle'),text=$('#v15ClosingText');if(title&&text){if(complete){title.textContent='השאלון מוכן לשליחה.';text.textContent='כל שאלות החובה, פרטי הממלא ואישור הפרטיות הושלמו.'}else{const count=Number(document.documentElement.dataset.vivaceMissingRequired);title.textContent=`נשארו ${count} פריטים להשלמה.`;text.textContent='הטיוטה נשמרת אוטומטית במכשיר הזה.'}}
 enhanceSubmit();return{complete,missing};
}

function bind(){
 const shell=$('#v15ShortForm');if(!shell)return;
 shell.addEventListener('change',event=>{
  const input=event.target;
  const group=input.closest?.('[data-limit]');if(group&&input.type==='checkbox'&&input.checked){const limit=Number(group.dataset.limit||0),checked=$$('input[type="checkbox"]:checked',group);if(limit&&checked.length>limit){input.checked=false;showToast(`אפשר לבחור עד ${limit} אפשרויות בשאלה הזאת`)}}
  const unknownFor=input.dataset?.unknownFor;if(unknownFor){const number=$(`[name="${unknownFor}"]`);if(number){number.disabled=input.checked;if(input.checked)number.value=''}}
  if(input.name==='existing_systems'||input.name==='existing_systems_other')updateSystemSelect();
  if(input.id==='v15PrivacyAck')syncAudioConsent();
  updateCounters();updateProgress();persist();
 });
 shell.addEventListener('input',event=>{if(event.target.name==='existing_systems_other')updateSystemSelect();updateProgress();persist()});
 document.addEventListener('click',event=>{
  const button=event.target.closest?.('#submitAnswers,#v9Send');if(!button)return;
  const result=updateProgress({showErrors:true});
  if(!result.complete){event.preventDefault();event.stopImmediatePropagation();const first=$('.has-error')||(!$('#v15RespondentName')?.value.trim()?$('#v15RespondentName'):!$('#v15RespondentRole')?.value.trim()?$('#v15RespondentRole'):!$('#v15PrivacyAck')?.checked?$('#v15PrivacyAck'):null);first?.scrollIntoView({behavior:'smooth',block:'center'});first?.focus?.();showToast('יש להשלים את שאלות החובה ופרטי הממלא לפני השליחה.');return}
  if(button.id==='v9Send')return;
  event.preventDefault();event.stopImmediatePropagation();
  const submit=$('#v9FinalSubmit');submit?.scrollIntoView({behavior:'smooth',block:'center'});$('#v9Send')?.focus();
 },true);
 $('#saveDraft')?.addEventListener('click',()=>{persist();showToast('הטיוטה נשמרה במכשיר')});
 const recordingObserver=new MutationObserver(()=>{syncAudioConsent();updateProgress()});recordingObserver.observe(shell,{subtree:true,attributes:true,attributeFilter:['data-has-recording']});
 setTimeout(()=>{enhanceSubmit();updateProgress()},1000);
 setTimeout(()=>{enhanceSubmit();updateProgress()},1700);
}

function boot(){
 $('#vivaceBuildBadge')?.remove();
 $$('.page:not(.cover),.interactive-intro,#submitOverlay').forEach(element=>element.remove());
 if(!$('#v15Styles'))styles();
 const cover=$('.page.cover');if(!cover||$('#v15ShortForm'))return;
 cover.insertAdjacentHTML('afterend',formMarkup());
 const brandSmall=$('.toolbar-brand small');if(brandSmall)brandSmall.textContent='שאלון קצר לבעלים';
 if(!$('#submitAnswers')){const actions=$('.toolbar-actions');if(actions)actions.insertAdjacentHTML('beforeend','<button class="toolbar-button primary" id="submitAnswers" type="button">בדוק ושלח</button>')}
 loadSaved();updateSystemSelect();updateCounters();bind();syncAudioConsent();updateProgress();
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();
