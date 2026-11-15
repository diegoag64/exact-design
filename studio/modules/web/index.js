// Browser-owned DOM work belongs in an Exact hatch, outside data sources.
// The data runtime survives changes to the visible canvas and Preview frames.
import {installCanvasNavigation} from './canvas-navigation.js';
import {installMenus} from './menus.js';
import {installTooltips} from './tooltips.js';
import {installNumberFields} from './number-fields.js';
import {installPlanRegions} from './plan-regions.js';
const hosts=new WeakMap();
const FRAME='#canvas-stage > [data-testid^="frame-"]',DETAIL='exact-design:preview-detail';
// Below this zoom a backdrop blur spans a few screen pixels, but the GPU still
// re-renders it each frame. The gap between the bounds stops flicker at the edge.
const LOW_DETAIL_BELOW=0.15,FULL_DETAIL_ABOVE=0.18;
// A chosen scheme pins the page the way Exact's own dev pin does: light-dark() colours follow
// the root's color-scheme, and the runtime reads systemScheme again on a resize.
export function pinScheme(doc,scheme){
  let style=doc.getElementById('ed-scheme-pin');
  const exact=doc.defaultView.exact??={},was=exact.systemScheme??null,next=scheme==='light'||scheme==='dark'?scheme:null;
  if(next){style??=doc.head.appendChild(Object.assign(doc.createElement('style'),{id:'ed-scheme-pin'}));style.textContent=`:root{color-scheme:${next}!important}`;}
  else style?.remove();
  if(was!==next){exact.systemScheme=next;doc.defaultView.dispatchEvent(new Event('resize'));}
}
class PreviewEngines {
  frames=new Map();
  constructor(root){
    this.root=root;// Regions install first: their Escape comes before the selection's.
    this.stopRegions=installPlanRegions(root);this.stopNavigation=installCanvasNavigation(root);this.stopMenus=installMenus(root);this.stopTooltips=installTooltips(root);this.stopNumberFields=installNumberFields(root);
    // Exact owns the transforms. This browser-only hint keeps each live preview
    // composited while its camera scale changes, without flattening the world.
    this.paintStyle=document.createElement('style');
    // The style lives in the document head, outside the Contract-managed tree.
    // Holding Shift over the canvas offers a region, so the pointer becomes a crosshair.
    this.paintStyle.textContent=`${FRAME}{will-change:translate,scale}[data-region-ready] #canvas-stage,[data-region-ready] #canvas-stage *{cursor:crosshair!important}`;
    document.head.append(this.paintStyle);
    this.observer=new MutationObserver(()=>this.update());
    this.observer.observe(root,{subtree:true,childList:true,attributes:true,attributeFilter:['src']});
    // Zoom is read from the frame scale Exact writes, and the effects and plan view settings
    // from the attributes Exact writes on this element, not kept as separate state.
    this.lowDetail=false;this.sent={low:false,still:false,plan:false,planBoxes:false,planText:false,zoom:1,scheme:''};
    this.zoom=new MutationObserver(()=>this.zoomChanged());
    this.zoom.observe(root,{subtree:true,attributes:true,attributeFilter:['style','data-preview-effects','data-plan-view','data-plan-boxes','data-plan-text','data-studio-theme','data-screen-theme']});

    this.loaded=e=>{if(e.target.matches?.(`${FRAME} iframe`))this.detail(e.target);};
    // Alt-hover distances: keys reach the studio, not the previews, while the studio has focus.
    // Option held for 0.1 steps in a field is not a measuring gesture; a release always clears.
    this.alt=e=>{if(e.type==='keydown'&&e.target?.closest?.('input,textarea,select'))return;if(e.type==='blur'?e.target===window:e.key==='Alt')for(const frame of this.root.querySelectorAll(`${FRAME} iframe`))frame.contentWindow?.postMessage({kind:'exact-design:alt',down:e.type==='keydown'},'*');};
    for(const type of ['keydown','keyup','blur'])addEventListener(type,this.alt,true);
    root.addEventListener('load',this.loaded,true);
    this.update();this.zoomChanged();
  }
  update(){
    if(typeof SharedWorker!=='function')return;
    const origins=new Set();
    for(const frame of this.root.querySelectorAll('iframe')){
      let url;try{url=new URL(frame.src);}catch{continue;}
      if(url.protocol==='http:'&&['127.0.0.1','localhost','[::1]'].includes(url.hostname)&&url.searchParams.get('__ed_events')==='project-v2')origins.add(url.origin);
    }
    for(const [origin,frame]of this.frames)if(!origins.has(origin)){frame.remove();this.frames.delete(origin);}
    for(const origin of origins)if(!this.frames.has(origin)){
      const frame=document.createElement('iframe');
      frame.hidden=true;frame.setAttribute('aria-hidden','true');frame.tabIndex=-1;
      frame.src=origin+'/__exact_design/engine';frame.title='Project data runtime';
      document.documentElement.append(frame);this.frames.set(origin,frame);
    }
  }
  zoomChanged(){
    const zoom=parseFloat(this.root.querySelector(FRAME)?.style.scale);
    if(Number.isFinite(zoom))this.lowDetail=this.lowDetail?zoom<FULL_DETAIL_ABOVE:zoom<LOW_DETAIL_BELOW;
    // Reduced effects drop blurs at every zoom and also hold animations still.
    const still=this.root.dataset.previewEffects==='reduced',low=still||this.lowDetail;
    // Plan view and regions keep their lines and labels at screen size, so previews also get the zoom.
    const plan=this.root.dataset.planView==='on',scale=Number.isFinite(zoom)&&zoom>0?zoom:this.sent.zoom;
    // The studio's own theme pins this page; the screens' theme is pinned inside each canvas preview.
    const studioTheme=this.root.dataset.studioTheme,pinned=studioTheme==='light'||studioTheme==='dark'?studioTheme:'';
    pinScheme(document,pinned);
    const screen=this.root.dataset.screenTheme,scheme=screen==='light'||screen==='dark'?screen:'';
    const next={low,still,plan,planBoxes:this.root.dataset.planBoxes==='on',planText:this.root.dataset.planText==='on',zoom:scale,scheme};
    if(Object.keys(next).every(key=>next[key]===this.sent[key]))return;
    this.sent=next;
    for(const frame of this.root.querySelectorAll(`${FRAME} iframe`))this.detail(frame);
  }
  detail(frame){frame.contentWindow?.postMessage({kind:DETAIL,...this.sent},'*');}
  close(){for(const type of ['keydown','keyup','blur'])removeEventListener(type,this.alt,true);this.stopNavigation();this.stopRegions();this.stopMenus();this.stopTooltips();this.stopNumberFields();this.observer.disconnect();this.zoom.disconnect();pinScheme(document,'');this.root.removeEventListener('load',this.loaded,true);this.paintStyle.remove();for(const frame of this.frames.values())frame.remove();this.frames.clear();}
}
export function element(context){
  if(context.hatch==='preview-engines'&&!hosts.has(context.element))hosts.set(context.element,new PreviewEngines(context.element));
}
export function elementEnded(context){hosts.get(context.element)?.close();hosts.delete(context.element);}
