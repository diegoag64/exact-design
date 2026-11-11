// Runs only in the local development proxy, never in the app's source.
const frame=new URL(location.href).searchParams.get('__ed_frame')||'preview';
const nodes=new Map();let command=0,working=false;
const style=document.createElement('style');style.textContent='#exact-inspect{display:none!important}';document.head.append(style);
function snapshot(){
  nodes.clear();const rows=[],ids=new Map();
  for(const el of document.querySelectorAll('#exact-root [data-site]')){
    if(rows.length>=600)break;
    if(el.closest('[data-exiting], [hidden], [inert]') || !el.checkVisibility({visibilityProperty:true,contentVisibilityAuto:true}))continue;
    const rect=el.getBoundingClientRect();if(!rect.width||!rect.height)continue;
    let parent=el.parentElement?.closest('[data-site]');while(parent&&!ids.has(parent))parent=parent.parentElement?.closest('[data-site]');
    const instance=globalThis.exact?.instanceOf?.(el)??[];
    const identity=JSON.stringify([Number(el.dataset.site),instance]);
    const id=identity+':'+rows.filter(r=>r.identity===identity).length;
    const parentId=ids.get(parent)||'';ids.set(el,id);nodes.set(id,el);
    const tag=el.tagName.toLowerCase();
    const path=(rows.find(r=>r.id===parentId)?.path||'root')+'/'+rows.filter(r=>r.parent===parentId).length+':'+tag;
    const css=getComputedStyle(el),container=css.display.includes('flex')?(css.flexDirection.startsWith('row')?'Row':'Column'):(['auto','scroll'].includes(css.overflowY)?'Scroll':'Container');
    const label=el.getAttribute('aria-label')||el.dataset.testid||el.getAttribute('data-testid')||(['span','button','h1','h2','p'].includes(tag)?el.textContent?.trim().slice(0,55):'')||({div:container,span:'Text',img:'Image',button:'Button',main:'Screen',header:'Header',section:'Section'}[tag]||tag);
    rows.push({id,identity,path,parent:parentId,depth:parentId?(rows.find(r=>r.id===parentId)?.depth??0)+1:0,label,tag,site:Number(el.dataset.site),instance});
  }
  return {frame,build:window.__exactDesignBuild||'',plan:globalThis.exact?.plan||'',inspecting:!!document.getElementById('exact-inspect'),nodes:rows};
}
async function select(id){
  const el=nodes.get(id);if(!el?.isConnected||!document.getElementById('exact-inspect'))return;
  el.scrollIntoView({block:'center',inline:'nearest',behavior:'instant'});
  await new Promise(requestAnimationFrame);
  const rect=el.getBoundingClientRect(),x=Math.max(1,Math.min(innerWidth-1,rect.left+rect.width/2)),y=Math.max(1,Math.min(innerHeight-1,rect.top+rect.height/2));
  // The inspector's gate receives the press. Keep descendants out of hit testing
  // briefly so a container can be selected even when children cover its padding.
  const marker='ed-'+Math.random().toString(36).slice(2);el.setAttribute('data-ed-pick',marker);
  const mask=document.createElement('style');mask.textContent=`[data-ed-pick="${marker}"] *{pointer-events:none!important}`;document.head.append(mask);
  try{
    const inspector=await import('/__dev/inspect.js');
    for(const type of ['pointerdown','pointerup'])inspector.gate(new PointerEvent(type,{bubbles:true,clientX:x,clientY:y,pointerId:991,button:0}));
  }
  finally{mask.remove();el.removeAttribute('data-ed-pick');}
}
async function tick(){
  if(working)return;working=true;
  try{
    const response=await fetch('/__exact_design/tree',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({...snapshot(),after:command})});
    if(!response.ok)return;
    for(const task of (await response.json()).commands||[]){command=task.seq;if(task.op==='select'&&task.plan===globalThis.exact?.plan)await select(task.id);}
  }catch{}finally{working=false;}
}
setInterval(tick,400);void tick();
