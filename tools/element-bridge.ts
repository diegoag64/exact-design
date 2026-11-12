import {scopePreviewIdentity} from './preview-identity';
import {eventMessages} from './event-stream';
import {sharedRuntime} from './shared-runtime';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {decodeSpacing} from '../studio/spacing';
export type ElementNode={id:string;identity:string;path:string;parent:string;depth:number;label:string;kind?:string;tag:string;site:number;instance:unknown[]};
export type ElementFrame={frame:string;page?:string;build:string;plan:string;inspecting:boolean;nodes:ElementNode[];seen:number;contentHeight?:number;viewportHeight?:number;fullHeight?:boolean;width?:number;url?:string;routeUrl?:string};
const script=readFileSync(new URL('./element-bridge-client.js',import.meta.url),'utf8');
const bridges=new Map<string,ElementBridge>();
export function stopElementBridges(){for(const bridge of bridges.values())bridge.server.stop(true);bridges.clear();}
export function bridgeFor(origin:string){let bridge=bridges.get(origin);if(!bridge){const port=20000+parseInt(createHash('sha256').update(origin).digest('hex').slice(0,6),16)%30000;bridge=new ElementBridge(origin,port);bridges.set(origin,bridge);}return bridge;}
export class ElementBridge {
  frames=new Map<string,ElementFrame>();seq=0;
  private hoverTime=0;
  private activeHover:{owner:string;frame:string;page?:string;plan:string;route:string;site:number;instance:string}|null=null;
  connections=new Set<unknown>();
  commands=new Map<string,({seq:number;op:string;id:string;plan:string}&Record<string,any>)[]>();
  listeners=new Map<string,Set<ReadableStreamDefaultController<Uint8Array>>>();
  feedback=new Set<(frame:ElementFrame,packet:any)=>void>();
  server:ReturnType<typeof Bun.serve>;
  constructor(readonly target:string,port=0){
    this.server=Bun.serve({hostname:'127.0.0.1',port,maxRequestBodySize:16*1024*1024,idleTimeout:255,
      fetch:(req,server)=>{
        const url=new URL(req.url);
        if(url.pathname==='/__exact_design/live'){
          if(url.origin!==this.origin||req.headers.get('origin')!==this.origin)return new Response('Forbidden',{status:403});
          return server.upgrade(req,{data:{streams:new Map<string,AbortController>()}})?undefined:new Response(null,{status:400});
        }
        return this.handle(req);
      },
      websocket:{maxPayloadLength:4096,open:ws=>{this.connections.add(ws);},message:(ws,raw)=>{void this.live(ws,raw);},close:ws=>{this.connections.delete(ws);for(const abort of ws.data.streams.values())abort.abort();ws.data.streams.clear();}},
    });
  }
  async live(ws:any,raw:any){
    let packet;try{packet=JSON.parse(String(raw));}catch{return;}
    if(typeof packet.id!=='string'||packet.id.length>64)return;
    const streams:Map<string,AbortController>=ws.data.streams;
    streams.get(packet.id)?.abort();streams.delete(packet.id);
    if(packet.op==='close')return;
    if(packet.op!=='open'||streams.size>=800||typeof packet.path!=='string'||packet.path.length>2048)return;
    let url;try{url=new URL(packet.path,this.origin);}catch{return;}
    if(url.origin!==this.origin||!['/__dev/events','/__dev/page','/__exact_design/events'].includes(url.pathname))return;
    const abort=new AbortController();streams.set(packet.id,abort);
    const send=(data:any)=>{if(!abort.signal.aborted)ws.send(JSON.stringify({id:packet.id,...data}));};
    try{
      const headers=new Headers({accept:'text/event-stream',origin:this.target});
      if(typeof packet.lastEventId==='string'&&packet.lastEventId.length<1024)headers.set('last-event-id',packet.lastEventId);
      const response=url.pathname==='/__exact_design/events'?this.subscribe(new Request(url,{headers,signal:abort.signal}),url):await fetch(new URL(url.pathname+url.search,this.target),{headers,signal:abort.signal,redirect:'error'});
      if(!response.ok||!response.headers.get('content-type')?.includes('text/event-stream')||!response.body)throw new Error('Preview events are unavailable.');
      send({kind:'open'});
      for await(const event of eventMessages(response.body))send({kind:'event',...event});
      send({kind:'error'});
    }catch{send({kind:'error'});}
    finally{abort.abort();if(streams.get(packet.id)===abort)streams.delete(packet.id);}
  }
  get origin(){return this.server.url.origin;}
  select(frame:string,id:string){
    this.send(frame,'select',id);
  }
  hover(frame:string,id:string){this.send(frame,'hover',id);}
  private route(frame:ElementFrame){
    const route=frame.routeUrl??frame.url;if(!route)return '';
    try{const url=new URL(route,this.target);for(const key of [...url.searchParams.keys()])if(key.startsWith('__ed_'))url.searchParams.delete(key);url.searchParams.sort();return url.pathname+url.search+url.hash;}catch{return '';}
  }
  linkedHover(frameId:string,id:string,owner=frameId){
    const frame=this.frames.get(frameId),node=frame?.nodes.find(n=>n.id===id);
    if(id&&frame?.inspecting&&node)this.activeHover={owner,frame:frameId,page:frame.page,plan:frame.plan,route:this.route(frame),site:node.site,instance:JSON.stringify(node.instance)};
    else if(this.activeHover?.owner===owner)this.activeHover=null;
    else return;
    this.syncHover();
  }
  clearLinkedHover(){this.activeHover=null;this.syncHover();}
  private syncHover(){
    const active=this.activeHover,source=active&&this.frames.get(active.frame);
    if(active&&(!source||!source.inspecting||source.page!==active.page||source.plan!==active.plan||this.route(source)!==active.route||!source.nodes.some(n=>n.site===active.site&&JSON.stringify(n.instance)===active.instance)))this.activeHover=null;
    for(const frame of this.frames.values()){
      const current=this.activeHover;
      const matches=current&&frame.inspecting&&frame.plan===current.plan&&(frame.frame===current.frame||current.route&&this.route(frame)===current.route)?frame.nodes.filter(n=>n.site===current.site&&JSON.stringify(n.instance)===current.instance):[];
      // Never fall back to a DOM path or label: responsive branches and repeated
      // templates can put a different element at the same visual tree position.
      const id=matches.length===1?matches[0].id:'';
      const previous=this.commands.get(frame.frame)?.find(c=>c.op==='hover');
      if((previous?.id===id&&previous.plan===frame.plan&&previous.page===frame.page)||(!previous&&!id))continue;
      this.send(frame.frame,'hover',id,{page:frame.page});
    }
  }
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
  engineRetry(){return new Response('<!doctype html><script>setTimeout(()=>location.reload(),1000)</script>',{headers:{'content-type':'text/html','cache-control':'no-store'}});}
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
    if(url.pathname==='/__exact_design/engine'&&req.method==='GET'){
      try{
        const response=await fetch(this.target+'/',{signal:req.signal,redirect:'error'});
        const html=await response.text(),base=html.match(/<base\s+href=["']([^"']+)["']/i)?.[1];
        if(!response.ok)return this.engineRetry();
        if(!base||!base.startsWith('/.exact/gen/'))return new Response(null,{status:204});
        const bundle=await fetch(new URL(base+'app.js',this.target),{signal:req.signal,redirect:'error'});
        if(!bundle.ok)return this.engineRetry();
        if(!sharedRuntime(await bundle.text()))return new Response(null,{status:204});
        const safe=base.replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;');
        return new Response(`<!doctype html><html><head><base href="${safe}"><script src="/__exact_design/event-stream-client.js"></script><script src="/__exact_design/shared-state-client.js"></script></head><body><script type="module">window.__exactDesignEngineReady={};try{await import('./app.js');}catch(error){if(error!==window.__exactDesignEngineReady)throw error;}</script></body></html>`,{headers:{'content-type':'text/html','cache-control':'no-store'}});
      }catch{return this.engineRetry();}
    }
    if(url.pathname==='/__exact_design/client.js')return new Response(script,{headers:{'content-type':'text/javascript','cache-control':'no-store'}});
    for(const name of ['spacing-client.js','spacing-geometry.js','design-preview-client.js','full-page-client.js','event-stream-client.js','project-hub.js','project-state-hub.js','shared-state-client.js','canvas-input-client.js'])if(url.pathname==='/__exact_design/'+name)return new Response(readFileSync(new URL('./'+name,import.meta.url),'utf8'),{headers:{'content-type':'text/javascript','cache-control':'no-store'}});
    if(url.pathname==='/__exact_design/feedback'&&req.method==='POST'){
      const packet=await req.json(),frame=this.frames.get(packet.frame);
      if(!frame||packet.page!==frame.page||packet.plan!==frame.plan)return new Response(null,{status:409});
      if(packet.kind==='hover'){
        if(!Number.isFinite(packet.time)||packet.time<0||typeof packet.id!=='string'||packet.id.length>2048||(packet.id&&(!frame.inspecting||!frame.nodes.some(n=>n.id===packet.id))))return new Response(null,{status:400});
        // Frames send independently; an older request can arrive after the
        // pointer has already entered a different viewport.
        if(packet.time<this.hoverTime)return Response.json({ok:true});
        this.hoverTime=packet.time;this.linkedHover(frame.frame,packet.id);
      }else if(packet.kind==='pick'){
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
      const frame={...(previous?.page===body.page?{contentHeight:previous?.contentHeight,viewportHeight:previous?.viewportHeight,fullHeight:previous?.fullHeight,width:previous?.width,url:previous?.url}:{}),routeUrl:typeof body.routeUrl==='string'&&body.routeUrl.length<=4096?body.routeUrl:undefined,frame:body.frame,page:typeof body.page==='string'&&body.page.length<=100?body.page:'',build:body.build,plan:body.plan,inspecting:body.inspecting===true,nodes,seen:Date.now()};
      this.frames.set(body.frame,frame);
      this.size(frame,{...body,height:body.contentHeight});
      this.syncHover();
      if(previous?.page!==frame.page||previous?.plan!==frame.plan||previous?.inspecting!==frame.inspecting)for(const listener of this.feedback)listener(frame,{kind:'ready'});
      return Response.json({commands:(this.commands.get(body.frame)||[]).filter(c=>c.seq>Number(body.after))});
    }
    if(url.pathname.startsWith('/__exact_design/')||url.pathname.startsWith('/__tamber'))return new Response(null,{status:404});
    const target=new URL(url.pathname+url.search,this.target);for(const key of [...target.searchParams.keys()])if(key.startsWith('__ed_'))target.searchParams.delete(key);
    if(target.origin!==this.target)return new Response(null,{status:400});
    const headers=new Headers(req.headers);for(const name of ['host','origin','referer','connection','accept-encoding'])headers.delete(name);
    if(origin)headers.set('origin',this.target);
    if(url.pathname.endsWith('/app.js')){headers.delete('if-none-match');headers.delete('if-modified-since');}
    try{
      const response=await fetch(target,{method:req.method,headers,body:['GET','HEAD'].includes(req.method)?undefined:req.body,redirect:'manual',signal:req.signal});
      const out=new Headers(response.headers);for(const name of ['content-length','content-encoding','transfer-encoding','connection'])out.delete(name);
      const redirect=out.get('location');if(redirect?.startsWith(this.target))out.set('location',this.origin+redirect.slice(this.target.length));
      if(response.headers.get('content-type')?.includes('text/html') && req.method!=='HEAD'){
        let html=scopePreviewIdentity(await response.text(),url.searchParams.get('__ed_frame')??'');
        out.delete('etag');out.set('cache-control','no-store');
        // Observe only the public build ID in Exact's registration. The captured
        // fetch otherwise receives exactly the original request and arguments.
        const inject=`<script src="/__exact_design/canvas-input-client.js"></script><script src="/__exact_design/event-stream-client.js"></script><script src="/__exact_design/shared-state-client.js"></script><script>{const original=window.fetch.bind(window);window.fetch=function(input,init){if(input==='/__dev/report'&&typeof init?.body==='string'){try{const report=JSON.parse(init.body);if(report.kind==='register'&&typeof report.id==='string')window.__exactDesignBuild=report.id;}catch{}}return original(input,init);};let press;addEventListener('pointerdown',e=>{press={x:e.clientX,y:e.clientY,id:e.pointerId};},true);addEventListener('pointerup',e=>{if(press?.id===e.pointerId&&Math.hypot(e.clientX-press.x,e.clientY-press.y)<=10)window.__exactDesignPick?.(e.clientX,e.clientY);press=null;},true);addEventListener('pointercancel',()=>{press=null;},true);}</script><script type="module" src="/__exact_design/client.js"></script>`;
        html=/<head[^>]*>/i.test(html)?html.replace(/<head[^>]*>/i,head=>head+inject):inject+html;
        return new Response(html,{status:response.status,headers:out});
      }
      if(url.pathname==='/__dev/inspect.js'&&response.ok){
        const source=await response.text();
        // Pinned Exact loads its instance table only on selection. Expose a
        // read-only warmup in the proxy so hover resolves each-row keys too.
        // The SDK checkout and the application's source stay unchanged.
        if(source.includes('async function inspectTable()')){
          out.delete('etag');out.set('cache-control','no-store');
          return new Response(source+'\nexport async function prepareStudioInstances(){await inspectTable();}\n',{status:response.status,headers:out});
        }
        return new Response(source,{status:response.status,headers:out});
      }
      if(url.pathname.endsWith('/app.js')&&response.ok){
        const source=await response.text(),adapted=sharedRuntime(source);
        if(adapted){out.delete('etag');out.set('cache-control','no-store');}
        return new Response(adapted??source,{status:response.status,headers:out});
      }
      return new Response(response.body,{status:response.status,headers:out});
    }catch{return new Response('The app dev server is unavailable.',{status:502});}
  }
}
