type EngineFrame={hidden:boolean;tabIndex:number;src:string;title:string;setAttribute(name:string,value:string):void;remove():void};
type BrowserDocument={createElement(tag:'iframe'):EngineFrame;documentElement:{append(frame:EngineFrame):void}};
/** Keep the source runtime independent of visible frames and their routes. */
export class PreviewEngines {
  private frames=new Map<string,EngineFrame>();
  update(origins:string[]){
    const document=(globalThis as unknown as {document?:BrowserDocument}).document;
    if(!document||typeof (globalThis as unknown as {SharedWorker?:unknown}).SharedWorker!=='function')return;
    const live=new Set(origins);
    for(const [origin,frame]of this.frames)if(!live.has(origin)){frame.remove();this.frames.delete(origin);}
    for(const origin of live)if(!this.frames.has(origin)){
      const frame=document.createElement('iframe');
      frame.hidden=true;frame.setAttribute('aria-hidden','true');frame.tabIndex=-1;
      frame.src=origin+'/__exact_design/engine';frame.title='Project data runtime';
      document.documentElement.append(frame);this.frames.set(origin,frame);
    }
  }
}
