import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {decodeSpacing} from '../studio/spacing';
export type ElementNode={id:string;identity:string;path:string;parent:string;depth:number;label:string;kind?:string;tag:string;site:number;instance:unknown[]};
export type ElementFrame={frame:string;page?:string;build:string;plan:string;inspecting:boolean;nodes:ElementNode[];seen:number;contentHeight?:number;viewportHeight?:number;fullHeight?:boolean;width?:number;url?:string};
const script=readFileSync(new URL('./element-bridge-client.js',import.meta.url),'utf8');
const bridges=new Map<string,ElementBridge>();
export function stopElementBridges(){for(const bridge of bridges.values())bridge.server.stop(true);bridges.clear();}
export function bridgeFor(origin:string){let bridge=bridges.get(origin);if(!bridge){const port=20000+parseInt(createHash('sha256').update(origin).digest('hex').slice(0,6),16)%30000;bridge=new ElementBridge(origin,port);bridges.set(origin,bridge);}return bridge;}
export class ElementBridge {
  frames=new Map<string,ElementFrame>();seq=0;
  commands=new Map<string,({seq:number;op:string;id:string;plan:string}&Record<string,any>)[]>();
  listeners=new Map<string,Set<ReadableStreamDefaultController<Uint8Array>>>();
  feedback=new Set<(frame:ElementFrame,packet:any)=>void>();
  server:ReturnType<typeof Bun.serve>;
  constructor(readonly target:string,port=0){
    this.server=Bun.serve({hostname:'127.0.0.1',port,maxRequestBodySize:512*1024,idleTimeout:255,fetch:req=>this.handle(req)});
  }
  get origin(){return this.server.url.origin;}
  select(frame:string,id:string){
    this.send(frame,'select',id);
  }
  hover(frame:string,id:string){this.send(frame,'hover',id);}
  measure(frame:string,id:string){
    const previous=this.commands.get(frame)?.find(c=>c.op==='measure');
    if(previous?.id===id&&previous.plan===this.frames.get(frame)?.plan)return;
    this.send(frame,'measure',id);
  }
  preview(patches:unknown[],revision:number){
    const text=JSON.stringify(patches);
    for(const frame of this.frames.keys()){
      const previous=this.commands.get(frame)?.find(c=>c.op==='draft');
      if(previous?.draftRevision===revision&&previous.page===this.frames.get(frame)?.page&&previous.plan===this.frames.get(frame)?.plan&&JSON.stringify(previous.patches)===text)continue;
      this.send(frame,'draft','',{patches,draftRevision:revision,page:this.frames.get(frame)?.page});
    }
  }
  send(frame:string,op:string,id:string,extra:Record<string,unknown>={}){
    const command={seq:++this.seq,op,id,plan:this.frames.get(frame)?.plan??'',...extra};
    // Keep the latest selection and hover independently for reconnects and polling.
    this.commands.set(frame,[...(this.commands.get(frame)??[]).filter(c=>c.op!==op),command]);
    for(const listener of this.listeners.get(frame)??[])try{listener.enqueue(this.event(command));}catch{this.listeners.get(frame)?.delete(listener);}
  }
  event(command:{seq:number}){return new TextEncoder().encode(`id: ${command.seq}\ndata: ${JSON.stringify(command)}\n\n`);}
  subscribe(req:Request,url:URL){
    const frame=url.searchParams.get('frame')??'';
    if(!frame||frame.length>100)return new Response(null,{status:400});
    if((!this.listeners.has(frame)&&this.listeners.size>=200)||(this.listeners.get(frame)?.size??0)>=4)return new Response(null,{status:429});
    const listeners=this.listeners.get(frame)??new Set<ReadableStreamDefaultController<Uint8Array>>();this.listeners.set(frame,listeners);
    const after=Number(req.headers.get('last-event-id')??url.searchParams.get('after')??0)||0;
    let controller:ReadableStreamDefaultController<Uint8Array>,timer:ReturnType<typeof setInterval>|undefined;
    const close=()=>{if(timer)clearInterval(timer);listeners.delete(controller);if(!listeners.size)this.listeners.delete(frame);req.signal.removeEventListener('abort',close);try{controller.close();}catch{}};
    const stream=new ReadableStream<Uint8Array>({start:c=>{
      controller=c;listeners.add(c);c.enqueue(new TextEncoder().encode(': connected\n\n'));
      for(const command of this.commands.get(frame)??[])if(command.seq>after)c.enqueue(this.event(command));
      timer=setInterval(()=>{try{c.enqueue(new TextEncoder().encode(': keepalive\n\n'));}catch{close();}},15000);timer.unref();
      req.signal.addEventListener('abort',close,{once:true});
    },cancel:close});
    return new Response(stream,{headers:{'content-type':'text/event-stream','cache-control':'no-store','x-accel-buffering':'no'}});
  }
  size(frame:ElementFrame,packet:any){
    if(!Number.isInteger(packet.height)||packet.height<100||packet.height>50000||!Number.isInteger(packet.width)||packet.width<100||packet.width>10000||!Number.isInteger(packet.viewportHeight)||packet.viewportHeight<100||packet.viewportHeight>10000||typeof packet.fullHeight!=='boolean'||typeof packet.url!=='string'||packet.url.length>4096)return false;
    const changed=frame.contentHeight!==packet.height||frame.width!==packet.width||frame.viewportHeight!==packet.viewportHeight||frame.fullHeight!==packet.fullHeight||frame.url!==packet.url;
    Object.assign(frame,{contentHeight:packet.height,width:packet.width,viewportHeight:packet.viewportHeight,fullHeight:packet.fullHeight,url:packet.url});
    if(changed)for(const listener of this.feedback)listener(frame,{kind:'size'});
    return true;
  }
  async handle(req:Request):Promise<Response>{
    const url=new URL(req.url),origin=req.headers.get('origin');
    if(url.origin!==this.origin || (origin && origin!==this.origin))return new Response('Forbidden',{status:403});
    if(url.pathname==='/__exact_design/events'&&req.method==='GET')return this.subscribe(req,url);
    if(url.pathname==='/__exact_design/client.js')return new Response(script,{headers:{'content-type':'text/javascript','cache-control':'no-store'}});
    for(const name of ['spacing-client.js','spacing-geometry.js','design-preview-client.js','full-page-client.js'])if(url.pathname==='/__exact_design/'+name)return new Response(readFileSync(new URL('./'+name,import.meta.url),'utf8'),{headers:{'content-type':'text/javascript','cache-control':'no-store'}});
    if(url.pathname==='/__exact_design/feedback'&&req.method==='POST'){
      const packet=await req.json(),frame=this.frames.get(packet.frame);
      if(!frame||packet.page!==frame.page||packet.plan!==frame.plan)return new Response(null,{status:409});
      if(packet.kind==='pick'){
        if(typeof packet.id!=='string'||!frame.inspecting||!frame.nodes.some(n=>n.id===packet.id))return new Response(null,{status:400});
      }else if(packet.kind==='spacing'){
        const measured=decodeSpacing(frame.frame,JSON.stringify({...packet,kind:'exact-design:spacing'}));
        if(measured.id!==packet.id)return new Response(null,{status:400});
        packet.boxes=measured.boxes;
      }else if(packet.kind==='size'){
        if(!this.size(frame,packet))return new Response(null,{status:400});
      }else if(packet.kind==='draft-status'){
        if(!Number.isSafeInteger(packet.revision)||typeof packet.error!=='string'||packet.error.length>300)return new Response(null,{status:400});
      }else return new Response(null,{status:400});
      for(const listener of this.feedback)listener(frame,packet);
      return Response.json({ok:true});
    }
    if(url.pathname==='/__exact_design/tree' && req.method==='POST'){
      const body=await req.json();
      if(typeof body.frame!=='string'||body.frame.length>100||typeof body.build!=='string'||body.build.length>200||typeof body.plan!=='string'||body.plan.length>100||!Array.isArray(body.nodes)||body.nodes.length>600)return new Response(null,{status:400});
      for(const [key,frame]of this.frames)if(Date.now()-frame.seen>30000)this.frames.delete(key);
      if(!this.frames.has(body.frame)&&this.frames.size>=200)return new Response(null,{status:429});
      const nodes=body.nodes.filter((n:any)=>n&&typeof n.id==='string'&&n.id.length<2048&&typeof n.identity==='string'&&n.identity.length<2048&&typeof n.path==='string'&&n.path.length<4096&&typeof n.parent==='string'&&n.parent.length<2048&&typeof n.label==='string'&&n.label.length<=120&&typeof n.tag==='string'&&n.tag.length<40&&Number.isSafeInteger(n.depth)&&n.depth>=0&&n.depth<1000&&Number.isSafeInteger(n.site)&&Array.isArray(n.instance));
      const previous=this.frames.get(body.frame);
      const frame={...(previous?.page===body.page?{contentHeight:previous?.contentHeight,viewportHeight:previous?.viewportHeight,fullHeight:previous?.fullHeight,width:previous?.width,url:previous?.url}:{}),frame:body.frame,page:typeof body.page==='string'&&body.page.length<=100?body.page:'',build:body.build,plan:body.plan,inspecting:body.inspecting===true,nodes,seen:Date.now()};
      this.frames.set(body.frame,frame);
      this.size(frame,{...body,height:body.contentHeight});
      if(previous?.page!==frame.page||previous?.plan!==frame.plan||previous?.inspecting!==frame.inspecting)for(const listener of this.feedback)listener(frame,{kind:'ready'});
      return Response.json({commands:(this.commands.get(body.frame)||[]).filter(c=>c.seq>Number(body.after))});
    }
    if(url.pathname.startsWith('/__exact_design/')||url.pathname.startsWith('/__tamber'))return new Response(null,{status:404});
    const target=new URL(url.pathname+url.search,this.target);for(const key of [...target.searchParams.keys()])if(key.startsWith('__ed_'))target.searchParams.delete(key);
    if(target.origin!==this.target)return new Response(null,{status:400});
    const headers=new Headers(req.headers);for(const name of ['host','origin','referer','connection','accept-encoding'])headers.delete(name);
    if(origin)headers.set('origin',this.target);
    try{
      const response=await fetch(target,{method:req.method,headers,body:['GET','HEAD'].includes(req.method)?undefined:req.body,redirect:'manual',signal:req.signal});
      const out=new Headers(response.headers);for(const name of ['content-length','content-encoding','transfer-encoding','connection'])out.delete(name);
      const redirect=out.get('location');if(redirect?.startsWith(this.target))out.set('location',this.origin+redirect.slice(this.target.length));
      if(response.headers.get('content-type')?.includes('text/html') && req.method!=='HEAD'){
        let html=await response.text();
        // Observe only the public build ID in Exact's registration. The captured
        // fetch otherwise receives exactly the original request and arguments.
        const inject=`<script>{const original=window.fetch.bind(window);window.fetch=function(input,init){if(input==='/__dev/report'&&typeof init?.body==='string'){try{const report=JSON.parse(init.body);if(report.kind==='register'&&typeof report.id==='string')window.__exactDesignBuild=report.id;}catch{}}return original(input,init);};let press;addEventListener('pointerdown',e=>{press={x:e.clientX,y:e.clientY,id:e.pointerId};},true);addEventListener('pointerup',e=>{if(press?.id===e.pointerId&&Math.hypot(e.clientX-press.x,e.clientY-press.y)<=10)window.__exactDesignPick?.(e.clientX,e.clientY);press=null;},true);addEventListener('pointercancel',()=>{press=null;},true);}</script><script type="module" src="/__exact_design/client.js"></script>`;
        html=/<head[^>]*>/i.test(html)?html.replace(/<head[^>]*>/i,head=>head+inject):inject+html;
        return new Response(html,{status:response.status,headers:out});
      }
      return new Response(response.body,{status:response.status,headers:out});
    }catch{return new Response('The app dev server is unavailable.',{status:502});}
  }
}
