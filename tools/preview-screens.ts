import {bridgeFor,type ElementBridge} from './element-bridge';
import {localPreview} from '../studio/project';
import {validSource} from '../studio/workspace';
export type PreviewRequest={id:string;url:string;width:number;height:number;auto:boolean};
export function previewPath(value:string){const u=new URL(value,'http://localhost');for(const key of [...u.searchParams.keys()])if(key.startsWith('__ed_')||key==='__exactDev')u.searchParams.delete(key);return u.pathname+u.search;}
/** A workspace subscribes before its frames load, independent of inspect mode. */
export function previewScreens(body:any,request:Request){
  if(!Array.isArray(body)||body.length>200)throw new Error('Invalid preview screens.');
  const bridges=new Set<ElementBridge>();
  const entries=body.map((v:PreviewRequest)=>{
    if(!v||typeof v.id!=='string'||v.id.length>100||!validSource(v.url)||![v.width,v.height].every(n=>Number.isFinite(n)&&n>=100&&n<=10000)||typeof v.auto!=='boolean')throw new Error('Invalid preview screen.');
    const bridge=localPreview(v.url)?bridgeFor(new URL(v.url).origin):null;
    if(bridge)bridges.add(bridge);
    return {v,bridge};
  });
  const snapshot=()=>({frames:entries.map(({v,bridge})=>{
    const frame=bridge?.frames.get(v.id),src=new URL(v.url||'about:blank');
    if(bridge){src.host=new URL(bridge.origin).host;src.searchParams.set('__ed_frame',v.id);src.searchParams.set('__ed_events','project-v2');src.searchParams.set('__ed_height',String(v.height));src.searchParams.set('__ed_full',v.auto?'1':'0');}
    const measured=frame&&frame.contentHeight!==undefined&&frame.width===v.width&&frame.viewportHeight===v.height&&frame.fullHeight===v.auto&&previewPath(frame.url??'')===previewPath(v.url);
    return {id:v.id,source:v.url,previewSource:v.url?src.href:'',width:v.width,viewportHeight:v.height,auto:v.auto,height:measured&&v.auto?frame.contentHeight!:v.height,ready:!bridge||!!measured};
  })});
  let controller:ReadableStreamDefaultController<Uint8Array>,timer:ReturnType<typeof setInterval>,last='';
  const publish=()=>{const text=JSON.stringify(snapshot());if(text===last)return;last=text;try{controller.enqueue(new TextEncoder().encode(`data: ${text}\n\n`));}catch{close();}};
  const receive=(_frame:any,packet:any)=>{if(packet.kind==='size'||packet.kind==='ready')publish();};
  const close=()=>{clearInterval(timer);for(const bridge of bridges)bridge.feedback.delete(receive);request.signal.removeEventListener('abort',close);try{controller.close();}catch{}};
  const stream=new ReadableStream<Uint8Array>({start:c=>{
    controller=c;for(const bridge of bridges)bridge.feedback.add(receive);publish();
    timer=setInterval(()=>{try{controller.enqueue(new TextEncoder().encode(': keepalive\n\n'));}catch{close();}},15000);timer.unref();
    request.signal.addEventListener('abort',close,{once:true});
  },cancel:close});
  return new Response(stream,{headers:{'content-type':'text/event-stream','cache-control':'no-store'}});
}
