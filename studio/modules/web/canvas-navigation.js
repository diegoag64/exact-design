// Return wheel deltas that reveal the box with the smallest camera move.
export function selectionPan(view,box){
  const gap=Math.min(32,view.width/4,view.height/4);
  const axis=(start,size,low,room)=>size>room?start-low:start<low?start-low:start+size>low+room?start+size-low-room:0;
  const x=axis(box.left,box.width,view.left+gap,view.width-gap*2),y=axis(box.top,box.height,view.top+gap,view.height-gap*2);
  // Transformed DOM rectangles round at subpixel boundaries. Do not nudge an
  // already revealed selection again because of that rounding.
  return {x:Math.abs(x)<0.5?0:x,y:Math.abs(y)<0.5?0:y};
}
// Iframe input cannot bubble to the editor. Canvas frames relay navigation
// independently of inspection; full-screen Preview keeps the app's own input.
export function installCanvasNavigation(root){
  let held=false,restore=false,pointer=null,released=false,middle=null;
  const button=name=>root.querySelector(`button[aria-label="${name}"]`);
  const editing=()=>root.dataset.canvasEditing==='true';
  const canvas=()=>root.querySelector('[aria-label="Design canvas"]');
  const available=()=>{
    const surface=canvas();
    return surface&&!surface.closest('[inert]')&&!root.querySelector('#closeLibrary,button[aria-label="Close preview"],button[aria-label="Close export"],[role="dialog"],:popover-open');
  };
  const typing=target=>target?.closest?.('input,textarea,select,[contenteditable]:not([contenteditable="false"])');
  function start(){
    if(held||!available())return;
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
    if(e.isComposing||typing(e.target)||!available())return;
    if(e.shiftKey&&!e.ctrlKey&&!e.metaKey&&!e.altKey&&['Digit1','Digit2'].includes(e.code)){
      e.preventDefault();e.stopPropagation();
      (e.code==='Digit1'?button('Fit all screens'):root.querySelector('#menu-fit-selection'))?.click();return;
    }
    if(e.code!=='Space'||e.ctrlKey||e.metaKey||e.altKey)return;
    e.preventDefault();e.stopPropagation();start();
  };
  const up=e=>{if(e.code==='Space'&&held){e.preventDefault();end();}};
  const wheel=(dx,dy,x,y)=>canvas()?.dispatchEvent(new WheelEvent('wheel',{bubbles:true,cancelable:true,clientX:x,clientY:y,deltaX:dx,deltaY:dy}));
  const press=e=>{
    if(e.button===1&&e.target.closest?.('#canvas-stage')&&!e.target.closest?.('button,input,select,textarea')){
      e.preventDefault();e.stopImmediatePropagation();
      middle={id:e.pointerId,x:e.clientX,y:e.clientY,target:e.target,cursor:e.target.style.cursor,priority:e.target.style.getPropertyPriority('cursor')};
      e.target.style.setProperty('cursor','grabbing','important');
      e.target.setPointerCapture?.(e.pointerId);return;
    }
    if(held&&canvas()?.contains(e.target)&&e.button===0)pointer=e.pointerId;
  };
  const move=e=>{
    if(middle?.id!==e.pointerId)return;
    e.preventDefault();e.stopImmediatePropagation();
    wheel(middle.x-e.clientX,middle.y-e.clientY,e.clientX,e.clientY);
    middle.x=e.clientX;middle.y=e.clientY;
  };
  const stopMiddle=()=>{
    if(middle){middle.target.style.setProperty('cursor',middle.cursor,middle.priority);if(middle.target.hasPointerCapture?.(middle.id))middle.target.releasePointerCapture(middle.id);middle=null;}
  };
  const lift=e=>{
    if(middle?.id===e.pointerId){e.preventDefault();stopMiddle();}
    if(pointer===e.pointerId){pointer=null;if(released)queueMicrotask(()=>end());}
  };
  const blur=()=>{stopMiddle();end(true);};
  const message=e=>{
    const packet=e.data;if(packet?.kind!=='exact-design:canvas')return;
    const frame=[...root.querySelectorAll('iframe')].find(frame=>frame.contentWindow===e.source);
    if(!frame?.closest('#canvas-stage'))return;
    let url;try{url=new URL(frame.src);}catch{return;}
    if(url.origin!==e.origin||url.searchParams.get('__ed_events')!=='project-v2'||url.searchParams.get('__ed_canvas')!=='1')return;
    // Releases must still clear a held tool if an overlay opened mid-gesture.
    if(packet.op==='space'&&packet.down===false){end();return;}
    if(!available())return;
    if(packet.op==='fit'&&typeof packet.selection==='boolean'){
      (packet.selection?root.querySelector('#menu-fit-selection'):button('Fit all screens'))?.click();return;
    }
    if(packet.op==='context'&&Number.isFinite(packet.x)&&Number.isFinite(packet.y)){
      if(!frame.clientWidth||!frame.clientHeight)return;
      const rect=frame.getBoundingClientRect();
      root.querySelector('#canvas-stage')?.dispatchEvent(new PointerEvent('contextmenu',{bubbles:true,cancelable:true,button:2,clientX:rect.left+packet.x*rect.width/frame.clientWidth,clientY:rect.top+packet.y*rect.height/frame.clientHeight}));return;
    }
    if(packet.op==='reveal'){
      if(!editing())return;
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
  window.addEventListener('keydown',down,true);root.addEventListener('pointerdown',press,true);
  window.addEventListener('pointermove',move,true);
  window.addEventListener('keyup',up,true);window.addEventListener('pointerup',lift);window.addEventListener('pointercancel',lift);window.addEventListener('blur',blur);window.addEventListener('message',message);
  return ()=>{
    blur();window.removeEventListener('keydown',down,true);root.removeEventListener('pointerdown',press,true);window.removeEventListener('pointermove',move,true);
    window.removeEventListener('keyup',up,true);window.removeEventListener('pointerup',lift);window.removeEventListener('pointercancel',lift);window.removeEventListener('blur',blur);window.removeEventListener('message',message);
  };
}
