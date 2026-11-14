// Regions measure everything inside a rectangle dragged with Shift. The preview owns the
// region and draws it; this module relays input for frames that do not take the pointer
// (outside app editing), Alt+A and Escape while the studio has focus, and Copy clicks.
import {canvasAvailable,canvasFrame} from './canvas-navigation.js';
const FRAMES='#canvas-stage > [data-testid^="frame-"] iframe';

export function installPlanRegions(root){
  const states=new Map(); // iframe → {region, copy, text}, as each preview reports it
  const prune=()=>{for(const f of states.keys())if(!f.isConnected)states.delete(f);};
  let drag=null,pointer=null,lastFrame=null;
  const frames=()=>[...root.querySelectorAll(FRAMES)];
  const local=(frame,x,y)=>{
    const r=frame.getBoundingClientRect();if(!frame.clientWidth||!frame.clientHeight)return null;
    return {x:(x-r.left)*frame.clientWidth/r.width,y:(y-r.top)*frame.clientHeight/r.height,inside:x>=r.left&&x<=r.right&&y>=r.top&&y<=r.bottom};
  };
  // Later frames paint above earlier ones.
  const frameAt=(x,y)=>frames().reverse().find(f=>local(f,x,y)?.inside)??null;
  const send=(frame,op,at)=>frame?.contentWindow?.postMessage({kind:'exact-design:region',op,...(at?{x:at.x,y:at.y}:{})},'*');
  const hand=()=>root.querySelector('button[aria-label="Pan"]')?.getAttribute('aria-pressed')==='true';
  const typing=target=>target?.closest?.('input,textarea,select,[contenteditable]:not([contenteditable="false"])');
  const within=(b,p)=>!!b&&!!p&&p.x>=b.x&&p.y>=b.y&&p.x<=b.x+b.width&&p.y<=b.y+b.height;
  const crosshair=on=>{if(on)root.dataset.regionReady='';else delete root.dataset.regionReady;};
  function copy(frame,state){
    // The press is the studio's, so the studio writes the clipboard.
    navigator.clipboard?.writeText(state.text).then(()=>send(frame,'copied'),()=>{});
  }
  // Plan view's options live in its toolbar menu; a shortcut presses the same row, so the Contract keeps the state.
  const option=op=>{if(canvasAvailable(root))root.querySelector(`[data-testid="${op}"]`)?.click();};
  // Window capture runs before Exact's own handlers, so a region never also starts a frame drag.
  const press=e=>{
    prune();
    if(e.button!==0||!root.contains(e.target)||!e.target.closest?.('#canvas-stage')||e.target.closest?.('button,input,select,textarea,[role="menu"],[role="menuitem"]'))return;
    const frame=frameAt(e.clientX,e.clientY);if(frame)lastFrame=frame;
    if(e.shiftKey&&!e.altKey&&!e.ctrlKey&&!e.metaKey&&!hand()&&canvasAvailable(root)&&frame){
      const at=local(frame,e.clientX,e.clientY);
      e.preventDefault();e.stopImmediatePropagation();
      drag={id:e.pointerId,frame,target:e.target};e.target.setPointerCapture?.(e.pointerId);
      for(const [other,state]of states)if(other!==frame&&state.region)send(other,'clear');
      send(frame,'down',at);return;
    }
    // A plain press copies on Copy, and anywhere outside a region clears it.
    for(const [f,state]of states){
      if(!state.region)continue;
      const at=f===frame?local(f,e.clientX,e.clientY):null;
      if(within(state.copy,at)){e.preventDefault();e.stopImmediatePropagation();copy(f,state);return;}
      if(!within(state.region,at))send(f,'clear');
    }
  };
  const move=e=>{
    pointer={x:e.clientX,y:e.clientY};
    if(drag?.id!==e.pointerId)return;
    e.preventDefault();e.stopImmediatePropagation();
    send(drag.frame,'move',local(drag.frame,e.clientX,e.clientY));
  };
  const lift=e=>{
    if(drag?.id!==e.pointerId)return;
    e.preventDefault();e.stopImmediatePropagation();
    if(drag.target.hasPointerCapture?.(e.pointerId))drag.target.releasePointerCapture(e.pointerId);
    send(drag.frame,'up',local(drag.frame,e.clientX,e.clientY));drag=null;
  };
  // Alt+A measures the frame under the pointer, else the one being edited, else the last one used.
  const editingFrame=()=>frames().find(f=>f.closest('[data-testid^="frame-"]')?.style.pointerEvents==='auto')??null;
  const key=e=>{
    prune();
    if(e.key==='Shift')crosshair(e.type==='keydown'&&!hand()&&canvasAvailable(root));
    if(e.type!=='keydown'||e.isComposing||typing(e.target)||!canvasAvailable(root))return;
    if(e.shiftKey&&!e.altKey&&!e.ctrlKey&&!e.metaKey&&['KeyB','KeyT'].includes(e.code)&&root.dataset.planView==='on'){
      e.preventDefault();e.stopPropagation();if(!e.repeat)option(e.code==='KeyB'?'plan-boxes':'plan-text');
      return;
    }
    if(e.altKey&&!e.ctrlKey&&!e.metaKey&&!e.shiftKey&&e.code==='KeyA'){
      const frame=(pointer&&frameAt(pointer.x,pointer.y))||editingFrame()||lastFrame;
      if(!frame)return;
      e.preventDefault();e.stopPropagation();if(!e.repeat){lastFrame=frame;send(frame,'all');}
      return;
    }
    if(e.key==='Escape'&&[...states.values()].some(s=>s.region)){
      e.preventDefault();e.stopImmediatePropagation();
      for(const [frame,state]of states)if(state.region)send(frame,'clear');
    }
  };
  const blur=()=>crosshair(false);
  const message=e=>{
    const packet=e.data;if(packet?.kind!=='exact-design:canvas'||!['region','copy','plan','plan-boxes','plan-text'].includes(packet.op))return;
    const frame=canvasFrame(root,e);if(!frame)return;
    if(packet.op==='plan'){if(canvasAvailable(root))root.querySelector('[data-testid="toggle-plan"]')?.click();return;}
    if(packet.op==='plan-boxes'||packet.op==='plan-text'){option(packet.op);return;}
    if(packet.op==='copy'&&typeof packet.text==='string'){navigator.clipboard?.writeText(packet.text).then(()=>send(frame,'copied'),()=>{});return;}
    const box=b=>b&&['x','y','width','height'].every(k=>Number.isFinite(b[k]))?b:null;
    states.set(frame,{region:box(packet.region),copy:box(packet.copy),text:typeof packet.text==='string'?packet.text.slice(0,20000):''});
    if(packet.region)lastFrame=frame;
    prune();
  };
  window.addEventListener('pointerdown',press,true);
  window.addEventListener('pointermove',move,true);window.addEventListener('pointerup',lift,true);window.addEventListener('pointercancel',lift,true);
  window.addEventListener('keydown',key,true);window.addEventListener('keyup',key,true);window.addEventListener('blur',blur);window.addEventListener('message',message);
  return ()=>{
    crosshair(false);window.removeEventListener('pointerdown',press,true);
    window.removeEventListener('pointermove',move,true);window.removeEventListener('pointerup',lift,true);window.removeEventListener('pointercancel',lift,true);
    window.removeEventListener('keydown',key,true);window.removeEventListener('keyup',key,true);window.removeEventListener('blur',blur);window.removeEventListener('message',message);
  };
}
