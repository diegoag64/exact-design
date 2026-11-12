// Runs only in the local development proxy, never in the app's source.
const frame=new URL(location.href).searchParams.get('__ed_frame')||'preview';
const page=crypto.randomUUID();
const nodes=new Map();let command=0,selectionCommand=0,working=false,pushed=false;
let pageObserver;
let spacingObserver,measurement={id:'',plan:''};
let draftObserver,draft={patches:[],revision:0};
async function renderDraft(){
  if(!draftObserver)return;
  const current=draft;
  try{await draftObserver.apply(current.patches);if(current===draft)void feedback({kind:'draft-status',revision:current.revision,plan:globalThis.exact?.plan||'',error:''});}
  catch(error){if(current===draft)void feedback({kind:'draft-status',revision:current.revision,plan:globalThis.exact?.plan||'',error:String(error.message??error).slice(0,300)});}
}
async function feedback(packet){
  try{return (await fetch('/__exact_design/feedback',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({...packet,frame,page})})).ok;}catch{return false;}
}
window.__exactDesignPick=(x,y)=>{
  if(!document.getElementById('exact-inspect'))return;
  const root=document.getElementById('exact-root');
  const el=document.elementsFromPoint(x,y).find(el=>root?.contains(el))?.closest('[data-site]');
  const id=[...nodes].find(([,node])=>node===el)?.[0];
  if(id)void feedback({kind:'pick',id,plan:globalThis.exact?.plan||''});
};
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
function presentElement(el,css){
  const tag=el.tagName.toLowerCase(),text=el.textContent?.trim().replace(/\s+/g,' ').slice(0,120)||'';
  const flex=css.display.includes('flex'),grid=css.display.includes('grid');
  const scroll=el.dataset.edPageScroll!==undefined||['auto','scroll'].includes(css.overflowY)||['auto','scroll'].includes(css.overflowX);
  const leaf=!el.querySelector?.('[data-site]');
  const kind=tag==='button'?'button':tag==='img'||tag==='svg'?'image':['input','textarea','select'].includes(tag)?'input':tag==='main'?'screen':scroll?'scroll':flex?(css.flexDirection.startsWith('row')?'row':'column'):grid?'grid':leaf&&text?'text':'container';
  const names={button:'Button',image:'Image',input:'Input',screen:'Screen',scroll:'Scroll',row:'Row',column:'Column',grid:'Grid',text:'Text',container:'Container'};
  const explicit=(el.getAttribute('aria-label')||el.getAttribute('data-testid')||el.dataset.testid||'').trim().replace(/\s+/g,' ').slice(0,120);
  return {kind,label:explicit||(kind==='text'||kind==='button'?text:'')||names[kind]};
}
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
    const {kind,label}=presentElement(el,getComputedStyle(el));
    rows.push({id,identity,path,parent:parentId,depth:parentId?(rows.find(r=>r.id===parentId)?.depth??0)+1:0,label,kind,tag,site:Number(el.dataset.site),instance});
  }
  return {...pageObserver?.snapshot(),frame,page,build:window.__exactDesignBuild||'',plan:globalThis.exact?.plan||'',inspecting:!!document.getElementById('exact-inspect'),nodes:rows};
}
// Scroll only this document. scrollIntoView also scrolls the embedding
// editor's overflow:hidden canvas, independently of its camera coordinates.
function revealWithinFrame(el){
  const delta=(start,end,low,high)=>end-start>high-low?start-low:start<low?start-low:end>high?end-high:0;
  for(let at=el.parentElement;at;at=at.parentElement){
    const root=at===document.scrollingElement,css=getComputedStyle(at),box=at.getBoundingClientRect();
    const sx=root?1:(box.width/at.offsetWidth||1),sy=root?1:(box.height/at.offsetHeight||1);
    const left=root?0:box.left+at.clientLeft*sx,top=root?0:box.top+at.clientTop*sy;
    const width=root?innerWidth:at.clientWidth*sx,height=root?innerHeight:at.clientHeight*sy;
    const rect=el.getBoundingClientRect();
    const x=(root||['auto','scroll','hidden'].includes(css.overflowX))&&at.scrollWidth>at.clientWidth?delta(rect.left,rect.right,left,left+width)/sx:0;
    const y=(root||['auto','scroll','hidden'].includes(css.overflowY))&&at.scrollHeight>at.clientHeight?delta(rect.top,rect.bottom,top,top+height)/sy:0;
    if(x||y)at.scrollTo({left:at.scrollLeft+x,top:at.scrollTop+y,behavior:'instant'});
  }
}
async function select(id,sequence){
  const el=nodes.get(id);if(!el?.isConnected||!document.getElementById('exact-inspect'))return;
  revealWithinFrame(el);
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
    const bounds=el.getBoundingClientRect();
    window.parent?.postMessage({kind:'exact-design:canvas',op:'reveal',x:bounds.left,y:bounds.top,width:bounds.width,height:bounds.height},'*');
    for(const type of ['pointerdown','pointerup'])inspector.gate(new PointerEvent(type,{bubbles:true,clientX:x,clientY:y,pointerId:991,button:0}));
  }
  finally{mask.remove();el.removeAttribute('data-ed-pick');}
}
async function deliver(task){
  if(!Number.isSafeInteger(task.seq)||task.seq<=command)return;
  command=task.seq;
  if(task.op==='select'){selectionCommand=task.seq;if(task.plan===globalThis.exact?.plan)await select(task.id,task.seq);}
  if(task.op==='hover')hover(task.id,task.plan);
  if(task.op==='measure'){measurement={id:task.id,plan:task.plan};spacingObserver?.select(task.id,task.plan);}
  if(task.op==='draft'){draft={patches:task.patches||[],revision:task.draftRevision};void renderDraft();}
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
import('/__exact_design/spacing-client.js').then(m=>{spacingObserver=m.observeSpacing(id=>nodes.get(id),feedback);spacingObserver.select(measurement.id,measurement.plan);}).catch(()=>{});
import('/__exact_design/design-preview-client.js').then(m=>{draftObserver=m.designPreview();void renderDraft();}).catch(()=>{});

import('/__exact_design/full-page-client.js').then(m=>{pageObserver=m.fullPage(packet=>feedback({...packet,plan:globalThis.exact?.plan||''}));}).catch(()=>{});
