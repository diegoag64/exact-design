// Return wheel deltas that reveal the box with the smallest camera move.
export function selectionPan(view,box){
  const gap=Math.min(32,view.width/4,view.height/4);
  const axis=(start,size,low,room)=>size>room?start-low:start<low?start-low:start+size>low+room?start+size-low-room:0;
  const x=axis(box.left,box.width,view.left+gap,view.width-gap*2),y=axis(box.top,box.height,view.top+gap,view.height-gap*2);
  // Transformed DOM rectangles round at subpixel boundaries. Do not nudge an
  // already revealed selection again because of that rounding.
  return {x:Math.abs(x)<0.5?0:x,y:Math.abs(y)<0.5?0:y};
}
// Iframe input cannot bubble to the editor. Only inspected preview frames may
// relay navigation; ordinary Preview mode keeps the app's own wheel behavior.
export function installCanvasNavigation(root){
  let held=false,restore=false,pointer=null,released=false;
  const button=name=>root.querySelector(`button[aria-label="${name}"]`);
  const editing=()=>root.dataset.canvasEditing==='true';
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
    if(packet.op==='reveal'){
      if(!['x','y','width','height'].every(key=>Number.isFinite(packet[key]))||packet.width<=0||packet.height<=0)return;
      const target=canvas();if(!target||!frame.clientWidth||!frame.clientHeight)return;
      const rect=frame.getBoundingClientRect(),sx=rect.width/frame.clientWidth,sy=rect.height/frame.clientHeight;
      const view=target.getBoundingClientRect(),pan=selectionPan(view,{left:rect.left+packet.x*sx,top:rect.top+packet.y*sy,width:packet.width*sx,height:packet.height*sy});
      if(pan.x||pan.y)target.dispatchEvent(new WheelEvent('wheel',{bubbles:true,cancelable:true,clientX:view.left+view.width/2,clientY:view.top+view.height/2,deltaX:pan.x,deltaY:pan.y}));
      return;
    }
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
