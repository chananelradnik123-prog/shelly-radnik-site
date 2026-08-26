(()=>{'use strict';

window.__vivaceAudioEnabled=true;
window.__vivaceUploadRawAudio=false;

const FORM_STORAGE_KEY='vivace-owner-short-v15';
const AUDIO_DB='vivace-owner-discovery-audio-v1';
const AUDIO_STORE='recordings';
const AUDIO_CLEANUP_PENDING_KEY='vivace-local-audio-cleanup-pending-v1';
const MAX_RECORDING_MS=5*60*1000;
const VIVACE_LOGO_SRC='data:image/webp;base64,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';
const REQUIRED_IDS=new Set(['1','2','3','4','5','6','7','8','9','10','11','12','13','14']);
const $=(selector,root=document)=>root.querySelector(selector);
const $$=(selector,root=document)=>Array.from(root.querySelectorAll(selector));
let saveTimer=null;
let lastRequirementState='';
let validationShown=false;
let activeRecorder=null;
let activeStream=null;
let activeChunks=[];
let activeQuestionId='';
let timerHandle=null;
let timerStartedAt=0;
let submissionComplete=false;
const audioUrls=new Map();
const pendingAudioWrites=new Set();

const questions=[
 {id:1,title:'באיזה סניף נריץ את הפיילוט הראשון?',tag:'',body:radio('pilot_branch',['קריית יערים','בית שמש','סניף אחר'])+conditionalTextInput('pilot_branch_other','שם הסניף האחר','pilot_branch','סניף אחר')},
 {id:2,title:'איזו תוצאה הכי דחוף לך לשפר ב־90 הימים הקרובים?',tag:'',body:radio('urgent_result',['לדעת מה צפוי להיכנס ומתי','לא לפספס תשלום או זיכוי','לקצר רדיפה ידנית אחרי מידע ומסמכים','לראות חריגות לפני שהן הופכות לבעיה','לקבל תמונת מצב יומית של הסניף'])},
 {id:3,title:'איזו החלטה פיננסית אתה מקבל היום בלי תמונה מהירה ואמינה מספיק?',tag:'',body:textarea('uncertain_decision','לדוגמה: האם צריך לטפל בתקבול שחסר?')},
 {id:4,title:'מה חייב להופיע במסך הבוקר שלך? סמן עד 5.',tag:'',body:checkboxes('morning_view',['תקבולים צפויים','תשלומים קרובים','זיכוי או תקבול שחסר','חשבוניות ממתינות','משימות אישור פתוחות','חריגה בין מקורות מידע','מצב הסניף','התראות שעדיין לא טופלו','אחר'],5)+conditionalTextInput('morning_view_other','כתוב בקצרה','morning_view','אחר')},
 {id:5,title:'על אילו אירועים אתה רוצה התראה מיידית? סמן עד 5.',tag:'',body:checkboxes('instant_alerts',['תקבול או זיכוי שלא הגיעו','פער בין שני מקורות מידע','חשבונית כפולה או חסרה','תשלום קרוב שעדיין לא אושר','מסמך שממתין יותר מדי זמן','חריגת קופה','משימה קריטית שלא בוצעה','אחר'],5)+conditionalTextInput('instant_alerts_other','כתוב בקצרה','instant_alerts','אחר')},
 {id:6,title:'אילו מערכות כבר מחזיקות את המידע שנחוץ לפיילוט?',tag:'',body:checkboxes('existing_systems',['Tabit','Wolt','Cibus / Pluxee','10bis','סליקה / בנק','הנהלת חשבונות','מערכת חשבוניות / ספקים','Excel / Google Sheets','WhatsApp','מערכת אחרת'])+conditionalTextInput('existing_systems_other','שם המערכת האחרת','existing_systems','מערכת אחרת')},
 {id:7,title:'מאיזו מערכת הכי חשוב להתחיל למשוך מידע לפיילוט?',tag:'',body:select('first_system',[['','בחר מערכת'],['לא בטוח','לא בטוח']])},
 {id:8,title:'עד כמה אתה סומך היום על התמונה שאתה מקבל לפני החלטה פיננסית?',tag:'',body:rating('trust_level')},
 {id:9,title:'כמה שעות בשבוע, בערך, מושקעות באיסוף מידע, בדיקה, התאמות ורדיפה?',tag:'',body:numberWithUnknown('hours_per_week','מספר שעות בשבוע')},
 {id:10,title:'כמה פעמים בחודש האחרון נדרש בירור ידני בגלל תקבול, זיכוי, תשלום או מסמך לא ברור?',tag:'',body:numberWithUnknown('manual_checks_month','מספר אירועים בחודש')},
 {id:11,title:'כמה זמן עובר בדרך כלל מאירוע שדורש בדיקה עד שאתה יודע עליו בוודאות?',tag:'',body:radio('discovery_delay',['בזמן אמת','עד סוף היום','יום–יומיים','יותר מיומיים','לא עקבי'])},
 {id:12,title:'מי יטפל בפיילוט ביום־יום מצד העסק?',tag:'',body:textInput('pilot_owner_name','שם')+radio('pilot_owner_role',['בעלים','מנהל סניף','מזכירה / משרד','הנהלת חשבונות','אחר'])+conditionalTextInput('pilot_owner_role_other','כתוב תפקיד','pilot_owner_role','אחר')},
 {id:13,title:'מי צריך לראות את מסך השליטה בפיילוט?',tag:'',body:checkboxes('dashboard_viewers',['בעלים בלבד','בעלים ומנהל סניף','בעלים ומשרד','מנהל סניף בלבד','הנהלת חשבונות','אחר'])+conditionalTextInput('dashboard_viewers_other','כתוב תפקיד','dashboard_viewers','אחר')},
 {id:14,title:'איזה מדד יוכיח לך שהפיילוט הצליח בתוך 90 יום?',tag:'',body:select('success_metric',[['','בחר מדד'],['פחות שעות עבודה ידנית בשבוע','פחות שעות עבודה ידנית בשבוע'],['פחות בירורים ידניים בחודש','פחות בירורים ידניים בחודש'],['קיצור זמן גילוי חריגות','קיצור זמן גילוי חריגות'],['יותר פריטים שנסגרים בזמן','יותר פריטים שנסגרים בזמן']])+numberInput('success_target','יעד מספרי — לדוגמה 3 שעות פחות בשבוע')},
 {id:15,title:'מה עלול לעצור את הפיילוט אם לא נטפל בו מראש?',tag:'לא חובה',body:textarea('pilot_blocker','חסם מרכזי, אם יש')}
];
window.__vivaceActiveQuestionIds=questions.map(question=>question.id);

function escapeHtml(value){return String(value).replace(/[&<>\"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[char]))}
function radio(name,options){return `<div class="v15-options" role="radiogroup">${options.map(value=>`<label class="v15-option"><input type="radio" name="${name}" value="${escapeHtml(value)}"><span>${escapeHtml(value)}</span></label>`).join('')}</div>`}
function checkboxes(name,options,limit=0){return `<div class="v15-options" data-choice-group="${name}"${limit?` data-limit="${limit}"`:''}>${options.map(value=>`<label class="v15-option"><input type="checkbox" name="${name}" value="${escapeHtml(value)}"><span>${escapeHtml(value)}</span></label>`).join('')}</div>${limit?`<div class="v15-counter" data-counter-for="${name}" aria-live="polite">0 מתוך ${limit}</div>`:''}`}
function textInput(name,placeholder){return `<label class="v15-field"><span class="sr-only">${escapeHtml(placeholder)}</span><input type="text" name="${name}" placeholder="${escapeHtml(placeholder)}" autocomplete="off"></label>`}
function conditionalTextInput(name,placeholder,source,value){return `<label class="v15-field v15-conditional" data-show-when="${escapeHtml(source)}" data-show-value="${escapeHtml(value)}" hidden><span class="sr-only">${escapeHtml(placeholder)}</span><input type="text" name="${name}" placeholder="${escapeHtml(placeholder)}" autocomplete="off"></label>`}
function numberInput(name,placeholder){return `<label class="v15-field"><span class="sr-only">${escapeHtml(placeholder)}</span><input type="number" min="0" step="1" inputmode="numeric" name="${name}" placeholder="${escapeHtml(placeholder)}"></label>`}
function textarea(name,placeholder){return `<label class="v15-field"><span class="sr-only">${escapeHtml(placeholder)}</span><textarea name="${name}" rows="2" placeholder="${escapeHtml(placeholder)}"></textarea></label>`}
function select(name,options,hint=''){return `<label class="v15-field"><span class="sr-only">בחר אפשרות</span><select name="${name}">${options.map(([value,label])=>`<option value="${escapeHtml(value)}">${escapeHtml(label)}</option>`).join('')}</select>${hint?`<small>${escapeHtml(hint)}</small>`:''}</label>`}
function rating(name){return `<div class="v15-rating" role="radiogroup" aria-label="דירוג אמון מ־1 עד 5">${[1,2,3,4,5].map(value=>`<label><input type="radio" name="${name}" value="${value}"><span>${value}</span></label>`).join('')}</div><div class="v15-rating-labels"><span>לא סומך</span><span>סומך מאוד</span></div>`}
function numberWithUnknown(name,placeholder){return `${numberInput(name,placeholder)}<label class="v15-unknown"><input type="checkbox" name="${name}_unknown" value="לא יודע" data-unknown-for="${name}"><span>לא יודע</span></label>`}
function audioRecorder(id){return `<div class="audio-recorder" data-recorder-for="${id}"><button aria-label="הקלטת תשובה לשאלה ${id} — ייפתח אישור לפני ההקלטה" aria-disabled="false" class="record-button is-locked" data-action="record" type="button"><svg aria-hidden="true" class="mic-icon" viewBox="0 0 24 24"><path d="M12 15.5a3.5 3.5 0 0 0 3.5-3.5V6a3.5 3.5 0 1 0-7 0v6a3.5 3.5 0 0 0 3.5 3.5Z" fill="none" stroke="currentColor" stroke-width="1.8"></path><path d="M5.8 11.5a6.2 6.2 0 0 0 12.4 0M12 17.7V21M9 21h6" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.8"></path></svg><span class="record-label">הקלט תשובה</span><span class="record-timer">00:00</span></button><span class="record-status" aria-live="polite"></span><div class="record-playback" hidden></div></div>`}

function questionMarkup(question){
 return `<article class="v15-question" id="v15-question-${question.id}" data-question-id="${question.id}" data-question-title="${escapeHtml(question.title)}" data-required="${REQUIRED_IDS.has(String(question.id))?'true':'false'}">
  <div class="v15-question-head"><span class="qnum">${question.id}</span><div><h2 class="qtitle">${escapeHtml(question.title)}</h2>${question.tag?`<span class="qtag">${escapeHtml(question.tag)}</span>`:''}</div></div>${audioRecorder(question.id)}
  <div class="v15-answer">${question.body}</div>
  <div class="v15-error" aria-live="polite"></div>
 </article>`;
}

function formMarkup(){
 return `<div class="v15-app" id="v15ShortForm">
  <header class="v15-toolbar" id="v15Toolbar">
   <div class="v15-toolbar-brand"><img src="${VIVACE_LOGO_SRC}" alt="לוגו Vivace"><div><strong>שאלון מיקוד לפיילוט</strong></div></div>
   <div class="v15-toolbar-progress" aria-label="התקדמות מילוי"><div><span id="v15ProgressText">0 מתוך 14</span><span id="v15SaveState">נשמר אוטומטית</span></div><div class="v15-progress-track"><span id="v15ProgressBar"></span></div></div>
   <div class="v15-toolbar-actions"><button id="v15ReviewSubmit" type="button">בדיקה ושליחה</button></div>
  </header>
  <main class="v15-shell">
  <section class="v15-intro" aria-labelledby="v15IntroTitle">
   <div class="v15-hero-copy"><h1 id="v15IntroTitle">פיילוט אחד. החלטה ברורה.</h1><p>כ־6–8 דקות כדי לבחור את הפיילוט הראשון של Vivace OS.</p></div>
   <div class="v15-logo-card"><img src="${VIVACE_LOGO_SRC}" alt="Vivace — Famiglia & Pizza"><span>FAMIGLIA &amp; PIZZA</span></div>
   <section class="v15-consent-panel" id="v15ConsentPanel" aria-labelledby="v15ConsentTitle">
    <div class="v15-consent-copy"><strong id="v15ConsentTitle">רוצה לענות בקול?</strong><span>האודיו ישמש לתמלול זמני דרך Google Gemini; עם השאלון יישמר רק הטקסט שתאשר.</span></div>
    <label class="v15-consent"><input id="v15PrivacyAck" name="privacy_ack" type="checkbox"><span>אני מאשר שההקלטות יישלחו זמנית דרך שירות Vivace ל־Google Gemini לצורך תמלול, ולא אקליט סיסמאות או פרטי תשלום. האודיו לא יצורף לשאלון ויימחק מהמכשיר אחרי שליחה מוצלחת.</span></label>
   </section>
   <div class="v15-identity">
    <label><span>שם ממלא השאלון</span><input id="v15RespondentName" name="respondent_name" type="text" autocomplete="name"></label>
    <label><span>תפקיד</span><input id="v15RespondentRole" name="respondent_role" type="text" autocomplete="organization-title"></label>
   </div>
  </section>
  <form id="v15Questions" novalidate>
   ${questions.slice(0,5).map(questionMarkup).join('')}
   <div class="v15-divider"><span>מערכות וקו בסיס</span></div>
   ${questions.slice(5,10).map(questionMarkup).join('')}
   <div class="v15-divider"><span>אחריות והצלחת הפיילוט</span></div>
   ${questions.slice(10).map(questionMarkup).join('')}
  </form>
  </main>
  <div class="v15-consent-dialog" id="v15ConsentDialog" role="dialog" aria-modal="true" aria-labelledby="v15DialogTitle" hidden>
   <div class="v15-consent-sheet">
    <h2 id="v15DialogTitle">אישור הקלטה</h2>
    <p>ההקלטה תישלח זמנית דרך שירות Vivace ל־Google Gemini לתמלול. עם השאלון יישלח רק התמלול שתאשר, והאודיו יימחק מהמכשיר אחרי שליחה מוצלחת. אין להקליט סיסמאות או פרטי תשלום.</p>
    <div class="v15-dialog-actions"><button id="v15ConsentCancel" type="button">לא עכשיו</button><button id="v15ConsentContinue" type="button">מאשר ומפעיל מיקרופון</button></div>
   </div>
  </div>
 </div>`;
}

function styles(){
 const style=document.createElement('style');style.id='v15Styles';style.textContent=`
  :root{--v15-red:#EA4A3E;--v15-red-dark:#B9362E;--v15-red-soft:#FFF0ED;--v15-cream:#F7F1E9;--v15-paper:#FFFDF9;--v15-ink:#2C2522;--v15-muted:#736A65;--v15-line:#E3D8D1;--v15-success:#2F7256}
  html,body{background:#EEE7DF;color:var(--v15-ink);overflow-x:hidden}
  body{display:block!important;min-height:100vh;text-align:initial!important;font-family:"Noto Sans Hebrew",Arial,sans-serif}
  .app-toolbar,.page{display:none!important}
  .sr-only{position:absolute!important;width:1px!important;height:1px!important;padding:0!important;margin:-1px!important;overflow:hidden!important;clip:rect(0,0,0,0)!important;white-space:nowrap!important;border:0!important}
  .v15-app{direction:rtl;min-height:100vh}
  .v15-toolbar{position:sticky;top:0;z-index:1200;display:grid;grid-template-columns:minmax(210px,.85fr) minmax(240px,1.2fr) auto;align-items:center;gap:18px;padding:10px max(16px,calc((100vw - 980px)/2));background:rgba(255,253,249,.97);border-bottom:1px solid var(--v15-line);box-shadow:0 8px 28px rgba(72,45,35,.08);backdrop-filter:blur(12px)}
  .v15-toolbar-brand{display:flex;align-items:center;gap:10px;min-width:0}.v15-toolbar-brand img{width:44px;height:44px;border-radius:13px;object-fit:cover;box-shadow:0 4px 14px rgba(185,54,46,.2)}.v15-toolbar-brand strong{display:block;color:var(--v15-ink);font-size:14px}.v15-toolbar-brand small{display:block;color:var(--v15-muted);font-size:11px;margin-top:2px;direction:ltr;text-align:right}.v15-toolbar-progress>div:first-child{display:flex;justify-content:space-between;gap:12px;color:var(--v15-muted);font-size:11px;margin-bottom:6px}.v15-progress-track{height:7px;background:#EDE3DD;border-radius:999px;overflow:hidden}.v15-progress-track span{display:block;width:0;height:100%;background:var(--v15-red);border-radius:inherit;transition:width .25s ease}.v15-toolbar-actions{display:flex;gap:8px}.v15-toolbar-actions button{min-height:42px;border-radius:11px;padding:0 14px;font:inherit;font-weight:850;cursor:pointer;white-space:nowrap}.v15-toolbar-actions button:first-child{border:1px solid var(--v15-line);background:#fff;color:var(--v15-ink)}.v15-toolbar-actions button:last-child{border:1px solid var(--v15-red);background:var(--v15-red);color:#fff}
  .v15-shell{width:min(980px,calc(100% - 28px));margin:20px auto 60px}.v15-intro,.v15-question,.v15-closing{background:var(--v15-paper);border:1px solid var(--v15-line);box-shadow:0 12px 34px rgba(72,45,35,.07)}
  .v15-intro{display:grid;grid-template-columns:minmax(0,1fr) 210px;gap:22px;border-radius:26px;padding:30px;margin-bottom:16px;border-top:5px solid var(--v15-red)}.v15-hero-copy{align-self:center}.v15-kicker{display:block;color:var(--v15-red-dark);font-size:12px;font-weight:950;letter-spacing:1.3px;direction:ltr;text-align:right}.v15-intro h1{margin:8px 0;color:var(--v15-ink);font-size:33px;line-height:1.2}.v15-intro p{margin:0;color:var(--v15-muted);font-size:16px;line-height:1.65}.v15-facts{display:flex;gap:8px;flex-wrap:wrap;margin-top:15px}.v15-facts span{padding:6px 10px;border-radius:999px;background:var(--v15-red-soft);color:var(--v15-red-dark);font-size:11px;font-weight:800}.v15-logo-card{grid-column:2;grid-row:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:9px;min-height:190px;border-radius:22px;background:var(--v15-red);overflow:hidden}.v15-logo-card img{width:150px;height:150px;object-fit:cover}.v15-logo-card span{color:#fff;font-size:9px;letter-spacing:1.7px;margin-top:-12px}.v15-privacy{grid-column:1/-1;display:flex;flex-direction:column;gap:3px;padding:14px 16px;border-radius:14px;background:#F4E9DE;color:#5B453B}.v15-privacy strong{font-size:15px}.v15-privacy span{font-size:13px;line-height:1.55}.v15-consent-panel{grid-column:1/-1;padding:15px 16px;border:2px solid rgba(234,74,62,.45);border-radius:16px;background:var(--v15-red-soft);box-shadow:0 7px 20px rgba(185,54,46,.08)}.v15-consent-copy{display:flex;flex-direction:column;gap:3px;margin-bottom:11px}.v15-consent-copy strong{color:var(--v15-red-dark);font-size:15px}.v15-consent-copy span{color:#604B44;font-size:13px;line-height:1.5}.v15-consent{display:flex;align-items:flex-start;gap:10px;padding-top:10px;border-top:1px solid rgba(185,54,46,.16);font-size:13px;font-weight:750;line-height:1.55;color:#3E3430;cursor:pointer}.v15-consent input{width:24px;height:24px;flex:0 0 24px;margin:0;accent-color:var(--v15-red)}.v15-consent-panel.is-approved{border-color:#70A789;background:#F0F8F4}.v15-consent-panel.is-approved .v15-consent-copy strong{color:var(--v15-success)}.v15-consent-panel.is-highlighted{animation:v15ConsentPulse .9s ease 2}@keyframes v15ConsentPulse{50%{box-shadow:0 0 0 7px rgba(234,74,62,.2)}}.v15-identity{grid-column:1/-1;display:grid;grid-template-columns:1fr 1fr;gap:12px}.v15-identity label>span{display:block;font-size:13px;font-weight:850;margin-bottom:6px}
  .v15-identity input,.v15-field input,.v15-field textarea,.v15-field select{width:100%;min-height:49px;border:1px solid #D8CCC5;border-radius:12px;background:#fff;color:var(--v15-ink);padding:11px 13px;font:inherit;font-size:15px;direction:rtl}.v15-field textarea{min-height:82px;resize:vertical}.v15-field small{display:block;margin-top:5px;color:var(--v15-muted);font-size:12px}.v15-field{display:block;margin-top:10px}.v15-field[hidden]{display:none!important}.v15-identity input:focus,.v15-field input:focus,.v15-field textarea:focus,.v15-field select:focus{outline:3px solid rgba(234,74,62,.22);border-color:var(--v15-red);outline-offset:1px}
  #v15Questions{display:grid;gap:12px}.v15-question{position:relative;border-radius:20px;padding:22px 24px}.v15-question-head{display:grid;grid-template-columns:42px 1fr;gap:12px;align-items:start}.v15-question .qnum{width:40px;min-width:40px;height:40px;padding:0;border-radius:12px;background:var(--v15-red);color:#fff;display:grid;place-items:center;font-size:15px;font-weight:900}.v15-question .qtitle{font-size:18px;line-height:1.45;margin:0;color:var(--v15-ink)}.v15-question .qtag{display:inline-block;margin:5px 0 0;background:#F3E9E2;color:#74564A;font-size:11px;padding:3px 8px;border-radius:999px}.v15-answer{position:relative;z-index:1;margin:16px 54px 0 0}.v15-options{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.v15-option{position:relative;display:block}.v15-option input{position:absolute;opacity:0;pointer-events:none}.v15-option span{display:flex;align-items:center;min-height:50px;border:1px solid #DED3CD;border-radius:12px;background:#fff;padding:10px 13px;font-size:14px;line-height:1.35;cursor:pointer;transition:.16s}.v15-option span::before{content:'';width:18px;height:18px;flex:0 0 18px;margin-left:9px;border:1.5px solid #A9968E;border-radius:5px}.v15-option input[type=radio]+span::before{border-radius:50%}.v15-option input:checked+span{border-color:var(--v15-red);background:var(--v15-red-soft);box-shadow:0 0 0 1px rgba(234,74,62,.12)}.v15-option input:checked+span::before{background:var(--v15-red);border-color:var(--v15-red);box-shadow:inset 0 0 0 4px var(--v15-red-soft)}.v15-option input:focus-visible+span{outline:3px solid rgba(234,74,62,.24);outline-offset:2px}.v15-counter{margin-top:7px;color:var(--v15-muted);font-size:12px}.v15-rating{display:grid;grid-template-columns:repeat(5,1fr);gap:8px}.v15-rating label{position:relative}.v15-rating input{position:absolute;opacity:0}.v15-rating span{display:grid;place-items:center;min-height:48px;border:1px solid #DED3CD;border-radius:12px;background:#fff;font-weight:900;cursor:pointer}.v15-rating input:checked+span{background:var(--v15-red);border-color:var(--v15-red);color:#fff}.v15-rating input:focus-visible+span{outline:3px solid rgba(234,74,62,.24);outline-offset:2px}.v15-rating-labels{display:flex;justify-content:space-between;margin-top:5px;color:var(--v15-muted);font-size:11px}.v15-unknown{display:flex;align-items:center;gap:8px;margin-top:9px;font-size:13px}.v15-unknown input{width:19px;height:19px;accent-color:var(--v15-red)}
  .v15-question>.audio-recorder{position:relative;z-index:3;isolation:isolate;margin:14px 54px 0 0;display:grid;grid-template-columns:auto minmax(0,1fr);align-items:center;gap:8px 11px}.v15-question .record-button{position:relative;z-index:4;min-height:44px;border:1px solid var(--v15-red);border-radius:999px;background:#fff;color:var(--v15-red-dark);padding:8px 14px;display:inline-flex;align-items:center;gap:8px;font:inherit;font-size:13px;font-weight:850;cursor:pointer;touch-action:manipulation;user-select:none}.v15-question .record-button:hover{background:var(--v15-red-soft)}.v15-question .record-button.is-locked{border-color:#CFC3BC;color:#81756F;background:#F5F0EC}.v15-question .record-button.recording{background:var(--v15-red);border-color:var(--v15-red);color:#fff;box-shadow:0 0 0 6px rgba(234,74,62,.14)}.v15-question .record-button.has-recording{border-color:var(--v15-success);color:var(--v15-success);background:#F0F8F4}.v15-question .record-status{font-size:12px;line-height:1.45;color:var(--v15-muted)}.v15-question .record-playback{grid-column:1/-1;display:grid;grid-template-columns:minmax(150px,1fr) auto auto;align-items:center;gap:8px;width:100%;margin-top:2px;padding:10px;border:1px solid var(--v15-line);border-radius:13px;background:#FAF6F2}.v15-question .record-playback[hidden]{display:none}.v15-question .record-playback audio{width:100%;height:38px}.v15-question .audio-action{min-height:44px;border:1px solid var(--v15-line);border-radius:10px;background:#fff;color:var(--v15-ink);padding:0 12px;display:inline-flex;align-items:center;justify-content:center;font:inherit;font-size:12px;font-weight:800;text-decoration:none;cursor:pointer}.v15-question .audio-action.delete{color:var(--v15-red-dark)}.mic-icon{width:18px;height:18px;flex:0 0 18px}.record-timer{direction:ltr;font-variant-numeric:tabular-nums}.record-button:not(.recording) .record-timer{display:none}
  .v15-error{min-height:18px;margin:8px 54px 0 0;color:#A53028;font-size:12px;font-weight:800}.v15-question.is-answered{border-color:#B8D2C4;box-shadow:inset -4px 0 0 var(--v15-success),0 12px 34px rgba(72,45,35,.06)}.v15-question.has-error{border-color:var(--v15-red);box-shadow:0 0 0 2px rgba(234,74,62,.12)}.v15-identity label.has-error input{border-color:var(--v15-red);background:#FFF7F5;box-shadow:0 0 0 3px rgba(234,74,62,.12)}.v15-consent-panel.has-error{border-color:var(--v15-red);box-shadow:0 0 0 3px rgba(234,74,62,.13)}.v15-missing-focus{animation:v15MissingFocus 1.2s ease}@keyframes v15MissingFocus{35%{box-shadow:0 0 0 7px rgba(234,74,62,.2)}}.v15-divider{display:flex;align-items:center;gap:10px;margin:20px 0 6px;color:var(--v15-red-dark);font-size:12px;font-weight:950;letter-spacing:.5px}.v15-divider::after{content:'';height:1px;flex:1;background:linear-gradient(90deg,transparent,var(--v15-line))}.v15-closing{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;margin-top:16px;border-radius:20px;padding:22px 24px;background:#2C2522;color:#fff}.v15-closing-copy{min-width:0;flex:1}.v15-closing strong{display:block;font-size:20px}.v15-closing>div>span{display:block;margin-top:4px;color:#D9CECA;font-size:13px}.v15-check{font-size:38px;color:var(--v15-red)}.v15-missing-list{display:flex;flex-wrap:wrap;align-items:center;gap:7px;margin-top:13px}.v15-missing-list[hidden]{display:none}.v15-missing-intro{width:100%;color:#FFE0DA!important;font-size:12px!important;font-weight:850}.v15-missing-item{min-height:40px;border:1px solid rgba(255,255,255,.24);border-radius:999px;background:rgba(255,255,255,.09);color:#fff;padding:8px 12px;font:inherit;font-size:12px;font-weight:800;text-align:right;cursor:pointer}.v15-missing-item:hover{background:rgba(255,255,255,.16)}.v15-missing-more{color:#D9CECA!important;font-size:11px!important}
  .v15-shell #v9FinalSubmit{margin-top:16px}.v15-shell #v9FinalSubmit>div{background:#2C2522!important;border:1px solid rgba(255,255,255,.06)!important}.v15-shell #v9Send{background:var(--v15-red)!important}.v15-shell #v9Status:empty{min-height:0!important;margin-top:0!important}.v15-submit-missing{margin:4px 0 12px;padding:12px;border:1px solid rgba(255,255,255,.13);border-radius:14px;background:rgba(255,255,255,.05)}.submit-overlay{display:none!important}
  .vivace-preview{margin:12px 54px 2px 0;padding:15px 16px;border:1px solid var(--v15-line)!important;border-radius:16px;background:#FAF6F2!important;color:var(--v15-ink)!important;box-shadow:0 6px 18px rgba(72,45,35,.05);text-align:right}.vivace-preview.is-processing{border-color:rgba(234,74,62,.34)!important;background:var(--v15-red-soft)!important}.vivace-preview.is-approved{border-color:#9BC3AD!important;background:#F0F8F4!important}.vivace-preview.is-error{border-color:#E4AAA4!important;background:#FFF4F2!important}.vivace-preview-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:9px}.vivace-preview-badge{display:inline-flex;align-items:center;min-height:27px;border-radius:999px;background:#EEE3DC;color:#624E45;padding:4px 9px;font-size:11px;font-weight:900}.is-processing .vivace-preview-badge{background:#FFDCD6;color:var(--v15-red-dark)}.is-approved .vivace-preview-badge{background:#DCEEE4;color:var(--v15-success)}.is-error .vivace-preview-badge{background:#F7D7D3;color:#96352E}.vivace-preview-copy{font-size:13px;line-height:1.55;color:var(--v15-muted)}.vivace-transcript-label{display:block;font-size:12px;font-weight:850;color:#5A4A43}.vivace-transcript-editor{width:100%;min-height:92px;margin-top:7px;border:1px solid #D8CCC5;border-radius:12px;background:#fff;color:var(--v15-ink);padding:11px 12px;font:inherit;font-size:15px;line-height:1.55;resize:vertical;direction:rtl}.vivace-transcript-editor:focus{outline:3px solid rgba(234,74,62,.2);border-color:var(--v15-red)}.vivace-transcript-text{padding:12px;border-radius:12px;background:#fff;border:1px solid #D6E5DC;font-size:15px;line-height:1.65;white-space:pre-wrap}.vivace-preview-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:11px}.vivace-preview button{min-height:44px;border-radius:11px;padding:8px 14px;font:inherit;font-size:12px;font-weight:850;cursor:pointer}.vivace-preview .is-primary{border:1px solid var(--v15-red);background:var(--v15-red);color:#fff}.vivace-preview.is-approved .is-primary{border-color:var(--v15-success);background:var(--v15-success)}.vivace-preview .is-secondary{border:1px solid var(--v15-line);background:#fff;color:var(--v15-ink)}.vivace-preview-note{display:block;margin-top:8px;color:var(--v15-muted);font-size:11px}.vivace-preview-error{color:#8F342D;font-size:13px;font-weight:800}
  body.v15-modal-open{overflow:hidden}.v15-consent-dialog{position:fixed;inset:0;z-index:1000000;display:grid;place-items:center;padding:18px;background:rgba(35,27,24,.62);backdrop-filter:blur(4px)}.v15-consent-dialog[hidden]{display:none}.v15-consent-sheet{width:min(460px,100%);border:1px solid rgba(234,74,62,.25);border-radius:22px;background:var(--v15-paper);padding:24px;box-shadow:0 24px 70px rgba(34,24,20,.3);text-align:center}.v15-dialog-kicker{display:inline-flex;margin:0 auto 12px;border-radius:999px;background:var(--v15-red-soft);color:var(--v15-red-dark);padding:6px 10px;font-size:10px;font-weight:950;letter-spacing:1px;direction:ltr}.v15-consent-sheet h2{margin:0;color:var(--v15-ink);font-size:22px}.v15-consent-sheet p{margin:10px 0 20px;color:var(--v15-muted);font-size:14px;line-height:1.65}.v15-dialog-actions{display:grid;grid-template-columns:1fr 1.35fr;gap:9px}.v15-dialog-actions button{min-height:48px;border-radius:12px;padding:8px 12px;font:inherit;font-weight:850;cursor:pointer}.v15-dialog-actions button:first-child{border:1px solid var(--v15-line);background:#fff;color:var(--v15-ink)}.v15-dialog-actions button:last-child{border:1px solid var(--v15-red);background:var(--v15-red);color:#fff}
  @media(max-width:820px){.v15-toolbar{position:sticky;grid-template-columns:1fr auto;gap:9px 12px;padding:9px 12px}.v15-toolbar-brand img{width:40px;height:40px}.v15-toolbar-brand strong{font-size:13px}.v15-toolbar-progress{grid-column:1/-1;grid-row:2}.v15-toolbar-actions{grid-column:2;grid-row:1}.v15-toolbar-actions button{min-height:40px;padding:0 11px}.v15-toolbar-actions button:first-child{display:none}.v15-shell{width:100%;margin:0 0 36px}.v15-intro{grid-template-columns:1fr;border-radius:0;padding:22px 16px;margin:0;border-width:5px 0 1px;gap:17px}.v15-intro h1{font-size:26px}.v15-intro p{font-size:14px}.v15-logo-card{grid-column:1;grid-row:2;min-height:118px;display:grid;grid-template-columns:112px 1fr;justify-items:center}.v15-logo-card img{width:112px;height:112px}.v15-logo-card span{margin:0;font-size:10px}.v15-privacy,.v15-consent-panel,.v15-identity{grid-column:1}.v15-consent-panel{padding:14px}.v15-identity{grid-template-columns:1fr}.v15-question{border-radius:0;border-width:0 0 1px;padding:18px 15px;box-shadow:none}.v15-question-head{grid-template-columns:38px 1fr;gap:9px}.v15-question .qnum{width:36px;min-width:36px;height:36px}.v15-question .qtitle{font-size:16px}.v15-question>.audio-recorder,.v15-answer,.vivace-preview{margin:14px 0 0}.v15-options{grid-template-columns:1fr}.v15-error{margin:7px 0 0}.v15-closing{border-radius:0;margin:0;padding:20px 16px}.v15-rating{gap:5px}.v15-rating span{min-height:44px}.v15-question .record-playback{grid-template-columns:1fr}.v15-question .audio-action{width:100%}.vivace-preview-actions{display:grid;grid-template-columns:1fr}.vivace-preview button{width:100%}.v15-consent-dialog{align-items:end;padding:0}.v15-consent-sheet{width:100%;border-radius:22px 22px 0 0;padding:22px 17px calc(22px + env(safe-area-inset-bottom))}.v15-dialog-actions{grid-template-columns:1fr}}
  @media(max-width:390px){.v15-toolbar-actions button{font-size:12px}.v15-logo-card{grid-template-columns:96px 1fr}.v15-logo-card img{width:96px;height:96px}.v15-facts span{font-size:10px}.v15-question>.audio-recorder{grid-template-columns:1fr}.v15-question .record-button{width:100%;justify-content:center}.v15-question .record-status{text-align:center}}
  .v15-question .record-status:empty{display:none}.v15-question .record-playback{grid-template-columns:minmax(150px,1fr) auto}.v15-question .audio-action.delete{min-height:44px;border:0;background:transparent;color:var(--v15-red-dark);padding:0 8px;text-decoration:underline;text-underline-offset:3px}.v15-divider{margin-top:14px;font-size:11px;letter-spacing:0}.v15-toolbar-actions button{border:1px solid var(--v15-red)!important;background:var(--v15-red)!important;color:#fff!important}
  @media(max-width:820px){.v15-toolbar-actions button:first-child{display:inline-flex;align-items:center;justify-content:center}.v15-question .record-playback{grid-template-columns:minmax(0,1fr) auto}.v15-question .audio-action.delete{width:auto;justify-self:start}.v15-divider{margin:13px 15px 4px}.v15-logo-card{min-height:104px}.v15-logo-card img{width:96px;height:96px}}
  @media print{.v15-toolbar{display:none}.v15-shell{width:100%;margin:0}.v15-question{break-inside:avoid;box-shadow:none}}
 `;document.head.appendChild(style);
}

function openAudioDB(){
 return new Promise((resolve,reject)=>{try{const request=indexedDB.open(AUDIO_DB,1);request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains(AUDIO_STORE))request.result.createObjectStore(AUDIO_STORE,{keyPath:'questionId'})};request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)}catch(error){reject(error)}});
}

async function putRecording(questionId,blob){
 const db=await openAudioDB();try{await new Promise((resolve,reject)=>{const tx=db.transaction(AUDIO_STORE,'readwrite');tx.objectStore(AUDIO_STORE).put({questionId:Number(questionId),blob,mimeType:blob.type||'audio/webm',updatedAt:new Date().toISOString()});tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)})}finally{db.close()}
}

async function getRecording(questionId){
 const db=await openAudioDB();try{return await new Promise((resolve,reject)=>{const store=db.transaction(AUDIO_STORE,'readonly').objectStore(AUDIO_STORE),numeric=store.get(Number(questionId));numeric.onsuccess=()=>{if(numeric.result)return resolve(numeric.result);const text=store.get(String(questionId));text.onsuccess=()=>resolve(text.result||null);text.onerror=()=>reject(text.error)};numeric.onerror=()=>reject(numeric.error)})}finally{db.close()}
}

async function getAllRecordings(){
 const db=await openAudioDB();try{return await new Promise((resolve,reject)=>{const request=db.transaction(AUDIO_STORE,'readonly').objectStore(AUDIO_STORE).getAll();request.onsuccess=()=>resolve((request.result||[]).filter(record=>window.__vivaceActiveQuestionIds.includes(Number(record.questionId))));request.onerror=()=>reject(request.error)})}finally{db.close()}
}

async function deleteRecording(questionId){
 const db=await openAudioDB();try{await new Promise((resolve,reject)=>{const tx=db.transaction(AUDIO_STORE,'readwrite'),store=tx.objectStore(AUDIO_STORE);store.delete(Number(questionId));store.delete(String(questionId));tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)})}finally{db.close()}
}

