import {createHash} from 'node:crypto';
import {existsSync,readFileSync} from 'node:fs';
import {mkdir,readFile,readdir,realpath,stat,statfs,writeFile,rename,unlink} from 'node:fs/promises';
import {resolve,join,delimiter} from 'node:path';
import {homedir} from 'node:os';
import {nativeDevice} from '../studio/devices';
import {screenRoute,localPreview} from '../studio/project';
import {command,Simulators,type Runner,type NativeTarget} from './simulators';
const root=resolve(import.meta.dir,'..');
const hash=(s:string|Buffer)=>createHash('sha256').update(s).digest('hex');
const message=(e:unknown)=>e instanceof Error?e.message:String(e);
const brief=(e:unknown)=>{const lines=message(e).trim().split('\n');return (lines.findLast(l=>/error:|error\[|failed/i.test(l))??lines.at(-1)??'Native preview failed.').slice(0,600);};
export type NativeFrame={id:string;device:string;route:string};
type Shot={signature:string;file:string;width:number;height:number;capturedAt:number};
type FrameStatus='empty'|'queued'|'capturing'|'ready'|'stale'|'error';
type DiskState={signature?:string;app?:string;installed:Record<string,string>;shots:Record<string,Shot>};
const frameKey=(f:NativeFrame)=>hash(`${f.device}\0${f.route}`).slice(0,32);
export async function manifest(origin:string,request:typeof fetch=fetch){
  const response=await request(`${origin}/manifest.json`,{redirect:'error',signal:AbortSignal.timeout(4000)});
  if(!response.ok||!response.body)throw new Error('Could not read project manifest.');
  const reader=response.body.getReader();let size=0;const chunks:Uint8Array[]=[];
  try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>256*1024)throw new Error('Project manifest exceeds 256 KB.');chunks.push(value);}}finally{await reader.cancel().catch(()=>{});}
  return JSON.parse(Buffer.concat(chunks).toString());
}
const normalized=(v:any):string=>JSON.stringify(Array.isArray(v)?v.map(x=>JSON.parse(JSON.stringify(x,Object.keys(x).sort()))).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))):[]);
export class NativePreviews {
  readonly target:NativeTarget;readonly run:Runner;readonly cache:string;
  private apps=new Map<string,Promise<AppPreviews>>();private mappings=new Map<string,{dir:string;until:number}>();private version?:Promise<string>;
  constructor(readonly options:{target?:NativeTarget;run?:Runner;cache?:string;apps?:string[];fetch?:typeof fetch;free?: (dir:string)=>Promise<number>;settle?:number;firstSettle?:number;stable?:number;interval?:number}={}){this.run=options.run??command;this.target=options.target??new Simulators(this.run);this.cache=options.cache??process.env.EXACT_DESIGN_NATIVE_CACHE??join(root,'.exact/native-previews');}
  versions(){return this.version??=Promise.all([this.run(['git','-C',join(root,'.exact-sdk'),'rev-parse','HEAD']),this.target instanceof Simulators?this.target.xcodeVersion():this.run(['xcodebuild','-version'])]).then(v=>v.join('\n'));}
  async project(project:string){if(!localPreview(project)||new URL(project).origin!==project)throw new Error('Choose a local http project origin.');const cached=this.mappings.get(project);if(cached&&cached.until>Date.now())return this.app(cached.dir);
    const unknown='No unique registered native app matches this project. Set EXACT_DESIGN_NATIVE_APPS to its app directory.';
    let m:any;try{m=await manifest(project,this.options.fetch);}catch(e){throw new Error(`${unknown} ${brief(e)}`);}
    const dirs=[...new Set(await Promise.all((this.options.apps??[join(root,'examples/ember'),...(process.env.EXACT_DESIGN_NATIVE_APPS??'').split(delimiter).filter(Boolean).map(p=>resolve(root,p))]).map(p=>realpath(p).catch(()=>p))))];
    const matches=[];for(const dir of dirs){try{const a=JSON.parse(await readFile(join(dir,'app.json'),'utf8'));if(a.name===m.name&&normalized(a.protocol_handlers)===normalized(m.protocol_handlers))matches.push(dir);}catch{}}
    if(matches.length!==1)throw new Error(unknown);this.mappings.set(project,{dir:matches[0],until:Date.now()+5000});return this.app(matches[0]);
  }
  async app(dir:string){dir=await realpath(dir);let app=this.apps.get(dir);if(!app){app=AppPreviews.open(this,dir);this.apps.set(dir,app);}return app;}
  async stop(){await Promise.all([...this.apps.values()].map(async a=>(await a).finished()));await this.target.stop();}
}
export class AppPreviews {
  readonly key:string;readonly dir:string;private disk:DiskState={installed:{},shots:{}};private hashes=new Map<string,{mtime:number;size:number;hash:string}>();
  private tokens=new Set<string>();private tail=Promise.resolve();private listeners=new Set<()=>void>();private statuses=new Map<string,{state:FrameStatus;error:string}>();
  signature='';state='idle';phase='';message='';error='';done=0;total=0;
  private constructor(readonly service:NativePreviews,readonly appDir:string){this.key=hash(appDir).slice(0,16);this.dir=join(service.cache,this.key);}
  static async open(service:NativePreviews,dir:string){const a=new AppPreviews(service,dir);await mkdir(join(a.dir,'shots'),{recursive:true});try{a.disk=JSON.parse(await readFile(join(a.dir,'state.json'),'utf8'));}catch{}return a;}
  async inputs(){const entries:string[]=[];const walk=async(dir:string,rel='')=>{for(const e of (await readdir(dir,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){if(e.isSymbolicLink())continue;const path=join(dir,e.name),name=rel+e.name;if(e.isDirectory()){if(!e.name.startsWith('.')&&!['target','node_modules','dist'].includes(e.name))await walk(path,name+'/');}else if(e.isFile()){const s=await stat(path),prev=this.hashes.get(name);const digest=prev&&prev.mtime===s.mtimeMs&&prev.size===s.size?prev.hash:hash(await readFile(path));this.hashes.set(name,{mtime:s.mtimeMs,size:s.size,hash:digest});entries.push(JSON.stringify([name,digest]));}}};await walk(this.appDir);return hash(entries.join('\n')+await this.service.versions());}
  async refresh(){this.signature=await this.inputs();this.publish();}
  subscribe(fn:()=>void){this.listeners.add(fn);return ()=>this.listeners.delete(fn);}
  private publish(){for(const fn of this.listeners)fn();}
  private async save(){await writeFile(join(this.dir,'state.json.tmp'),JSON.stringify(this.disk));await rename(join(this.dir,'state.json.tmp'),join(this.dir,'state.json'));}
  snapshot(frames:NativeFrame[],origin='http://127.0.0.1:5175'){return {state:this.state,phase:this.phase,message:this.message,error:this.error,done:this.done,total:this.total,frames:frames.map(f=>{const key=frameKey(f),shot=this.disk.shots[key],status=this.statuses.get(key);return {id:f.id,state:status?.state==='ready'||!status?(shot?(shot.signature===this.signature?'ready':'stale'):'empty'):status.state,shot:shot?`${origin}/native/shot/${this.key}/${shot.file}?v=${shot.capturedAt}`:'',width:shot?.width??0,height:shot?.height??0,capturedAt:shot?.capturedAt??0,error:status?.error??''};})};}
  start(token:string,frames:NativeFrame[]){if(!token||this.tokens.has(token))return this.tail;this.tokens.add(token);const copy=frames.map(f=>({...f}));this.tail=this.tail.then(()=>this.job(copy));return this.tail;}
  finished(){return this.tail;}
  /** Capture until two screenshots a second apart match, so a sheet or a slow first draw has finished; an animated screen
   *  never matches and is taken at the deadline (EXACT_DESIGN_NATIVE_STABLE_MS, default 12 s after the settle wait). */
  private async settled(id:string,path:string,app:{name:string;app:{id:string}},route:string){
    const target=this.service.target,deadline=Date.now()+(this.service.options.stable??Number(process.env.EXACT_DESIGN_NATIVE_STABLE_MS??12000));
    const take=async()=>{if(!await target.capture(id,path,app.app.id))throw new Error(`${app.name} quit while opening ${route}`);return readFile(path);};
    let png=await take();
    while(Date.now()<deadline){await Bun.sleep(this.service.options.interval??1000);const next=await take();if(next.equals(png))break;png=next;}
    return png;
  }
  private progress(phase:string,text:string){this.phase=phase;this.message=text;this.publish();}
  private async job(frames:NativeFrame[]){this.state='working';this.phase='';this.message='Preparing native previews…';this.error='';this.done=0;this.total=frames.length;for(const f of frames)this.statuses.set(frameKey(f),{state:'queued',error:''});this.publish();
    try{
      try{await this.service.target.available();}catch(e){this.state='unavailable';throw e;}
      const app=JSON.parse(await readFile(join(this.appDir,'app.json'),'utf8'));const handler=app.protocol_handlers?.find((h:any)=>typeof h.protocol==='string'&&!['http','https'].includes(h.protocol.toLowerCase())&&!h.distribution_only&&typeof h.url==='string'&&h.url.includes('%s'));
      if(!handler)throw new Error('Add protocol_handlers and an /open route to open native screens. See the Ember example.');if(!app.app?.id)throw new Error('Set app.id in app.json.');
      await this.refresh();
      if(this.disk.signature!==this.signature||!this.disk.app||!existsSync(this.disk.app)){
        const fs=await statfs(this.appDir);const free=this.service.options.free?await this.service.options.free(this.appDir):fs.bavail*fs.bsize;const min=this.disk.app&&existsSync(this.disk.app)?10:20;
        if(free<min*1024**3)throw new Error(`Only ${(free/1024**3).toFixed(1)} GB free. Native builds need ${min} GB free.`);
        this.progress('build',`Building ${app.name} for iOS. The first build takes several minutes.`);let output='';
        try{output=await this.service.run([process.execPath,join(root,'tools/native-build.mjs'),this.appDir,...this.service.target.buildArgs],{PATH:`${homedir()}/.cargo/bin:${process.env.PATH}`,EXACT_FEEDBACK:'0'});await writeFile(join(this.dir,'build.log'),output);const built=/host\/apple:\s+(.+?\.app)(?:\s|$)/.exec(output)?.[1];if(!built||!existsSync(built))throw new Error('Build did not produce an app bundle.');this.disk.app=built;this.signature=await this.inputs();this.disk.signature=this.signature;await this.save();}
        catch(e){await writeFile(join(this.dir,'build.log'),output+'\n'+message(e));throw new Error(`${brief(e)} Full log: ${join(this.dir,'build.log')}`);}
      }
      const signature=this.disk.signature!;const devices=[...new Set(frames.map(f=>f.device))];let index=0;
      const worker=async()=>{while(index<devices.length){const slug=devices[index++],group=frames.filter(f=>f.device===slug),device=nativeDevice(slug)!;const name=device.name.replace(/^Native /,'');
        try{const id=await this.service.target.destination(name,device.simulator!);this.progress('boot',`Starting ${name}…`);let first=await this.service.target.boot(id);
          if(this.disk.installed[id]!==signature){this.progress('install',`Installing ${app.name} on ${name}…`);await this.service.target.install(id,this.disk.app!);this.disk.installed[id]=signature;first=true;}
          // The first launch after a boot or install can take longer than any fixed wait, especially on a busy Mac, and
          // capture the home screen. Launch once at the root and wait, so every capture below is a warm launch.
          if(first){this.progress('boot',`Opening ${app.name} on ${name}…`);await this.service.target.launch(id,app.app.id,`${handler.protocol}://`);await Bun.sleep(this.service.options.firstSettle??Number(process.env.EXACT_DESIGN_NATIVE_FIRST_SETTLE_MS??6000));first=false;}
          for(const f of group){const key=frameKey(f);this.statuses.set(key,{state:'capturing',error:''});this.progress('capture',`Capturing ${this.done+1} of ${this.total}…`);
            try{await this.service.target.launch(id,app.app.id,`${handler.protocol}://${f.route.slice(1)}`);await Bun.sleep(this.service.options.settle??Number(process.env.EXACT_DESIGN_NATIVE_SETTLE_MS??2500));
              const file=`${key}.png`,path=join(this.dir,'shots',`${key}.pending.png`);const png=await this.settled(id,path,app,f.route);if(png.length<24||png.toString('hex',0,8)!=='89504e470d0a1a0a')throw new Error('Simulator returned an invalid PNG.');await rename(path,join(this.dir,'shots',file));this.disk.shots[key]={signature,file,width:png.readUInt32BE(16),height:png.readUInt32BE(20),capturedAt:Date.now()};this.statuses.set(key,{state:'ready',error:''});
            }catch(e){this.statuses.set(key,{state:'error',error:brief(e)});}finally{await unlink(join(this.dir,'shots',`${key}.pending.png`)).catch(()=>{});}this.done++;this.publish();}
        }catch(e){for(const f of group)this.statuses.set(frameKey(f),{state:'error',error:brief(e)});this.done+=group.length;this.publish();}
      }};
      await Promise.all(Array.from({length:Math.min(devices.length,Math.max(1,Number(process.env.EXACT_DESIGN_NATIVE_PARALLEL)||2))},worker));await this.save();this.state='idle';this.message='Native previews updated.';
    }catch(e){if(this.state!=='unavailable')this.state='error';this.error=message(e).includes('Full log:')?message(e):brief(e);this.message=this.error;for(const f of frames)this.statuses.set(frameKey(f),{state:'error',error:this.error});}
    this.phase='';this.publish();
  }
}
const service=new NativePreviews();
export function nativeShot(path:string):Response{if(!/^[a-f0-9]{16}\/[a-z0-9-]+\.png$/.test(path))return new Response(null,{status:404});const [key,file]=path.split('/');try{return new Response(readFileSync(join(service.cache,key,'shots',file)),{headers:{'content-type':'image/png','cache-control':'no-store'}});}catch{return new Response(null,{status:404});}}
export function nativeScreens(body:unknown,request:Request):Response{
  let app:AppPreviews|undefined,frames:NativeFrame[]=[],error='',closed=false,last='',unsubscribe=()=>{},poll:ReturnType<typeof setInterval>,keep:ReturnType<typeof setInterval>,controller:ReadableStreamDefaultController<Uint8Array>;
  const origin=`http://127.0.0.1:${new URL(request.url).port||80}`;
  const publish=()=>{if(closed)return;const snapshot=error?{state:'error',phase:'',message:error,error,done:0,total:frames.length,frames:frames.map(f=>({id:f.id,state:'error',shot:'',width:0,height:0,capturedAt:0,error}))}:app?.snapshot(frames,origin);if(!snapshot)return;const text=JSON.stringify(snapshot);if(text!==last){last=text;controller.enqueue(new TextEncoder().encode(`data: ${text}\n\n`));}};
  const close=()=>{if(closed)return;closed=true;clearInterval(poll);clearInterval(keep);unsubscribe();request.signal.removeEventListener('abort',close);try{controller.close();}catch{}};
  const stream=new ReadableStream<Uint8Array>({start(c){controller=c;request.signal.addEventListener('abort',close,{once:true});if(request.signal.aborted){close();return;}
    keep=setInterval(()=>{if(!closed)controller.enqueue(new TextEncoder().encode(': keepalive\n\n'));},15000);keep.unref();
    void(async()=>{try{const b=body as any;if(!b||typeof b.project!=='string'||typeof b.run!=='string'||b.run.length>200||!Array.isArray(b.frames)||b.frames.length>200)throw new Error('Invalid native preview request.');frames=b.frames.map((f:any)=>{if(!f||typeof f.id!=='string'||f.id.length>100||typeof f.device!=='string'||!nativeDevice(f.device)||typeof f.route!=='string'||screenRoute(f.route)!==f.route)throw new Error('Invalid native preview frame.');return {id:f.id,device:f.device,route:f.route};});app=await service.project(b.project);if(closed)return;unsubscribe=app.subscribe(publish);if(b.run)void app.start(b.run,frames);else {try{await service.target.available();await app.refresh();}catch(e){app.state='unavailable';app.error=message(e);}}if(closed)return;publish();let checking=false;poll=setInterval(async()=>{if(checking)return;checking=true;try{await app!.refresh();}catch{}finally{checking=false;}},2000);poll.unref();}catch(e){error=message(e);publish();}})();
  },cancel:close});return new Response(stream,{headers:{'content-type':'text/event-stream','cache-control':'no-store'}});
}
export async function stopNativePreviews(){await service.stop();}
