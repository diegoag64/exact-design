// Install before Exact's own capture gate; a deferred module runs too late.
(()=>{
const inspecting=()=>document.getElementById('exact-inspect')||document.getElementById('exact-inspect-early');
// Canvas ownership is explicit and survives inspector shutdown/reloads.
// Full-screen Preview remains an ordinary interactive app.
const canvasMode=new URL(location.href).searchParams.get('__ed_canvas')==='1';
const canvasInput=packet=>parent.postMessage({kind:'exact-design:canvas',...packet},'*');
// Plan view and regions load on first use, so frames that never show them pay nothing.
// The latest preview detail (plan view and zoom) is replayed when the module arrives.
let plan=null,planLoad=null,lastDetail=null,regionDrag=null,swallowClick=false;
const planReady=()=>planLoad??=import('/__exact_design/plan-client.js').then(m=>{plan=m;if(lastDetail)m.detail(lastDetail);return m;});
const regionInput=(op,x,y)=>{void planReady().then(m=>m.region(op,x,y));};
const typingIn=target=>target?.closest?.('input,textarea,select,[contenteditable]:not([contenteditable="false"])');
addEventListener('contextmenu',e=>{
  if(!canvasMode)return;
  e.preventDefault();e.stopImmediatePropagation();
  canvasInput({op:'context',x:e.clientX,y:e.clientY});
},true);
// Keep a middle drag captured in this frame, even when it crosses another
// viewport. Its deltas are relayed in screen pixels, like trackpad scrolling.
let middle=null;
addEventListener('pointerdown',e=>{
  // While editing, this frame takes the pointer: Shift-drag draws a region, a press can hit its Copy button.
  if(canvasMode&&e.button===0&&e.shiftKey&&!e.altKey&&!e.ctrlKey&&!e.metaKey){
    e.preventDefault();e.stopImmediatePropagation();window.__exactDesignHover?.(null);
    regionDrag=e.pointerId;e.target.setPointerCapture?.(e.pointerId);regionInput('down',e.clientX,e.clientY);return;
  }
  if(canvasMode&&e.button===0&&plan?.hasRegion()&&plan.region('press',e.clientX,e.clientY)){e.preventDefault();e.stopImmediatePropagation();swallowClick=true;return;}
  if(e.button!==1||!canvasMode)return;
  e.preventDefault();e.stopImmediatePropagation();
  window.__exactDesignHover?.(null);
  middle={id:e.pointerId,x:e.screenX,y:e.screenY,target:e.target,cursor:e.target.style.cursor,priority:e.target.style.getPropertyPriority('cursor')};
  e.target.style.setProperty('cursor','grabbing','important');
  e.target.setPointerCapture?.(e.pointerId);
},true);
addEventListener('pointermove',e=>{
  if(regionDrag===e.pointerId){e.preventDefault();e.stopImmediatePropagation();regionInput('move',e.clientX,e.clientY);return;}
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
  if(regionDrag===e.pointerId){
    e.preventDefault();e.stopImmediatePropagation();regionDrag=null;swallowClick=true;
    if(e.target.hasPointerCapture?.(e.pointerId))e.target.releasePointerCapture(e.pointerId);
    regionInput('up',e.clientX,e.clientY);return;
  }
  if(middle?.id!==e.pointerId)return;
  e.preventDefault();e.stopImmediatePropagation();endMiddle();
},true);
addEventListener('blur',endMiddle,true);
// The click that ends a region drag or presses Copy is not the app's.
addEventListener('click',e=>{if(swallowClick){swallowClick=false;e.preventDefault();e.stopImmediatePropagation();}},true);
// The studio owns hover before Exact's local gate can retain a per-frame box.
addEventListener('pointermove',e=>{
  if(!canvasMode||!inspecting()||!window.__exactDesignHover)return;
  // Alt-hover distances read the same pointer before the studio takes it.
  e.stopImmediatePropagation();window.__exactDesignMeasure?.(e);window.__exactDesignHover(e);
},true);
addEventListener('pointerout',e=>{if(canvasMode&&!e.relatedTarget)window.__exactDesignHover?.(null);},true);
for(const type of ['pointercancel','blur','pagehide'])addEventListener(type,()=>{if(canvasMode)window.__exactDesignHover?.(null);},true);
addEventListener('pointerup',()=>{if(canvasMode)queueMicrotask(()=>window.__exactDesignClearNativeHover?.());},true);

// At small canvas zoom the studio asks for low detail: backdrop blurs are
// dropped, since the GPU re-renders each one on every frame for little effect.
// With reduced preview effects it also asks previews to hold still: CSS
// animations are removed, so elements show their resting style.
const detailStyles={
  low:'*,*::before,*::after{backdrop-filter:none!important;-webkit-backdrop-filter:none!important}',
  still:'*,*::before,*::after{animation:none!important}',
};
const detail={};
addEventListener('message',e=>{
  if(!canvasMode||e.source!==parent)return;
  // The studio relays regions for frames that do not take the pointer.
  if(e.data?.kind==='exact-design:region'&&typeof e.data.op==='string'){regionInput(e.data.op,e.data.x,e.data.y);return;}
  if(e.data?.kind!=='exact-design:preview-detail')return;
  lastDetail=e.data;if(e.data.plan===true||plan)void planReady().then(m=>m.detail(lastDetail));
  // The studio's Screens theme pins the app as Exact's dev pin does; "System" leaves it to the browser.
  const scheme=e.data.scheme==='light'||e.data.scheme==='dark'?e.data.scheme:null,exact=globalThis.exact??={};
  let pin=document.getElementById('ed-scheme-pin');
  if(scheme){if(!pin){pin=document.createElement('style');pin.id='ed-scheme-pin';(document.head??document.documentElement).append(pin);}pin.textContent=`:root{color-scheme:${scheme}!important}`;}
  else pin?.remove();
  if((exact.systemScheme??null)!==scheme){exact.systemScheme=scheme;dispatchEvent(new Event('resize'));}
  for(const [key,css]of Object.entries(detailStyles)){
    if(e.data[key]&&!detail[key]){detail[key]=document.createElement('style');detail[key].textContent=css;(document.head??document.documentElement).append(detail[key]);}
    else if(!e.data[key]&&detail[key]){detail[key].remove();detail[key]=null;}
  }
});

addEventListener('wheel',e=>{
  if(!canvasMode)return;
  window.__exactDesignHover?.(null);
  e.preventDefault();e.stopImmediatePropagation();
  canvasInput({op:'wheel',x:e.clientX,y:e.clientY,dx:e.deltaX,dy:e.deltaY,mode:e.deltaMode,ctrl:e.ctrlKey,meta:e.metaKey});
},{capture:true,passive:false});
addEventListener('keydown',e=>{
  // Option+A types å on a Mac, so the physical key is matched.
  if(canvasMode&&!e.isComposing&&!typingIn(e.target)){
    if(e.altKey&&!e.ctrlKey&&!e.metaKey&&!e.shiftKey&&e.code==='KeyA'){e.preventDefault();e.stopImmediatePropagation();if(!e.repeat)regionInput('all');return;}
    if(e.key==='Escape'&&plan?.hasRegion()){e.preventDefault();e.stopImmediatePropagation();plan.region('clear');return;}
    // Exact's inspector ends inspection on Escape. The studio clears the selection first instead.
    if(e.key==='Escape'&&!e.altKey&&!e.ctrlKey&&!e.metaKey&&!e.shiftKey&&inspecting()){e.preventDefault();e.stopImmediatePropagation();canvasInput({op:'escape'});return;}
    if(e.shiftKey&&!e.altKey&&!e.ctrlKey&&!e.metaKey&&e.code==='KeyP'){e.preventDefault();e.stopImmediatePropagation();if(!e.repeat)canvasInput({op:'plan'});return;}
    // Plan view's own options, only while the plan shows.
    if(lastDetail?.plan===true&&e.shiftKey&&!e.altKey&&!e.ctrlKey&&!e.metaKey&&['KeyB','KeyT'].includes(e.code)){e.preventDefault();e.stopImmediatePropagation();if(!e.repeat)canvasInput({op:e.code==='KeyB'?'plan-boxes':'plan-text'});return;}
  }
  if(e.ctrlKey||e.metaKey||e.altKey||e.isComposing||!canvasMode||typingIn(e.target))return;
  if(e.shiftKey&&['Digit1','Digit2'].includes(e.code)){
    e.preventDefault();e.stopImmediatePropagation();canvasInput({op:'fit',selection:e.code==='Digit2'});return;
  }
  if(e.code==='KeyH'||e.code==='KeyV'){
    e.preventDefault();e.stopImmediatePropagation();if(!e.repeat)canvasInput({op:'tool',tool:e.code==='KeyH'?'Pan':'Select'});return;
  }
  if(e.code!=='Space')return;
  window.__exactDesignHover?.(null);
  e.preventDefault();e.stopImmediatePropagation();if(!e.repeat)canvasInput({op:'space',down:true});
},true);
// Exact's element gate expects a Node target. Window focus transitions are
// browser focus bookkeeping, not interactions with an app element.
for(const type of ['focus','blur'])addEventListener(type,e=>{
  if(inspecting()&&e.target===window)e.stopImmediatePropagation();
},true);
addEventListener('keyup',e=>{
  if(e.code==='Space'&&canvasMode){e.preventDefault();e.stopImmediatePropagation();canvasInput({op:'space',down:false});}
},true);

})();