async function clearLocalRecordingsOnce(){
 const db=await openAudioDB();try{await new Promise((resolve,reject)=>{const tx=db.transaction(AUDIO_STORE,'readwrite');tx.objectStore(AUDIO_STORE).clear();tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||new Error('AUDIO_CLEAR_ABORTED'))})}finally{db.close()}
}

async function clearLocalRecordings(){
 submissionComplete=true;await Promise.allSettled([...pendingAudioWrites]);
 let lastError=null;for(let attempt=0;attempt<3;attempt++){try{await clearLocalRecordingsOnce();lastError=null;break}catch(error){lastError=error;if(attempt<2)await new Promise(resolve=>setTimeout(resolve,300*(attempt+1)))}}
 if(lastError)throw lastError;
 audioUrls.forEach(url=>{try{URL.revokeObjectURL(url)}catch{}});audioUrls.clear();$$('.record-playback').forEach(playback=>{playback.hidden=true;playback.replaceChildren()});
 try{localStorage.removeItem(AUDIO_CLEANUP_PENDING_KEY)}catch{}
}

window.__vivaceClearLocalRecordings=clearLocalRecordings;

function bestMimeType(){return ['audio/webm;codecs=opus','audio/webm','audio/mp4;codecs=mp4a.40.2','audio/mp4'].find(type=>window.MediaRecorder?.isTypeSupported?.(type))||''}
function formatTime(ms){const seconds=Math.floor(ms/1000);return `${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`}
function stopRecording(){if(activeRecorder?.state==='recording')activeRecorder.stop()}

