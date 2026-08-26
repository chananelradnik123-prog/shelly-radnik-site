import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const here=dirname(fileURLToPath(import.meta.url));
const read=name=>readFileSync(join(here,name),'utf8');
const indexHtml=read('index.html');
const scriptStart=indexHtml.indexOf('<script>',indexHtml.indexOf('<body>'));
const scriptEnd=indexHtml.lastIndexOf('</script>');
const indexScript=indexHtml.slice(scriptStart+'<script>'.length,scriptEnd).trim();
const baseParts=Array.from({length:7},(_,index)=>read(`v5.part${String(index).padStart(2,'0')}.b64`));

function response(text,{ok=true,status=200}={}){
 return{ok,status,text:async()=>text};
}

function createHarness({search='',fetchImpl,decompression=true}={}){
 class FakeStorage{
  constructor(){this.values=new Map()}
  getItem(key){return this.values.has(String(key))?this.values.get(String(key)):null}
  setItem(key,value){this.values.set(String(key),String(value))}
  removeItem(key){this.values.delete(String(key))}
 }
 const title={textContent:'מכין את שאלון Vivace'};
 const copy={textContent:'עוד רגע אפשר להתחיל'};
 const line={removed:false,remove(){this.removed=true}};
 const boot={querySelector(selector){return selector==='.vboot-title'?title:selector==='.vboot-copy'?copy:selector==='.vboot-line'?line:null}};
 const body={innerHTML:''};
 const writes=[];
 const errors=[];
 const historyUrls=[];
 const timers=[];
 const localStorage=new FakeStorage(),sessionStorage=new FakeStorage();
 const document={
  body,
  getElementById(){return null},
  querySelector(selector){return selector==='body > .vboot'?boot:null},
  open(){},
  write(value){writes.push(String(value))},
  close(){},
 };
 const context={
  AbortController,
  Blob,
  DecompressionStream:decompression?DecompressionStream:undefined,
  Response,
  Storage:FakeStorage,
  URLSearchParams,
  Uint8Array,
  atob,
  clearTimeout(id){const timer=timers.find(item=>item.id===id);if(timer)timer.cleared=true},
  console:{error(...args){errors.push(args)},warn(){}},
  crypto:{randomUUID:()=> '11111111-2222-4333-8444-555555555555'},
  document,
  fetch:fetchImpl||((url)=>{
   const match=String(url).match(/v5\.part(\d{2})\.b64/);
   if(!match)throw new Error(`Unexpected fetch: ${url}`);
   return Promise.resolve(response(baseParts[Number(match[1])]));
  }),
  history:{replaceState(_state,_title,url){historyUrls.push(String(url))}},
  indexedDB:{open(name){return{name}},deleteDatabase(name){return{name}}},
  localStorage,
  location:{pathname:'/vivace-discovery/',search},
  sessionStorage,
  setTimeout(callback,ms){const id=timers.length+1;timers.push({id,callback,ms,cleared:false});return id},
  window:null,
 };
 context.window=context;
 return{
  body,copy,errors,historyUrls,line,localStorage,sessionStorage,timers,title,writes,
  run:()=>new vm.Script(indexScript,{filename:'index-inline.js'}).runInNewContext(context),
 };
}

test('all browser scripts parse',()=>{
 new vm.Script(indexScript,{filename:'index-inline.js'});
 for(const file of readdirSync(here).filter(name=>name.endsWith('.js'))){
  new vm.Script(read(file),{filename:file});
 }
});

test('seven base parts start in parallel and retain numeric order',async()=>{
 const calls=[];
 const pending=[];
 const harness=createHarness({fetchImpl:url=>{
  const match=String(url).match(/v5\.part(\d{2})\.b64/);
  assert.ok(match,`unexpected URL ${url}`);
  const index=Number(match[1]);calls.push(index);
  return new Promise(resolve=>pending[index]=()=>resolve(response(baseParts[index])));
 }});
 const completion=harness.run();
 await Promise.resolve();
 assert.deepEqual(calls,[0,1,2,3,4,5,6]);
 for(let index=6;index>=0;index--)pending[index]();
 await completion;
 assert.equal(harness.writes.length,1);
 const output=harness.writes[0];
 assert.ok(output.includes('v13audioguard.js?v=22.0'));
 assert.ok(output.includes('v15sendready.js?v=22.0'));
 assert.ok(output.includes('window.__vivacePatchLoadFailed=true'));
 assert.equal((output.match(/rel="preload" as="script"/g)||[]).length,5);
 assert.ok(output.indexOf('id="v15BootScreen"')<output.indexOf('class="page cover"'));
});

test('new invitation creates one same-document session and hides token',async()=>{
 const invite='a'.repeat(64);
 const harness=createHarness({search:`?new=1&invite=${invite}`});
 await harness.run();
 assert.equal(harness.historyUrls.length,2);
 assert.match(harness.historyUrls.at(-1),/session=11111111-2222-4333-8444-555555555555/);
 assert.match(harness.historyUrls.at(-1),/build=clean-ui-22-0/);
 assert.doesNotMatch(harness.historyUrls.at(-1),/invite=/);
 const key='vivace-session:11111111-2222-4333-8444-555555555555:vivace-invite-token-v1';
 assert.equal(harness.sessionStorage.values.get(key),invite);
});

