import {measureSpacing} from './spacing-geometry.js';

export function observeSpacing(nodeFor,report){
  let selected=null,animation=0,last='',sending=false;
  const send=boxes=>{
    const packet={kind:'spacing',id:selected?.id??'',plan:selected?.plan??globalThis.exact?.plan??'',boxes},message=JSON.stringify(packet);
    if(message===last||sending)return;
    sending=true;Promise.resolve(report(packet)).then(ok=>{if(ok)last=message;}).finally(()=>{sending=false;});
  };
  const clear=()=>{cancelAnimationFrame(animation);selected=null;send([]);};
  function draw(){
    const el=nodeFor(selected?.id);
    if(!el?.isConnected||selected.plan!==globalThis.exact?.plan||!document.getElementById('exact-inspect')){clear();return;}
    send(measureSpacing(el,getComputedStyle,{width:innerWidth,height:innerHeight}));
    animation=requestAnimationFrame(draw);
  }
  function select(id,plan){
    if(selected?.id===id&&selected?.plan===plan)return;
    clear();
    if(typeof id!=='string'||!id||plan!==globalThis.exact?.plan)return;
    selected={id,plan};draw();
  }
  addEventListener('pagehide',clear);
  return {select,clear};
}