function queueRecordingSave(questionId,blob,hadPrevious){
 const pending=putRecording(questionId,blob).then(()=>renderRecording(questionId,blob)).then(()=>document.dispatchEvent(new CustomEvent('vivace:recording-saved',{detail:{questionId:Number(questionId)}})));
 pendingAudioWrites.add(pending);void pending.catch(error=>{console.error('Vivace recording save failed',error);void renderRecording(questionId).finally(()=>document.dispatchEvent(new CustomEvent('vivace:recording-cancelled',{detail:{questionId:Number(questionId),hadPrevious}})));showToast(hadPrevious?'לא הצלחנו לשמור את ההקלטה החדשה — התשובה הקודמת נשארה.':'לא הצלחנו לשמור את ההקלטה. נסה שוב.')}).finally(()=>pendingAudioWrites.delete(pending));
}

function requestRecordingConsent(){
 if($('#v15PrivacyAck')?.checked)return Promise.resolve(true);
 const dialog=$('#v15ConsentDialog'),panel=$('#v15ConsentPanel');
 if(!dialog){panel?.scrollIntoView({behavior:'smooth',block:'center'});panel?.classList.add('is-highlighted');setTimeout(()=>panel?.classList.remove('is-highlighted'),1900);$('#v15PrivacyAck')?.focus();return Promise.resolve(false)}
 const approve=$('#v15ConsentContinue',dialog),cancel=$('#v15ConsentCancel',dialog),previousFocus=document.activeElement;
 dialog.hidden=false;document.body.classList.add('v15-modal-open');
 return new Promise(resolve=>{
  const finish=approved=>{approve?.removeEventListener('click',onApprove);cancel?.removeEventListener('click',onCancel);dialog.removeEventListener('click',onBackdrop);document.removeEventListener('keydown',onKey);dialog.hidden=true;document.body.classList.remove('v15-modal-open');if(approved){const checkbox=$('#v15PrivacyAck');if(checkbox&&!checkbox.checked){checkbox.checked=true;checkbox.dispatchEvent(new Event('change',{bubbles:true}))}}else previousFocus?.focus?.();resolve(approved)};
  const onApprove=()=>finish(true),onCancel=()=>finish(false),onBackdrop=event=>{if(event.target===dialog)finish(false)},onKey=event=>{if(event.key==='Escape')finish(false)};
  approve?.addEventListener('click',onApprove);cancel?.addEventListener('click',onCancel);dialog.addEventListener('click',onBackdrop);document.addEventListener('keydown',onKey);approve?.focus();
 });
}

