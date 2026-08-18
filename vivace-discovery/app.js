(async()=>{
  const parts=[];
  for(let i=0;i<3;i++){
    const r=await fetch(`app.part${String(i).padStart(2,'0')}.b64`,{cache:'no-store'});
    if(!r.ok) throw new Error('Failed to load app bundle part '+i);
    parts.push(await r.text());
  }
  const bin=atob(parts.join('').replace(/\s+/g,''));
  const bytes=Uint8Array.from(bin,c=>c.charCodeAt(0));
  const code=new TextDecoder('utf-8').decode(bytes);
  (0,eval)(code);
})().catch(err=>{console.error(err);document.body.insertAdjacentHTML('afterbegin','<div style="direction:rtl;background:#fee;padding:12px">שגיאה בטעינת הטופס. נסה לרענן.</div>')});
