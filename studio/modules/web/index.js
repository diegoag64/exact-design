// Browser-owned DOM work belongs in an Exact hatch, outside data sources.
// The data runtime survives changes to the visible canvas and Preview frames.
import {installCanvasNavigation} from './canvas-navigation.js';
import {installMenus} from './menus.js';
const hosts=new WeakMap();
class PreviewEngines {
  frames=new Map();
  constructor(root){
    this.root=root;this.stopNavigation=installCanvasNavigation(root);this.stopMenus=installMenus(root);
    this.observer=new MutationObserver(()=>this.update());
    this.observer.observe(root,{subtree:true,childList:true,attributes:true,attributeFilter:['src']});
    this.update();
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
  close(){this.stopNavigation();this.stopMenus();this.observer.disconnect();for(const frame of this.frames.values())frame.remove();this.frames.clear();}
}
export function element(context){
  if(context.hatch==='preview-engines'&&!hosts.has(context.element))hosts.set(context.element,new PreviewEngines(context.element));
}
export function elementEnded(context){hosts.get(context.element)?.close();hosts.delete(context.element);}