async function renderRecording(questionId,source=undefined){
 const qid=String(questionId),card=$(`[data-question-id="${qid}"]`);if(!card)return;
 const box=$('.audio-recorder',card),playback=$('.record-playback',box),button=$('.record-button',box),label=$('.record-label',button),timer=$('.record-timer',button),status=$('.record-status',box);if(!box||!playback||!button)return;
 let record=source;if(source===undefined){try{record=await getRecording(qid)}catch{record=null}}
 const blob=record instanceof Blob?record:record?.blob;
 const previous=audioUrls.get(qid);if(previous){URL.revokeObjectURL(previous);audioUrls.delete(qid)}
 if(!blob){card.dataset.hasRecording='false';playback.hidden=true;playback.replaceChildren();button.classList.remove('recording','has-recording');label.textContent='הקלט תשובה';timer.textContent='00:00';status.textContent='';updateProgress();return}
 const url=URL.createObjectURL(blob);audioUrls.set(qid,url);card.dataset.hasRecording='true';playback.hidden=false;playback.replaceChildren();
 const audio=document.createElement('audio');audio.controls=true;audio.preload='metadata';audio.src=url;
 const remove=document.createElement('button');remove.type='button';remove.className='audio-action delete';remove.textContent='מחק הקלטה';remove.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();if(!window.confirm('למחוק את ההקלטה הזאת?'))return;void deleteRecording(qid).then(()=>renderRecording(qid,null)).then(()=>document.dispatchEvent(new CustomEvent('vivace:recording-deleted',{detail:{questionId:Number(qid)}}))).catch(()=>showToast('לא הצלחנו למחוק את ההקלטה'))});
 playback.append(audio,remove);button.classList.remove('recording');button.classList.add('has-recording');label.textContent='הקלט מחדש';timer.textContent='00:00';status.textContent=$('#v15PrivacyAck')?.checked?'':'אשר הקלטות כדי לתמלל';updateProgress();
}

