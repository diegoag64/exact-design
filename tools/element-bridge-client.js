// Runs only in the local development proxy, never in the app's source.
const frame=new URL(location.href).searchParams.get('__ed_frame')||'preview';
const nodes=new Map();let command=0,selectionCommand=0,working=false,pushed=false;
const style=document.createElement('style');style.textContent='#exact-inspect{display:none!important}';document.head.append(style);
const outline=document.createElement('div');outline.dataset.edHover='';outline.setAttribute('aria-hidden','true');
outline.style.cssText='position:fixed;pointer-events:none;z-index:2147483647;box-sizing:border-box;border:1px solid #3b82f6;';
let hovered='',hoverPlan='',hoverAnimation=0;
function clearHover(){hovered='';cancelAnimationFrame(hoverAnimation);outline.remove();}
function drawHover(){
  const el=nodes.get(hovered);
  if(!el?.isConnected||hoverPlan!==globalThis.exact?.plan||!document.getElementById('exact-inspect')){clearHover();return;}
  const rect=el.getBoundingClientRect();
  Object.assign(outline.style,{left:rect.left+'px',top:rect.top+'px',width:rect.width+'px',height:rect.height+'px'});
  if(!outline.isConnected)document.body.append(outline);
  hoverAnimation=requestAnimationFrame(drawHover);
}
function hover(id,plan){clearHover();if(!id||plan!==globalThis.exact?.plan)return;hovered=id;hoverPlan=plan;drawHover();}
addEventListener('pagehide',clearHover);
function snapshot(){
  nodes.clear();const rows=[],ids=new Map();
  for(const el of document.querySelectorAll('#exact-root [data-site]')){
    if(rows.length>=600)break;
    if(el.closest('[data-exiting], [hidden], [inert]') || !el.checkVisibility({visibilityProperty:true,contentVisibilityAuto:true}))continue;
    const rect=el.getBoundingClientRect();if(!rect.width||!rect.height)continue;
    let parent=el.parentElement?.closest('[data-site]');while(parent&&!ids.has(parent))parent=parent.parentElement?.closest('[data-site]');
    const instance=globalThis.exact?.instanceOf?.(el)??[];
    const identity=JSON.stringify([Number(el.dataset.site),instance]);
    const parentId=ids.get(parent)||'';
    const tag=el.tagName.toLowerCase();
    const path=(rows.find(r=>r.id===parentId)?.path||'root')+'/'+rows.filter(r=>r.parent===parentId).length+':'+tag;
    const id=path;ids.set(el,id);nodes.set(id,el);
    const css=getComputedStyle(el),container=css.display.includes('flex')?(css.flexDirection.startsWith('row')?'Row':'Column'):(['auto','scroll'].includes(css.overflowY)?'Scroll':'Container');
    const label=el.getAttribute('aria-label')||el.dataset.testid||el.getAttribute('data-testid')||(['span','button','h1','h2','p'].includes(tag)?el.textContent?.trim().slice(0,55):'')||({div:container,span:'Text',img:'Image',button:'Button',main:'Screen',header:'Header',section:'Section'}[tag]||tag);
    rows.push({id,identity,path,parent:parentId,depth:parentId?(rows.find(r=>r.id===parentId)?.depth??0)+1:0,label,tag,site:Number(el.dataset.site),instance});
  }
  return {frame,build:window.__exactDesignBuild||'',plan:globalThis.exact?.plan||'',inspecting:!!document.getElementById('exact-inspect'),nodes:rows};
}
async function select(id,sequence){
  const el=nodes.get(id);if(!el?.isConnected||!document.getElementById('exact-inspect'))return;
  el.scrollIntoView({block:'center',inline:'nearest',behavior:'instant'});
  await new Promise(requestAnimationFrame);
  if(sequence!==selectionCommand)return;
  const rect=el.getBoundingClientRect(),x=Math.max(1,Math.min(innerWidth-1,rect.left+rect.width/2)),y=Math.max(1,Math.min(innerHeight-1,rect.top+rect.height/2));
  // The inspector's gate receives the press. Keep descendants out of hit testing
  // briefly so a container can be selected even when children cover its padding.
  const marker='ed-'+Math.random().toString(36).slice(2);el.setAttribute('data-ed-pick',marker);
  const mask=document.createElement('style');mask.textContent=`[data-ed-pick="${marker}"] *{pointer-events:none!important}`;document.head.append(mask);
  try{
    const inspector=await import('/__dev/inspect.js');
    if(sequence!==selectionCommand)return;
    for(const type of ['pointerdown','pointerup'])inspector.gate(new PointerEvent(type,{bubbles:true,clientX:x,clientY:y,pointerId:991,button:0}));
  }
  finally{mask.remove();el.removeAttribute('data-ed-pick');}
}
async function deliver(task){
  if(!Number.isSafeInteger(task.seq)||task.seq<=command)return;
  command=task.seq;
  if(task.op==='select'){selectionCommand=task.seq;if(task.plan===globalThis.exact?.plan)await select(task.id,task.seq);}
  if(task.op==='hover')hover(task.id,task.plan);
}
const events=new EventSource('/__exact_design/events?frame='+encodeURIComponent(frame));
events.onopen=()=>{pushed=true;};events.onerror=()=>{pushed=false;clearHover();};
events.onmessage=e=>{try{void deliver(JSON.parse(e.data)).catch(()=>{});}catch{}};
async function tick(){
  if(working)return;working=true;
  try{
    const response=await fetch('/__exact_design/tree',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({...snapshot(),after:command})});
    if(!response.ok)return;
    const tasks=(await response.json()).commands||[];
    if(!pushed)for(const task of tasks)await deliver(task);
  }catch{}finally{working=false;}
}
setInterval(tick,400);void tick();
import('/__exact_design/spacing-client.js').then(m=>m.observeSpacing(id=>nodes.get(id))).catch(()=>{});
