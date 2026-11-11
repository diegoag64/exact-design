// Iframe input cannot bubble to the editor. Only inspected preview frames may
// relay navigation; ordinary Preview mode keeps the app's own wheel behavior.
export function installCanvasNavigation(root){
  let held=false,restore=false,pointer=null,released=false;
  const button=name=>root.querySelector(`button[aria-label="${name}"]`);
  const editing=()=>!!button('Finish editing app');
  const canvas=()=>root.querySelector('[aria-label="Design canvas"]');
  const typing=target=>target?.closest?.('input,textarea,select,[contenteditable]:not([contenteditable="false"])');
  function start(){
    if(held||!editing())return;
    const pan=button('Pan');if(!pan)return;
    held=true;released=false;restore=pan.getAttribute('aria-pressed')!=='true';
    if(restore)pan.click();
  }
  function end(force=false){
    if(!held)return;
    if(pointer!==null&&!force){released=true;return;}
    held=false;pointer=null;released=false;
    if(restore)button('Select')?.click();restore=false;
  }
  const down=e=>{
    if(e.code!=='Space'||e.ctrlKey||e.metaKey||e.altKey||e.isComposing||typing(e.target)||!editing())return;
    e.preventDefault();e.stopPropagation();start();
  };
  const up=e=>{if(e.code==='Space'&&held){e.preventDefault();end();}};
  const press=e=>{if(held&&canvas()?.contains(e.target)&&e.button===0)pointer=e.pointerId;};
  const lift=e=>{if(pointer===e.pointerId){pointer=null;if(released)queueMicrotask(()=>end());}};
  const blur=()=>end(true);
  const message=e=>{
    const packet=e.data;if(packet?.kind!=='exact-design:canvas'||!editing())return;
    const frame=[...root.querySelectorAll('iframe')].find(frame=>frame.contentWindow===e.source);
    if(!frame)return;
    let url;try{url=new URL(frame.src);}catch{return;}
    if(url.origin!==e.origin||url.searchParams.get('__ed_events')!=='project-v2')return;
    if(packet.op==='tool'&&['Pan','Select'].includes(packet.tool)){end(true);button(packet.tool)?.click();return;}
    if(packet.op==='space'&&typeof packet.down==='boolean'){packet.down?start():end();return;}
    if(packet.op!=='wheel'||!['x','y','dx','dy','mode'].every(key=>Number.isFinite(packet[key])))return;
    const target=canvas();if(!target||!frame.clientWidth||!frame.clientHeight)return;
    const rect=frame.getBoundingClientRect(),factor=packet.mode===1?16:packet.mode===2?target.clientHeight:1;
    target.dispatchEvent(new WheelEvent('wheel',{bubbles:true,cancelable:true,clientX:rect.left+packet.x*rect.width/frame.clientWidth,clientY:rect.top+packet.y*rect.height/frame.clientHeight,deltaX:packet.dx*factor,deltaY:packet.dy*factor,ctrlKey:packet.ctrl===true,metaKey:packet.meta===true}));
  };
  root.addEventListener('keydown',down,true);root.addEventListener('pointerdown',press,true);
  window.addEventListener('keyup',up,true);window.addEventListener('pointerup',lift);window.addEventListener('pointercancel',lift);window.addEventListener('blur',blur);window.addEventListener('message',message);
  return ()=>{
    end(true);root.removeEventListener('keydown',down,true);root.removeEventListener('pointerdown',press,true);
    window.removeEventListener('keyup',up,true);window.removeEventListener('pointerup',lift);window.removeEventListener('pointercancel',lift);window.removeEventListener('blur',blur);window.removeEventListener('message',message);
  };
}