for(const [name,declaration] of [
 ['semicolon',"const ENDPOINT=location.href.split('?')[0];"],
 ['comma',"const ENDPOINT=location.href.split('?')[0],app={};"],
]){
 test(`admin endpoint patch supports ${name} declaration`,async()=>{
  const admin=`<!doctype html><script>${declaration}async function loginWithKey(key){const r=await fetch(ENDPOINT,{method:'POST'});return r}</script>`;
  const harness=createHarness({search:'?admin=1',fetchImpl:()=>Promise.resolve(response(admin))});
  await harness.run();
  assert.equal(harness.writes.length,1);
  const output=harness.writes[0];
  assert.match(output,/const ENDPOINT='https:\/\/eadljasmuqnzcrfudsib\.supabase\.co\/functions\/v1\/vivace-admin'/);
  assert.match(output,/const LOGIN_ENDPOINT='https:\/\/eadljasmuqnzcrfudsib\.supabase\.co\/functions\/v1\/vivace-admin-login'/);
  assert.match(output,/fetch\(LOGIN_ENDPOINT,/);
  assert.ok(harness.timers.some(timer=>timer.ms===15000&&timer.cleared));
 });
}

test('admin patch fails closed when the remote contract changes',async()=>{
 const harness=createHarness({search:'?admin=1',fetchImpl:()=>Promise.resolve(response('<!doctype html><p>changed</p>'))});
 await harness.run();
 assert.equal(harness.writes.length,0);
 assert.match(harness.body.innerHTML,/לא ניתן לטעון את השאלון/);
 assert.match(String(harness.errors[0]?.[0]?.message),/patch target missing/);
});

test('failed base part reports its exact index and does not write legacy HTML',async()=>{
 const harness=createHarness({fetchImpl:url=>{
  const index=Number(String(url).match(/part(\d{2})/)[1]);
  return Promise.resolve(response(baseParts[index],index===3?{ok:false,status:503}:undefined));
 }});
 await harness.run();
 assert.equal(harness.writes.length,0);
 assert.match(String(harness.errors[0]?.[0]?.message),/part 3 503/);
});

test('unsupported decompression and fetch timeout have explicit messages',async()=>{
 const unsupported=createHarness({decompression:false});
 await unsupported.run();
 assert.match(unsupported.body.innerHTML,/הדפדפן אינו נתמך/);
 assert.match(unsupported.body.innerHTML,/Chrome, Safari, Edge או Firefox/);

 const timeoutError=Object.assign(new Error('aborted'),{name:'AbortError'});
 const timedOut=createHarness({fetchImpl:()=>Promise.reject(timeoutError)});
 await timedOut.run();
 assert.match(timedOut.body.innerHTML,/הטעינה מתארכת מדי/);
});

test('global loading watchdog replaces a stuck boot state',()=>{
 const harness=createHarness({fetchImpl:()=>new Promise(()=>{})});
 void harness.run();
 const watchdog=harness.timers.find(timer=>timer.ms===15000);
 assert.ok(watchdog);
 watchdog.callback();
 assert.equal(harness.title.textContent,'הטעינה מתארכת מדי');
 assert.equal(harness.line.removed,true);
});

test('release UI contract includes progress, mobile, accessibility and transcript safeguards',()=>{
 const form=read('v15sendready.js');
 const preview=read('v14preview.js');
 const submit=read('v9patch.js');
 const invite=read('v12invite.js');
 assert.match(form,/0 מתוך 16/);
 assert.match(form,/baseTotal=required\.length\+2/);
 assert.match(form,/font-size:16px;direction:rtl/);
 assert.match(form,/vivace-transcript-editor[^}]*font-size:16px/);
 assert.match(form,/role="group" aria-labelledby=/);
 assert.match(form,/role="radiogroup" aria-labelledby=/);
 assert.match(form,/prefers-reduced-motion:reduce/);
 assert.match(form,/!dialog\.contains\(active\).*event\.shiftKey\?last:first/);
 assert.match(form,/validationTarget=item\?\.target/);
 assert.match(form,/showValidationFor\(missingItems\[0\]\)/);
 assert.match(form,/window\.__vivacePatchLoadFailed/);
 assert.match(indexHtml,/cache:'force-cache'/);
 assert.match(indexHtml,/fetchWithTimeout/);
 assert.match(preview,/body\.previewTranscripts=approved/);
 assert.match(preview,/data-vivace-transcript/);
 assert.match(submit,/recordings:\[\]/);
 assert.match(invite,/gemini-paid-user-consent-v1/);
 assert.doesNotMatch(submit,/gemini-free-no-sensitive-v1/);
});

test('operations guide matches the no-raw-audio paid-mode client',()=>{
 const operations=read('OPERATIONS.md');
 assert.match(operations,/current web client sends `recordings: \[\]`/i);
 assert.match(operations,/Gemini Paid/);
 assert.match(operations,/Only the transcript approved by the user is submitted/i);
 assert.doesNotMatch(operations,/unpaid Gemini API tier/i);
});

test('questionnaire assets stay inside the first-load size budget',()=>{
 const assets=['index.html',...Array.from({length:7},(_,index)=>`v5.part${String(index).padStart(2,'0')}.b64`),'v13audioguard.js','v14preview.js','v9patch.js','v12invite.js','v15sendready.js'];
 const bytes=assets.reduce((total,name)=>total+statSync(join(here,name)).size,0);
 assert.ok(bytes<=170*1024,`first-load assets are ${bytes} bytes`);
});
