// Install before Exact's own capture gate; a deferred module runs too late.
(()=>{
const inspecting=()=>document.getElementById('exact-inspect')||document.getElementById('exact-inspect-early');
// Navigation belongs to the surrounding canvas while the inspector is active.
const canvasInput=packet=>parent.postMessage({kind:'exact-design:canvas',...packet},'*');
addEventListener('contextmenu',e=>{
  if(!inspecting())return;
  e.preventDefault();e.stopImmediatePropagation();
  canvasInput({op:'context',x:e.clientX,y:e.clientY});
},true);
// Keep a middle drag captured in this frame, even when it crosses another
// viewport. Its deltas are relayed in screen pixels, like trackpad scrolling.
let middle=null;
addEventListener('pointerdown',e=>{
  if(e.button!==1||!inspecting())return;
  e.preventDefault();e.stopImmediatePropagation();
  middle={id:e.pointerId,x:e.screenX,y:e.screenY,target:e.target,cursor:e.target.style.cursor,priority:e.target.style.getPropertyPriority('cursor')};
  e.target.style.setProperty('cursor','grabbing','important');
  e.target.setPointerCapture?.(e.pointerId);
},true);
addEventListener('pointermove',e=>{
  if(middle?.id!==e.pointerId)return;
  e.preventDefault();e.stopImmediatePropagation();
  canvasInput({op:'wheel',x:e.clientX,y:e.clientY,dx:middle.x-e.screenX,dy:middle.y-e.screenY,mode:0,ctrl:false,meta:false});
  middle.x=e.screenX;middle.y=e.screenY;
},true);
function endMiddle(){
  if(!middle)return;
  middle.target.style.setProperty('cursor',middle.cursor,middle.priority);
  if(middle.target.hasPointerCapture?.(middle.id))middle.target.releasePointerCapture(middle.id);
  middle=null;
}
for(const type of ['pointerup','pointercancel'])addEventListener(type,e=>{
  if(middle?.id!==e.pointerId)return;
  e.preventDefault();e.stopImmediatePropagation();endMiddle();
},true);
addEventListener('blur',endMiddle,true);
addEventListener('wheel',e=>{
  if(!inspecting())return;
  e.preventDefault();e.stopImmediatePropagation();
  canvasInput({op:'wheel',x:e.clientX,y:e.clientY,dx:e.deltaX,dy:e.deltaY,mode:e.deltaMode,ctrl:e.ctrlKey,meta:e.metaKey});
},{capture:true,passive:false});
let canvasSpace=false;
addEventListener('keydown',e=>{
  if(e.ctrlKey||e.metaKey||e.altKey||e.isComposing||!inspecting()||e.target?.closest?.('input,textarea,select,[contenteditable]:not([contenteditable="false"])'))return;
  if(e.shiftKey&&['Digit1','Digit2'].includes(e.code)){
    e.preventDefault();e.stopImmediatePropagation();canvasInput({op:'fit',selection:e.code==='Digit2'});return;
  }
  if(e.code==='KeyH'||e.code==='KeyV'){
    e.preventDefault();e.stopImmediatePropagation();if(!e.repeat)canvasInput({op:'tool',tool:e.code==='KeyH'?'Pan':'Select'});return;
  }
  if(e.code!=='Space')return;
  e.preventDefault();e.stopImmediatePropagation();if(!e.repeat){canvasSpace=true;canvasInput({op:'space',down:true});}
},true);
// Exact's element gate expects a Node target. Window focus transitions are
// browser focus bookkeeping, not interactions with an app element.
for(const type of ['focus','blur'])addEventListener(type,e=>{
  if(type==='blur')canvasSpace=false;
  if(inspecting()&&e.target===window)e.stopImmediatePropagation();
},true);
addEventListener('keyup',e=>{
  if(e.code==='Space'&&canvasSpace){canvasSpace=false;e.preventDefault();e.stopImmediatePropagation();canvasInput({op:'space',down:false});}
},true);

})();
