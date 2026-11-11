// Install before Exact's own capture gate; a deferred module runs too late.
(()=>{
const inspecting=()=>document.getElementById('exact-inspect')||document.getElementById('exact-inspect-early');
// Navigation belongs to the surrounding canvas while the inspector is active.
const canvasInput=packet=>parent.postMessage({kind:'exact-design:canvas',...packet},'*');
addEventListener('wheel',e=>{
  if(!inspecting())return;
  e.preventDefault();e.stopImmediatePropagation();
  canvasInput({op:'wheel',x:e.clientX,y:e.clientY,dx:e.deltaX,dy:e.deltaY,mode:e.deltaMode,ctrl:e.ctrlKey,meta:e.metaKey});
},{capture:true,passive:false});
let canvasSpace=false;
addEventListener('keydown',e=>{
  if(e.ctrlKey||e.metaKey||e.altKey||e.isComposing||!inspecting()||e.target?.closest?.('input,textarea,select,[contenteditable]:not([contenteditable="false"])'))return;
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
