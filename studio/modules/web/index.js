// Browser-owned DOM work belongs in an Exact hatch, outside data sources.
// The data runtime survives changes to the visible canvas and Preview frames.
import {installCanvasNavigation} from './canvas-navigation.js';
import {installMenus} from './menus.js';
const hosts=new WeakMap();
const FRAME='#canvas-stage > [data-testid^="frame-"]',DETAIL='exact-design:preview-detail';
// Below this zoom a backdrop blur spans a few screen pixels, but the GPU still
// re-renders it each frame. The gap between the bounds stops flicker at the edge.
const LOW_DETAIL_BELOW=0.15,FULL_DETAIL_ABOVE=0.18;
class PreviewEngines {
  frames=new Map();
  constructor(root){
    this.root=root;this.stopNavigation=installCanvasNavigation(root);this.stopMenus=installMenus(root);
    // Exact owns the transforms. This browser-only hint keeps each live preview
    // composited while its camera scale changes, without flattening the world.
    this.paintStyle=document.createElement('style');
    // The style lives in the document head, outside the Contract-managed tree.
    this.paintStyle.textContent=`${FRAME}{will-change:translate,scale}`;
    document.head.append(this.paintStyle);
    this.observer=new MutationObserver(()=>this.update());
    this.observer.observe(root,{subtree:true,childList:true,attributes:true,attributeFilter:['src']});
    // Zoom is read from the frame scale Exact writes, and the effects setting from
    // the attribute Exact writes on this element, not kept as separate state.
    this.lowDetail=false;this.sent={low:false,still:false};
    this.zoom=new MutationObserver(()=>this.zoomChanged());
    this.zoom.observe(root,{subtree:true,attributes:true,attributeFilter:['style','data-preview-effects']});
    this.loaded=e=>{if(e.target.matches?.(`${FRAME} iframe`))this.detail(e.target);};
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
    if(low===this.sent.low&&still===this.sent.still)return;
    this.sent={low,still};
    for(const frame of this.root.querySelectorAll(`${FRAME} iframe`))this.detail(frame);
  }
  detail(frame){frame.contentWindow?.postMessage({kind:DETAIL,...this.sent},'*');}
  close(){this.stopNavigation();this.stopMenus();this.observer.disconnect();this.zoom.disconnect();this.root.removeEventListener('load',this.loaded,true);this.paintStyle.remove();for(const frame of this.frames.values())frame.remove();this.frames.clear();}
}
export function element(context){
  if(context.hatch==='preview-engines'&&!hosts.has(context.element))hosts.set(context.element,new PreviewEngines(context.element));
}
export function elementEnded(context){hosts.get(context.element)?.close();hosts.delete(context.element);}