async function startRecording(questionId,box){
 const qid=String(questionId),button=$('.record-button',box),label=$('.record-label',button),timer=$('.record-timer',button),status=$('.record-status',box),hadPrevious=box?.closest('.v15-question')?.dataset.hasRecording==='true';
 if(submissionComplete)return;
 if(!await requestRecordingConsent())return;
 if(submissionComplete)return;
 if(!window.isSecureContext||!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder){status.textContent='הדפדפן הזה לא מאפשר כרגע הקלטה';showToast('הקלטה דורשת דפדפן שתומך במיקרופון וקישור מאובטח.');return}
 if(activeRecorder?.state==='recording'){if(activeQuestionId===qid)stopRecording();else showToast('כבר מתבצעת הקלטה בשאלה אחרת. עצור אותה קודם.');return}
 try{
  const stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true}});if(submissionComplete){stream.getTracks().forEach(track=>track.stop());return}activeStream=stream;const mimeType=bestMimeType();const recorder=mimeType?new MediaRecorder(activeStream,{mimeType}):new MediaRecorder(activeStream);activeRecorder=recorder;activeQuestionId=qid;activeChunks=[];
  let recorderFailed=false;
  recorder.ondataavailable=event=>{if(event.data?.size)activeChunks.push(event.data)};
   recorder.onstop=()=>{const blob=new Blob(activeChunks,{type:recorder.mimeType||mimeType||'audio/webm'});activeStream?.getTracks().forEach(track=>track.stop());activeStream=null;activeRecorder=null;activeQuestionId='';activeChunks=[];clearInterval(timerHandle);timerHandle=null;button.classList.remove('recording');if(submissionComplete)return;if(recorderFailed){void renderRecording(qid).finally(()=>document.dispatchEvent(new CustomEvent('vivace:recording-cancelled',{detail:{questionId:Number(qid),hadPrevious}})));showToast(hadPrevious?'ההקלטה החדשה נכשלה — התשובה הקודמת נשארה.':'ההקלטה נכשלה. נסה שוב.');return}if(blob.size<1){void renderRecording(qid).finally(()=>document.dispatchEvent(new CustomEvent('vivace:recording-cancelled',{detail:{questionId:Number(qid),hadPrevious}})));status.textContent=hadPrevious?'לא נקלט אודיו חדש; התשובה הקודמת נשארה':'לא נקלט אודיו. נסה שוב.';showToast(hadPrevious?'לא נקלט אודיו חדש — התשובה הקודמת נשארה.':'לא נקלט אודיו. נסה להקליט שוב.');return}queueRecordingSave(qid,blob,hadPrevious)};
  recorder.onerror=event=>{console.error('Vivace MediaRecorder error',event);recorderFailed=true;status.textContent='ההקלטה נעצרה בגלל תקלה';stopRecording()};recorder.start(250);button.classList.add('recording');button.classList.remove('has-recording');label.textContent='עצור הקלטה';status.textContent='מקליט עכשיו… לחץ שוב לעצירה';document.dispatchEvent(new CustomEvent('vivace:recording-started',{detail:{questionId:Number(qid)}}));timerStartedAt=Date.now();timer.textContent='00:00';timerHandle=setInterval(()=>{timer.textContent=formatTime(Date.now()-timerStartedAt);if(Date.now()-timerStartedAt>=MAX_RECORDING_MS){stopRecording();showToast('ההקלטה נעצרה אוטומטית אחרי 5 דקות')}},250);
 }catch(error){console.error('Vivace microphone permission failed',error);activeStream?.getTracks().forEach(track=>track.stop());activeStream=null;activeRecorder=null;activeQuestionId='';status.textContent=error?.name==='NotFoundError'?'לא נמצא מיקרופון במכשיר':'נדרשת הרשאת מיקרופון';showToast(error?.name==='NotFoundError'?'לא נמצא מיקרופון זמין במכשיר.':'יש לאשר גישה למיקרופון בהגדרות הדפדפן.')}
}

