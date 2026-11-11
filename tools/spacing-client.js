import {measureSpacing} from './spacing-geometry.js';

export function observeSpacing(nodeFor){
  let selected=null,animation=0,last='';
  const send=boxes=>{
    const message=JSON.stringify({kind:'exact-design:spacing',id:selected?.id??'',plan:selected?.plan??'',boxes});
    if(message!==last){last=message;parent.postMessage(message,'*');}
  };
  const clear=()=>{cancelAnimationFrame(animation);selected=null;send([]);};
  function draw(){
    const el=nodeFor(selected?.id);
    if(!el?.isConnected||selected.plan!==globalThis.exact?.plan||!document.getElementById('exact-inspect')){clear();return;}
    send(measureSpacing(el,getComputedStyle,{width:innerWidth,height:innerHeight}));
    animation=requestAnimationFrame(draw);
  }
  addEventListener('message',event=>{
    if(event.source!==parent||typeof event.data!=='string')return;
    if(!event.data){clear();return;}
    let message;try{message=JSON.parse(event.data);}catch{return;}
    if(message.kind!=='exact-design:spacing')return;
    if(selected?.id===message.id&&selected?.plan===message.plan)return;
    clear();
    if(typeof message.id!=='string'||!message.id||message.plan!==globalThis.exact?.plan)return;
    selected={id:message.id,plan:message.plan};draw();
  });
  addEventListener('pagehide',clear);
}
