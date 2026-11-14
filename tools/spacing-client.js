import {measureSpacing,measureDistance} from './spacing-geometry.js';

export function observeSpacing(nodeFor,report){
  let selected=null,animation=0,last='',sending=false,measuring=null;
  const send=(boxes,size={width:0,height:0,direction:''})=>{
    const packet={kind:'spacing',id:selected?.id??'',plan:selected?.plan??globalThis.exact?.plan??'',width:size.width,height:size.height,direction:size.direction,boxes},message=JSON.stringify(packet);
    if(message===last||sending)return;
    sending=true;Promise.resolve(report(packet)).then(ok=>{if(ok)last=message;}).finally(()=>{sending=false;});
  };
  const clear=()=>{cancelAnimationFrame(animation);selected=null;send([]);};
  // The rendered flex direction: the alignment grid maps its cells by it, even when source leaves it unset.
  const flow=el=>{const css=getComputedStyle(el);return css.display.includes('flex')?css.flexDirection:'';};
  function draw(){
    const el=nodeFor(selected?.id);
    if(!el?.isConnected||selected.plan!==globalThis.exact?.plan||!document.getElementById('exact-inspect')){clear();return;}
    const rect=el.getBoundingClientRect(),target=measuring?.isConnected&&measuring!==el?measuring.getBoundingClientRect():null;
    // Holding Alt over another element replaces the spacing overlay with distances to it.
    const distances=target?measureDistance(rect,target):[];
    send(distances.length?distances:measureSpacing(el,getComputedStyle,{width:innerWidth,height:innerHeight}),{width:rect.width,height:rect.height,direction:flow(el)});
    animation=requestAnimationFrame(draw);
  }
  function select(id,plan){
    if(selected?.id===id&&selected?.plan===plan)return;
    clear();measuring=null;
    if(typeof id!=='string'||!id||plan!==globalThis.exact?.plan)return;
    selected={id,plan};draw();
  }
  // Pointer events reach the preview directly; Alt arrives with them, or as keys once the preview has focus.
  let pointer=null;
  const hit=()=>{
    if(!pointer?.alt||!selected)return null;
    const root=document.getElementById('exact-root');
    // Outline marks sit inside the root without a site; measure to the topmost authored element.
    return document.elementsFromPoint(pointer.x,pointer.y).find(el=>root?.contains(el)&&el.hasAttribute('data-site'))??null;
  };
  const track=()=>{measuring=hit();};
  const move=e=>{pointer={x:e.clientX,y:e.clientY,alt:e.altKey};track();};
  const key=e=>{if(e.key==='Alt'&&pointer){pointer.alt=e.type==='keydown';track();}};
  const leave=()=>{pointer=null;measuring=null;};
  // Focus is usually in the studio, so its Alt key and window blur arrive from the parent page.
  const relay=e=>{
    if(e.source!==parent||e.data?.kind!=='exact-design:alt')return;
    if(!e.data.down){measuring=null;if(pointer)pointer.alt=false;}
    else if(pointer){pointer.alt=true;track();}
  };
  addEventListener('message',relay);
  // In canvas mode the canvas input client takes pointer moves first and forwards them here.
  window.__exactDesignMeasure=move;
  addEventListener('pointermove',move,true);addEventListener('keydown',key,true);addEventListener('keyup',key,true);
  addEventListener('blur',leave);document.documentElement.addEventListener('pointerleave',leave);
  addEventListener('pagehide',clear);
  return {select,clear};
}
