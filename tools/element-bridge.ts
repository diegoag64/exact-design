import {readFileSync} from 'node:fs';
export type ElementNode={id:string;identity:string;path:string;parent:string;depth:number;label:string;tag:string;site:number;instance:unknown[]};
export type ElementFrame={frame:string;build:string;plan:string;inspecting:boolean;nodes:ElementNode[];seen:number};
const script=readFileSync(new URL('./element-bridge-client.js',import.meta.url),'utf8');
const bridges=new Map<string,ElementBridge>();
export function bridgeFor(origin:string){let bridge=bridges.get(origin);if(!bridge){bridge=new ElementBridge(origin);bridges.set(origin,bridge);}return bridge;}
export class ElementBridge {
  frames=new Map<string,ElementFrame>();seq=0;
  commands=new Map<string,{seq:number;op:string;id:string;plan:string}[]>();
  server:ReturnType<typeof Bun.serve>;
  constructor(readonly target:string){
    this.server=Bun.serve({hostname:'127.0.0.1',port:0,maxRequestBodySize:512*1024,idleTimeout:255,fetch:req=>this.handle(req)});
  }
  get origin(){return this.server.url.origin;}
  select(frame:string,id:string){this.commands.set(frame,[{seq:++this.seq,op:'select',id,plan:this.frames.get(frame)?.plan??''}]);}
  async handle(req:Request):Promise<Response>{
    const url=new URL(req.url),origin=req.headers.get('origin');
    if(url.origin!==this.origin || (origin && origin!==this.origin))return new Response('Forbidden',{status:403});
    if(url.pathname==='/__exact_design/client.js')return new Response(script,{headers:{'content-type':'text/javascript','cache-control':'no-store'}});
    if(url.pathname==='/__exact_design/tree' && req.method==='POST'){
      const body=await req.json();
      if(typeof body.frame!=='string'||body.frame.length>100||typeof body.build!=='string'||body.build.length>200||typeof body.plan!=='string'||body.plan.length>100||!Array.isArray(body.nodes)||body.nodes.length>600)return new Response(null,{status:400});
      for(const [key,frame]of this.frames)if(Date.now()-frame.seen>30000)this.frames.delete(key);
      if(!this.frames.has(body.frame)&&this.frames.size>=200)return new Response(null,{status:429});
      const nodes=body.nodes.filter((n:any)=>n&&typeof n.id==='string'&&n.id.length<2048&&typeof n.identity==='string'&&n.identity.length<2048&&typeof n.path==='string'&&n.path.length<4096&&typeof n.parent==='string'&&n.parent.length<2048&&typeof n.label==='string'&&n.label.length<=120&&typeof n.tag==='string'&&n.tag.length<40&&Number.isSafeInteger(n.depth)&&n.depth>=0&&n.depth<1000&&Number.isSafeInteger(n.site)&&Array.isArray(n.instance));
      this.frames.set(body.frame,{frame:body.frame,build:body.build,plan:body.plan,inspecting:body.inspecting===true,nodes,seen:Date.now()});
      return Response.json({commands:(this.commands.get(body.frame)||[]).filter(c=>c.seq>Number(body.after))});
    }
    if(url.pathname.startsWith('/__exact_design/')||url.pathname.startsWith('/__tamber'))return new Response(null,{status:404});
    const target=new URL(url.pathname+url.search,this.target);target.searchParams.delete('__ed_frame');
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
        const inject=`<script>{const original=window.fetch.bind(window);window.fetch=function(input,init){if(input==='/__dev/report'&&typeof init?.body==='string'){try{const report=JSON.parse(init.body);if(report.kind==='register'&&typeof report.id==='string')window.__exactDesignBuild=report.id;}catch{}}return original(input,init);};}</script><script type="module" src="/__exact_design/client.js"></script>`;
        html=/<head[^>]*>/i.test(html)?html.replace(/<head[^>]*>/i,head=>head+inject):inject+html;
        return new Response(html,{status:response.status,headers:out});
      }
      return new Response(response.body,{status:response.status,headers:out});
    }catch{return new Response('The app dev server is unavailable.',{status:502});}
  }
}
