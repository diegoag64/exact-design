/** The tab that Open in Simulator opens: it shows the job's steps while the helper builds, starts the cloud iPhone and
 *  opens the screen, then turns into the simulator. It polls `status` (same origin) and never sees the access token. */
const escape=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const MARK='M0 20.084c.043.53.23 1.063.718 1.778.58.849 1.576 1.315 2.303.567.49-.505 5.794-9.776 8.35-13.29a.761.761 0 011.248 0c2.556 3.514 7.86 12.785 8.35 13.29.727.748 1.723.282 2.303-.567.57-.835.728-1.42.728-2.046 0-.426-8.26-15.798-9.092-17.078-.8-1.23-1.044-1.498-2.397-1.542h-1.032c-1.353.044-1.597.311-2.398 1.542C8.267 3.991.33 18.758 0 19.77Z';
/** The link the studio opens, without its device and route, which the view adds. */
export const expoOpenLink=(origin:string,project:string,key:string)=>`${origin}/expo/open?project=${encodeURIComponent(project)}&key=${key}`;
export function expoOpenPage(status:string,title:string){
  return new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(title)}</title>
<style>
:root{color-scheme:light dark;--bg:#f5f5f5;--card:#fff;--ink:#1e1e1e;--muted:#757575;--line:#e6e6e6;--accent:#0d99ff;--danger:#e03e1a;--tile:#1e1e1e;--tileInk:#fff}
@media (prefers-color-scheme:dark){:root{--bg:#1e1e1e;--card:#2c2c2c;--ink:#f5f5f5;--muted:#a0a0a0;--line:#3d3d3d;--tile:#f5f5f5;--tileInk:#1e1e1e;--danger:#ff7a5c}}
*{box-sizing:border-box}body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:16px;background:var(--bg);color:var(--ink);font:13px/1.45 Inter,system-ui,-apple-system,sans-serif}
main{width:100%;max-width:400px;background:var(--card);border:1px solid var(--line);border-radius:12px;box-shadow:0 8px 24px #0000001a;overflow:hidden}
header{display:flex;gap:10px;align-items:center;padding:14px 16px;border-bottom:1px solid var(--line)}.tile{width:28px;height:28px;border-radius:6px;background:var(--tile);color:var(--tileInk);display:flex;align-items:center;justify-content:center;flex-shrink:0}
h1{font-size:14px;margin:0;font-weight:600}header p{margin:0;color:var(--muted);font-size:11px}
ol{list-style:none;margin:0;padding:14px 16px;display:flex;flex-direction:column;gap:10px}li{display:flex;gap:8px;align-items:flex-start}li .icon{width:16px;height:16px;flex-shrink:0;display:flex;align-items:center;justify-content:center;margin-top:1px}
li.pending{color:var(--muted)}li.active .label{font-weight:600}li.active .icon{color:var(--accent)}li.failed .icon{color:var(--danger)}.detail{display:block;color:var(--muted);font-size:11px}
.dot{width:8px;height:8px;border-radius:4px;border:1.5px solid currentColor}.spin{animation:spin 1s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}@media (prefers-reduced-motion:reduce){.spin{animation:none}}
footer{padding:10px 16px 14px;color:var(--muted);font-size:11px;border-top:1px solid var(--line)}footer.error{color:var(--danger)}
</style></head><body><main aria-live="polite"><header><div class="tile" aria-hidden="true"><svg width="16" height="16" viewBox="0 0 24 24"><path fill="currentColor" d="${MARK}"/></svg></div><div><h1>${escape(title)}</h1><p>Expo Simulators</p></div></header>
<ol id="steps"><li class="active"><span class="icon"><svg class="spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 1 1-6.2-8.6"/></svg></span><span class="label">Starting…</span></li></ol>
<footer id="note">This tab becomes the simulator when it’s ready.</footer></main>
<script>
const status=${JSON.stringify(status)};const steps=document.getElementById('steps'),note=document.getElementById('note');
const icon=s=>s==='active'?'<svg class="spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 1 1-6.2-8.6"/></svg>':s==='done'||s==='skipped'?'<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6 9 17l-5-5"/></svg>':s==='failed'?'!':'<span class="dot"></span>';
const text=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function poll(){
  let v;try{v=await (await fetch(status,{cache:'no-store'})).json();}catch{note.textContent='Lost the studio helper. Is bun run dev still running?';note.className='error';setTimeout(poll,2000);return;}
  if(v.steps&&v.steps.length)steps.innerHTML=v.steps.map(s=>'<li class="'+text(s.state)+'"><span class="icon">'+icon(s.state)+'</span><span><span class="label">'+text(s.label)+'</span>'+(s.detail&&s.state!=='pending'?'<span class="detail">'+text(s.detail)+'</span>':'')+'</span></li>').join('');
  if(v.state==='working'){setTimeout(poll,1000);return;}
  if(v.state==='idle'&&v.running&&/^https:\\/\\//.test(v.url)){note.textContent='Opening the simulator…';location.replace(v.url);return;}
  note.textContent=v.error||'The cloud iPhone did not start. Try again from the studio.';note.className='error';
}
poll();
</script></body></html>`,{headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store','content-security-policy':"default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; img-src 'self'",'referrer-policy':'no-referrer'}});
}