async function restoreRecordings(){try{const records=await getAllRecordings();for(const record of records)await renderRecording(String(record.questionId),record)}catch(error){console.warn('Vivace recording restore failed',error)}}

function updateConditionalFields(){
 $$('.v15-conditional').forEach(field=>{const source=field.dataset.showWhen,value=field.dataset.showValue,inputs=$$(`[name="${source}"]`),show=inputs.some(input=>(input.type==='checkbox'||input.type==='radio')?input.checked&&input.value===value:input.value===value);field.hidden=!show;if(!show){const input=$('input,textarea,select',field);if(input)input.value=''}});
}

function loadSaved(){
 let saved={};try{saved=JSON.parse(localStorage.getItem(FORM_STORAGE_KEY)||'{}')||{}}catch{}
 const form=$('#v15ShortForm');if(!form)return;
 $$('input,textarea,select',form).forEach(element=>{
  if(element.name==='first_system')return;
  const value=saved[element.name];if(value===undefined)return;
  if(element.type==='checkbox')element.checked=Array.isArray(value)?value.includes(element.value):Boolean(value);
  else if(element.type==='radio')element.checked=value===element.value;
  else element.value=String(value);
 });
 updateSystemSelect();
 const firstSystem=$('[name="first_system"]',form),savedSystem=String(saved.first_system||'');if(firstSystem&&savedSystem&&Array.from(firstSystem.options).some(option=>option.value===savedSystem))firstSystem.value=savedSystem;
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

function persist(){clearTimeout(saveTimer);const saveState=$('#v15SaveState');if(saveState)saveState.textContent='שומר…';saveTimer=setTimeout(()=>{try{localStorage.setItem(FORM_STORAGE_KEY,JSON.stringify(collectSaved()));if(saveState){saveState.textContent='נשמר עכשיו';setTimeout(()=>{saveState.textContent='נשמר אוטומטית'},1200)}}catch{if(saveState)saveState.textContent='נשמר זמנית'}},250)}

function selectedValue(name){return $(`input[name="${name}"]:checked`)?.value||''}
function checkedValues(name){return $$(`input[name="${name}"]:checked`).map(input=>input.value)}
function fieldValue(name){return $(`[name="${name}"]`)?.value?.trim()||''}
function nonNegativeInteger(value){return /^\d+$/.test(String(value||''))}

function incompleteAnswerTarget(card){
 const controls=$$('.v15-answer input:not([type="hidden"]),.v15-answer textarea,.v15-answer select',card).filter(control=>!control.disabled&&!control.closest('[hidden]'));
 for(const control of controls){
  if(control.type==='radio'||control.type==='checkbox'){
   const group=controls.filter(item=>item.type===control.type&&item.name===control.name);
   if(!group.some(item=>item.checked))return control;
   continue;
  }
  if(!String(control.value||'').trim())return control;
 }
 return controls[0]||$('.record-button',card);
}

function missingQuestionLabel(id,title,target){
 const fieldLabels={pilot_owner_name:'שם האחראי',pilot_owner_role:'תפקיד האחראי',success_metric:'מדד הצלחה',success_target:'יעד מספרי'};
 const fieldLabel=fieldLabels[target?.name]||String(target?.placeholder||'').split('—')[0].trim();
 return fieldLabel&&!fieldLabel.startsWith('לדוגמה')?`שאלה ${id}: ${fieldLabel}`:`שאלה ${id}: ${title}`;
}

function isAnswered(card){
 const id=Number(card.dataset.questionId);
 if(card.dataset.hasRecording==='true')return typeof window.__vivaceIsTranscriptApproved==='function'?window.__vivaceIsTranscriptApproved(id):card.dataset.transcriptStatus==='approved';
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

function currentMissingItems(){
 const items=[];
 $$('.v15-question').filter(card=>REQUIRED_IDS.has(card.dataset.questionId)&&!isAnswered(card)).forEach(card=>{
  const id=Number(card.dataset.questionId),recorded=card.dataset.hasRecording==='true',title=card.dataset.questionTitle||`שאלה ${id}`,state=card.dataset.transcriptStatus||'';
  const transcriptLabel=state==='processing'?`שאלה ${id}: התמלול עדיין בעיבוד`:state==='review'?`שאלה ${id}: צריך לבדוק ולאשר את התמלול`:state==='error'?`שאלה ${id}: צריך לנסות תמלול או הקלטה מחדש`:state==='pending'?`שאלה ${id}: התמלול ממתין לאישור ההקלטות`:`שאלה ${id}: צריך לתמלל ולאשר את ההקלטה`;
  const answerTarget=incompleteAnswerTarget(card),target=recorded?($('.vivace-preview button',card)||$('.record-button',card)):answerTarget;
  items.push({kind:'question',label:recorded?transcriptLabel:missingQuestionLabel(id,title,target),container:card,target});
 });
 const name=$('#v15RespondentName'),role=$('#v15RespondentRole'),consent=$('#v15PrivacyAck'),hasRecordings=$$('.v15-question').some(card=>card.dataset.hasRecording==='true');
 if(!name?.value.trim())items.push({kind:'identity',label:'שם ממלא השאלון',container:name?.closest('label'),target:name});
 if(!role?.value.trim())items.push({kind:'identity',label:'תפקיד ממלא השאלון',container:role?.closest('label'),target:role});
 if(hasRecordings&&!consent?.checked)items.push({kind:'consent',label:'אישור שימוש בהקלטות',container:$('#v15ConsentPanel'),target:consent});
 return items;
}

function focusMissing(item){
 if(!item)return;
 item.container?.classList.add('v15-missing-focus');
 item.container?.scrollIntoView({behavior:'smooth',block:'center'});
 setTimeout(()=>{item.target?.focus?.();item.container?.classList.remove('v15-missing-focus')},450);
}

function renderMissingItems(items){
 window.__vivaceMissingItems=items;
 const list=$('#v15SubmitMissing');if(!list)return;
 list.replaceChildren();
 if(!items.length){list.hidden=true;return}
 list.hidden=false;
 const intro=document.createElement('span');intro.className='v15-missing-intro';intro.textContent=items.length===1?'חסר עוד פרט אחד:':'הפריטים שחסרים:';list.appendChild(intro);
 const shown=items.length<=6?items:[items[0]];
 shown.forEach((item,index)=>{const button=document.createElement('button');button.type='button';button.className='v15-missing-item';button.dataset.missingIndex=String(index);button.textContent=item.label;list.appendChild(button)});
 if(items.length>6){const more=document.createElement('span');more.className='v15-missing-more';more.textContent=`ועוד ${items.length-1} פריטים`;list.appendChild(more)}
}

function updateSystemSelect(){
 const selectEl=$('[name="first_system"]');if(!selectEl)return;
 const current=selectEl.value,systems=checkedValues('existing_systems').map(value=>value==='מערכת אחרת'?fieldValue('existing_systems_other'):value).filter(Boolean);
 const values=[...new Set(systems)];selectEl.innerHTML='<option value="">בחר מערכת</option>'+values.map(value=>`<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join('')+'<option value="לא בטוח">לא בטוח</option>';
 if([...values,'לא בטוח'].includes(current))selectEl.value=current;
}

function showToast(message){
 const existing=$('#toast');if(existing){existing.textContent=message;existing.classList.add('show');clearTimeout(showToast.timer);showToast.timer=setTimeout(()=>existing.classList.remove('show'),3600);return}
 let toast=document.createElement('div');toast.id='v15Toast';toast.setAttribute('role','status');toast.textContent=message;toast.style.cssText='position:fixed;left:16px;right:16px;bottom:18px;z-index:999999;background:#2C2522;color:#fff;padding:13px 16px;border-radius:12px;text-align:center;font-weight:700';document.body.appendChild(toast);setTimeout(()=>toast.remove(),3600);
}

function updateCounters(){
 $$('[data-counter-for]').forEach(counter=>{const name=counter.dataset.counterFor,limit=Number($(`[data-choice-group="${name}"]`)?.dataset.limit||0);counter.textContent=`${checkedValues(name).length} מתוך ${limit}`});
}

function enhanceSubmit(){
 const card=$('#v9FinalSubmit');if(!card)return;
 const copy=$('div[style*="font-size:14px"]',card);if(copy)copy.textContent='סיימת? בדוק את הפרטים ושלח. מתשובות קוליות יצורף רק התמלול שאישרת.';
 const button=$('#v9Send',card),status=$('#v9Status',card);if(button&&button.dataset.inviteGate!=='1'){button.disabled=true;button.style.opacity='.55';button.style.cursor='not-allowed';if(status&&!status.textContent)status.textContent='מאמת קישור הזמנה…'}
 if(!$('#v15SubmitMissing',card)&&status){const missing=document.createElement('div');missing.id='v15SubmitMissing';missing.className='v15-missing-list v15-submit-missing';status.insertAdjacentElement('beforebegin',missing)}
 $('.v15-audio-note',card)?.remove();
}

function syncAudioConsent(){
 const approved=Boolean($('#v15PrivacyAck')?.checked);
 $('#v15ConsentPanel')?.classList.toggle('is-approved',approved);
 $$('.audio-recorder').forEach(box=>{const button=$('.record-button',box),status=$('.record-status',box),recorded=box.closest('.v15-question')?.dataset.hasRecording==='true';if(button){button.disabled=false;button.classList.toggle('is-locked',!approved);button.setAttribute('aria-disabled','false');button.setAttribute('aria-label',approved?`הקלטת תשובה לשאלה ${box.dataset.recorderFor}`:`הקלטת תשובה לשאלה ${box.dataset.recorderFor} — ייפתח אישור לפני ההקלטה`)}if(status&&!button?.classList.contains('recording'))status.textContent=recorded&&!approved?'אשר הקלטות כדי לתמלל':''});
}

function updateProgress({showErrors=false}={}){
 if(showErrors)validationShown=true;
 const displayErrors=validationShown;
 const cards=$$('.v15-question'),required=cards.filter(card=>REQUIRED_IDS.has(card.dataset.questionId)),answeredRequired=required.filter(isAnswered),missing=required.filter(card=>!isAnswered(card));
 cards.forEach(card=>{const ok=isAnswered(card),recorded=card.dataset.hasRecording==='true';card.classList.toggle('is-answered',ok);if(displayErrors&&REQUIRED_IDS.has(card.dataset.questionId)&&!ok){card.classList.add('has-error');$('.v15-error',card).textContent=recorded?'צריך לבדוק ולאשר את התמלול לפני השליחה.':'צריך להשלים את השאלה לפני השליחה.'}else{card.classList.remove('has-error');$('.v15-error',card).textContent=''}});
 const progressText=$('#v15ProgressText'),progressBar=$('#v15ProgressBar');if(progressText)progressText.textContent=`${answeredRequired.length} מתוך 14`;if(progressBar)progressBar.style.width=`${Math.round(answeredRequired.length/required.length*100)}%`;
 const nameReady=Boolean($('#v15RespondentName')?.value.trim()),roleReady=Boolean($('#v15RespondentRole')?.value.trim()),hasRecordings=cards.some(card=>card.dataset.hasRecording==='true'),privacyReady=!hasRecordings||Boolean($('#v15PrivacyAck')?.checked),missingItems=currentMissingItems(),missingCount=missingItems.length,complete=missingCount===0;
 $('#v15RespondentName')?.closest('label')?.classList.toggle('has-error',displayErrors&&!nameReady);$('#v15RespondentRole')?.closest('label')?.classList.toggle('has-error',displayErrors&&!roleReady);$('#v15ConsentPanel')?.classList.toggle('has-error',displayErrors&&!privacyReady);
 document.documentElement.dataset.vivaceRequiredComplete=complete?'1':'0';document.documentElement.dataset.vivaceMissingRequired=String(missingCount);
 const requirementState=`${complete?'1':'0'}:${missingCount}`;if(lastRequirementState!==requirementState){lastRequirementState=requirementState;document.dispatchEvent(new CustomEvent('vivace:requirements-changed',{detail:{complete,missing:missingCount}}))}
 enhanceSubmit();renderMissingItems(missingItems);return{complete,missing,missingItems};
}

function bind(){
 const shell=$('#v15ShortForm');if(!shell)return;
 shell.addEventListener('change',event=>{
  const input=event.target;
  const group=input.closest?.('[data-limit]');if(group&&input.type==='checkbox'&&input.checked){const limit=Number(group.dataset.limit||0),checked=$$('input[type="checkbox"]:checked',group);if(limit&&checked.length>limit){input.checked=false;showToast(`אפשר לבחור עד ${limit} אפשרויות בשאלה הזאת`)}}
  const unknownFor=input.dataset?.unknownFor;if(unknownFor){const number=$(`[name="${unknownFor}"]`);if(number){number.disabled=input.checked;if(input.checked)number.value=''}}
  updateConditionalFields();
  if(input.name==='existing_systems'||input.name==='existing_systems_other')updateSystemSelect();
  if(input.id==='v15PrivacyAck')syncAudioConsent();
  updateCounters();updateProgress();persist();
 });
 shell.addEventListener('input',event=>{if(event.target.name==='existing_systems_other')updateSystemSelect();updateProgress();persist()});
 document.addEventListener('pointerdown',event=>{const button=event.target.closest?.('.v15-question .record-button');if(button)event.stopPropagation()},true);
 document.addEventListener('click',event=>{
  const recordButton=event.target.closest?.('.v15-question .record-button');if(recordButton){event.preventDefault();event.stopImmediatePropagation();const box=recordButton.closest('.audio-recorder');void startRecording(box?.dataset.recorderFor||'',box);return}
  const missingButton=event.target.closest?.('.v15-missing-item');if(missingButton){event.preventDefault();const result=updateProgress({showErrors:true}),index=Number(missingButton.dataset.missingIndex||0);focusMissing(result.missingItems[index]||result.missingItems[0]);return}
  const button=event.target.closest?.('#v15ReviewSubmit,#v9Send');if(!button)return;
  const result=updateProgress({showErrors:true});
  if(!result.complete){event.preventDefault();event.stopImmediatePropagation();focusMissing(result.missingItems[0]);showToast(result.missingItems.length===1?'נשאר פרט אחד — העברתי אותך אליו.':`נשארו ${result.missingItems.length} פריטים — העברתי אותך לראשון.`);return}
  if(button.id==='v9Send')return;
  event.preventDefault();event.stopImmediatePropagation();
  const submit=$('#v9FinalSubmit');submit?.scrollIntoView({behavior:'smooth',block:'center'});$('#v9Send')?.focus();
 },true);
 document.addEventListener('vivace:transcript-state-changed',()=>updateProgress());
 document.addEventListener('vivace:submission-complete',()=>{submissionComplete=true;try{localStorage.setItem(AUDIO_CLEANUP_PENDING_KEY,'1')}catch{}if(activeRecorder?.state==='recording')activeRecorder.stop();else{activeStream?.getTracks().forEach(track=>track.stop());activeStream=null;activeChunks=[]}});
 const recordingObserver=new MutationObserver(()=>{syncAudioConsent();updateProgress()});recordingObserver.observe(shell,{subtree:true,attributes:true,attributeFilter:['data-has-recording','data-transcript-status']});
 window.addEventListener('pagehide',()=>{activeStream?.getTracks().forEach(track=>track.stop())});
 setTimeout(()=>{enhanceSubmit();updateProgress()},1000);
 setTimeout(()=>{enhanceSubmit();updateProgress()},1700);
}

function revealReady(){
 document.documentElement.dataset.vivaceUiReady='1';
 $('#v15BootScreen')?.remove();
 $('#v15BootGuard')?.remove();
 document.dispatchEvent(new CustomEvent('vivace:ui-ready'));
}

function boot(){
 $('#vivaceBuildBadge')?.remove();
 if(!$('#v15Styles'))styles();
 if($('#v15ShortForm')){revealReady();return}
 const cover=$('.page.cover');if(!cover)return;
 cover.insertAdjacentHTML('afterend',formMarkup());
 $$('.page,.interactive-intro,#submitOverlay,.app-toolbar').forEach(element=>element.remove());
 if(!$('#v15LegacySink')){const sink=document.createElement('div');sink.id='v15LegacySink';sink.hidden=true;sink.innerHTML='<span id="progressText"></span><span id="progressBar"></span>';document.body.appendChild(sink)}
 const theme=$('meta[name="theme-color"]');if(theme)theme.content='#EA4A3E';document.title='Vivace — שאלון מיקוד לפיילוט';
 loadSaved();updateConditionalFields();updateSystemSelect();updateCounters();bind();syncAudioConsent();updateProgress();void restoreRecordings();try{if(localStorage.getItem(AUDIO_CLEANUP_PENDING_KEY)==='1')void clearLocalRecordings().catch(error=>console.warn('Vivace pending local audio cleanup failed',error))}catch{}
 revealReady();
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();
