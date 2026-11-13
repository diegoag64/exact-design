import {createHash} from 'node:crypto';
import {existsSync,readFileSync} from 'node:fs';
import {mkdir,readFile,readdir,realpath,stat,statfs,writeFile,rename,unlink} from 'node:fs/promises';
import {resolve,join,delimiter} from 'node:path';
import {homedir} from 'node:os';
import {nativeDevice} from '../studio/devices';
import {screenRoute,localPreview} from '../studio/project';
import {command,Simulators,availableMemory,deviceParallelism,BOOT_MEMORY,type Runner,type NativeTarget,type Appearance} from './simulators';
import {NativeReadiness,type Readiness,type Outcome,type Mark} from './native-readiness';
const root=resolve(import.meta.dir,'..');
const hash=(s:string|Buffer)=>createHash('sha256').update(s).digest('hex');
const message=(e:unknown)=>e instanceof Error?e.message:String(e);
const brief=(e:unknown)=>{const lines=message(e).trim().split('\n');return (lines.findLast(l=>/error:|error\[|failed/i.test(l))??lines.at(-1)??'Native preview failed.').slice(0,600);};
export type NativeFrame={id:string;device:string;route:string;appearance?:Appearance};
type Shot={signature:string;file:string;width:number;height:number;capturedAt:number};
type FrameStatus='empty'|'queued'|'capturing'|'ready'|'stale'|'error';
/** `buildMs` is the last build's duration and `coldMs` the last build that started without an app: the drawer's estimates. */
type DiskState={signature?:string;app?:string;buildMs?:number;coldMs?:number;shots:Record<string,Shot>};
/** A job's progress as the drawer lists it: build the app, prepare the simulator, capture the screens. */
export type StepState='pending'|'active'|'done'|'skipped'|'failed';
export type Step={id:'build'|'device'|'capture';label:string;state:StepState;detail:string};
/** Names the stage of a native build from its output as it arrives: each Rust crate as cargo compiles it, then Swift.
 *  The output gives no fraction: cargo prints no total, and the SDK replays swift-build's `[n / m]` counts only after
 *  Swift finishes, so a build's progress stays indeterminate. */
export class BuildProgress {
  private rest='';crates=0;detail='Compiling the Contract…';
  feed(text:string){const lines=(this.rest+text).split(/\r?\n/);this.rest=lines.pop()??'';let changed=false;for(const line of lines)changed=this.line(line)||changed;return changed;}
  private line(raw:string){
    const line=raw.trim(),m=/^Compiling ([\w.-]+)/.exec(line);
    if(m){this.crates++;this.detail=`Compiling Rust · ${m[1]} · ${this.crates} ${this.crates===1?'crate':'crates'}`;return true;}
    if(line.startsWith('host/apple: baked')){this.detail='Compiling Swift…';return true;}
    if(line.startsWith('Build complete!')){this.detail='Packaging the app…';return true;}
    return false;
  }
}
/** What this helper process has already done to a booted device, so a later job can skip it: the link approved (scheme and
 *  bundle id), the Reduce Motion value applied, the appearance, and the app known to be running. */
export type DeviceRecord={approved?:string;reduceMotion?:boolean;appearance?:Appearance;running?:string;
  /** When this process booted the device or launched the app: waits soon after get longer deadlines. */
  coldAt?:number};
/** A wait that starts this soon after a boot or launch gets COLD_FACTOR × its deadline; a pixel wait PIXEL_FACTOR ×. */
export const COLD_WINDOW=60000,COLD_FACTOR=2,PIXEL_FACTOR=1.5,LAUNCH_FACTOR=2.5;
/** A cold boot waits for memory while another device is still starting: every BOOT_POLL, up to BOOT_WAIT. */
export const BOOT_POLL=3000,BOOT_WAIT=90000;
/** A screenshot's key: device, route and appearance. Light keeps the key it had before appearances, so older shots stay light. */
export const frameKey=(f:NativeFrame)=>hash(`${f.device}\0${f.route}${(f.appearance??'light')==='light'?'':`\0${f.appearance}`}`).slice(0,32);
export async function manifest(origin:string,request:typeof fetch=fetch){
  const response=await request(`${origin}/manifest.json`,{redirect:'error',signal:AbortSignal.timeout(4000)});
  if(!response.ok||!response.body)throw new Error('Could not read project manifest.');
  const reader=response.body.getReader();let size=0;const chunks:Uint8Array[]=[];
  try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>256*1024)throw new Error('Project manifest exceeds 256 KB.');chunks.push(value);}}finally{await reader.cancel().catch(()=>{});}
  return JSON.parse(Buffer.concat(chunks).toString());
}
const normalized=(v:any):string=>JSON.stringify(Array.isArray(v)?v.map(x=>JSON.parse(JSON.stringify(x,Object.keys(x).sort()))).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))):[]);
export type NativeOptions={target?:NativeTarget;run?:Runner;cache?:string;apps?:string[];fetch?:typeof fetch;free?:(dir:string)=>Promise<number>;
  /** How screens are judged ready; the default reads the accessibility tree and falls back to screenshots. */
  readiness?:Readiness;
  /** Reduce Motion on managed simulators (EXACT_DESIGN_NATIVE_REDUCE_MOTION=0 turns it off). */
  reduceMotion?:boolean;
  /** Devices driven at once (EXACT_DESIGN_NATIVE_PARALLEL, default 4), before the memory guard. */
  parallel?:number;
  /** Available memory in bytes, or undefined when unknown; the default reads vm_stat. */
  memory?:()=>Promise<number|undefined>;
  /** Memory a device's touch runner needs to start (EXACT_DESIGN_NATIVE_AX_MIN_GB, default 0: no gate, since runners
   *  start only when a job is over or on a warm app). */
  axMemory?:number;
  /** Logs why a device reads pixels; the default writes to the console. */
  notice?:(udid:string,reason:string)=>void;
  now?:()=>number;sleep?:(ms:number)=>Promise<void>;
};
export class NativePreviews {
  readonly target:NativeTarget;readonly run:Runner;readonly cache:string;readonly readiness:Readiness;
  /** Per booted device: dropped when a job's scan finds the device shut down. */
  readonly records=new Map<string,DeviceRecord>();
  /** Installation ownership is shared by projects, keyed by device and bundle ID. Unknown after a helper restart. */
  readonly installed=new Map<string,string>();
  /** Devices booting or launching their app now: a cold boot waits for them when memory is short. */
  readonly starting=new Set<string>();
  private noted=new Set<string>();private jobs=0;private tail=Promise.resolve();private stopped?:Promise<void>;
  stopping=false;
  checkRunning(){if(this.stopping)throw new Error('Native previews are stopping.');}
  /** Apps share simulators; serialize whole app jobs while retaining each job’s device parallelism. */
  enqueue(job:()=>Promise<void>){if(this.stopping)return this.tail;const next=this.tail.then(async()=>{if(!this.stopping)await job();});this.tail=next.catch(()=>{});return next;}
  now(){return (this.options.now??Date.now)();}
  sleep(ms:number){return (this.options.sleep??Bun.sleep)(ms);}
  get axMemory(){return this.options.axMemory??Math.max(0,Number(process.env.EXACT_DESIGN_NATIVE_AX_MIN_GB)||0)*1024**3;}
  /** Starts opening touch runners in the background for devices that have none open and retries left, while available
   *  memory covers each one (the first needs `axMemory` free, the second twice that, and so on). False when memory ran
   *  short. Once open, a runner is cheap; only its start is heavy. */
  async openRunners(ids:string[],appId:string){
    if(this.stopping)return false;const readiness=this.readiness;if(!readiness.prepare)return true;
    const wanted=ids.filter(id=>this.records.has(id)&&readiness.needsOpen?.(id,appId)!==false);if(!wanted.length)return true;
    const need=this.axMemory,available=need>0?await this.memoryAvailable():undefined;let enough=true;
    if(this.stopping)return false;wanted.forEach((id,i)=>{
      if(available!==undefined&&available-i*need<need){enough=false;this.notice(id,`only ${(Math.max(0,available-i*need)/1024**3).toFixed(1)} GB of memory is available and the accessibility runner needs ${(need/1024**3).toFixed(1)} GB`);}
      else readiness.prepare!(id,appId);
    });
    return enough;
  }
  /** Starts a job's count, so each device's notice is logged once per job. */
  nextJob(){this.jobs++;}
  notice(udid:string,reason:string){const key=`${this.jobs}\0${udid}`;if(this.noted.has(key))return;this.noted.add(key);(this.options.notice??((u,r)=>console.warn(`Native previews: ${u} detects settled screens from screenshots: ${r}`)))(udid,reason);}
  /** Bytes macOS can hand out now (vm_stat), or undefined when unreadable. */
  async memoryAvailable(){try{return this.options.memory?await this.options.memory():availableMemory(await this.run(['vm_stat']));}catch{return undefined;}}
  /** Before a cold boot: while memory is short and another device is still booting or launching, wait for it (up to
   *  BOOT_WAIT); then boot anyway, so progress keeps moving. */
  async bootGate(id:string){
    this.checkRunning();const start=this.now();
    while([...this.starting].some(other=>other!==id)&&this.now()-start<BOOT_WAIT){
      const available=await this.memoryAvailable();if(available===undefined||available>=BOOT_MEMORY)break;
      await this.sleep(BOOT_POLL);this.checkRunning();
    }
    this.starting.add(id);
  }
  private apps=new Map<string,Promise<AppPreviews>>();private mappings=new Map<string,{dir:string;until:number}>();private version?:Promise<string>;
  constructor(readonly options:NativeOptions={}){this.run=options.run??command;this.target=options.target??new Simulators(this.run);this.cache=options.cache??process.env.EXACT_DESIGN_NATIVE_CACHE??join(root,'.exact/native-previews');
    // EXACT_DESIGN_NATIVE_READINESS=pixel never opens a touch runner.
    this.readiness=options.readiness??new NativeReadiness({mode:process.env.EXACT_DESIGN_NATIVE_READINESS==='pixel'?'pixel':'ax',
      shoot:async udid=>{const path=join(this.cache,'probe',`${udid.replace(/[^A-Za-z0-9-]/g,'')}.bmp`);await mkdir(join(this.cache,'probe'),{recursive:true});await this.target.screenshot(udid,path,'bmp');return readFile(path);},
      notice:(udid,reason)=>this.notice(udid,reason),
    });}
  get reduceMotion(){return this.options.reduceMotion??process.env.EXACT_DESIGN_NATIVE_REDUCE_MOTION!=='0';}
  async parallelism(devices:{booted:boolean}[]){
    const cap=Math.max(1,Math.floor(this.options.parallel??(Number(process.env.EXACT_DESIGN_NATIVE_PARALLEL)||4)));
    const cold=devices.filter(d=>!d.booted).length,available=cold?await this.memoryAvailable():undefined;
    return deviceParallelism({devices:devices.length,cold,cap,available});
  }
  versions(){return this.version??=Promise.all([this.run(['git','-C',join(root,'.exact-sdk'),'rev-parse','HEAD']),this.target instanceof Simulators?this.target.xcodeVersion():this.run(['xcodebuild','-version'])]).then(v=>v.join('\n')).catch(e=>{this.version=undefined;throw e;});}
  async project(project:string){if(!localPreview(project)||new URL(project).origin!==project)throw new Error('Choose a local http project origin.');const cached=this.mappings.get(project);if(cached&&cached.until>Date.now())return this.app(cached.dir);
    const unknown='No unique registered native app matches this project. Set EXACT_DESIGN_NATIVE_APPS to its app directory.';
    let m:any;try{m=await manifest(project,this.options.fetch);}catch(e){throw new Error(`${unknown} ${brief(e)}`);}
    const dirs=[...new Set(await Promise.all((this.options.apps??[join(root,'examples/ember'),...(process.env.EXACT_DESIGN_NATIVE_APPS??'').split(delimiter).filter(Boolean).map(p=>resolve(root,p))]).map(p=>realpath(p).catch(()=>p))))];
    const matches=[];for(const dir of dirs){try{const a=JSON.parse(await readFile(join(dir,'app.json'),'utf8'));if(a.name===m.name&&normalized(a.protocol_handlers)===normalized(m.protocol_handlers))matches.push(dir);}catch{}}
    if(matches.length!==1)throw new Error(unknown);this.mappings.set(project,{dir:matches[0],until:Date.now()+5000});return this.app(matches[0]);
  }
  async app(dir:string){dir=await realpath(dir);let app=this.apps.get(dir);if(!app){app=AppPreviews.open(this,dir);this.apps.set(dir,app);}return app;}
  /** Stop after the active step, skip queued jobs, restore accessibility, and shut down owned simulators. */
  stop(){this.stopping=true;return this.stopped??=(async()=>{await this.tail;try{await this.readiness.close();}finally{await this.target.stop();this.records.clear();this.installed.clear();}})();}
}
type Job={key:string;frame:NativeFrame};
export class AppPreviews {
  readonly key:string;readonly dir:string;private disk:DiskState={shots:{}};private hashes=new Map<string,{mtime:number;size:number;hash:string}>();
  private tokens=new Set<string>();private pending=0;private tail=Promise.resolve();private listeners=new Set<()=>void>();private statuses=new Map<string,{state:FrameStatus;error:string}>();
  signature='';state='idle';phase='';message='';error='';done=0;total=0;
  steps:Step[]=[];estimate=0;private stepAt=0;private ticker?:ReturnType<typeof setInterval>;
  private constructor(readonly service:NativePreviews,readonly appDir:string){this.key=hash(appDir).slice(0,16);this.dir=join(service.cache,this.key);}
  static async open(service:NativePreviews,dir:string){const a=new AppPreviews(service,dir);await mkdir(join(a.dir,'shots'),{recursive:true});try{a.disk=JSON.parse(await readFile(join(a.dir,'state.json'),'utf8'));}catch{}return a;}
  async inputs(){const entries:string[]=[];const walk=async(dir:string,rel='')=>{for(const e of (await readdir(dir,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){if(e.isSymbolicLink())continue;const path=join(dir,e.name),name=rel+e.name;if(e.isDirectory()){if(!e.name.startsWith('.')&&!['target','node_modules','dist'].includes(e.name))await walk(path,name+'/');}else if(e.isFile()){const s=await stat(path),prev=this.hashes.get(name);const digest=prev&&prev.mtime===s.mtimeMs&&prev.size===s.size?prev.hash:hash(await readFile(path));this.hashes.set(name,{mtime:s.mtimeMs,size:s.size,hash:digest});entries.push(JSON.stringify([name,digest]));}}};await walk(this.appDir);return hash(entries.join('\n')+await this.service.versions());}
  async refresh(){const signature=await this.inputs();this.signature=signature;this.publish();return signature;}
  subscribe(fn:()=>void){this.listeners.add(fn);return ()=>this.listeners.delete(fn);}
  private publish(){for(const fn of this.listeners)fn();}
  private async save(){await writeFile(join(this.dir,'state.json.tmp'),JSON.stringify(this.disk));await rename(join(this.dir,'state.json.tmp'),join(this.dir,'state.json'));}
  /** A frame's state: a job's status while it runs or after it failed, else what its latest screenshot says. */
  private frameState(key:string):FrameStatus{const shot=this.disk.shots[key],status=this.statuses.get(key);return status?.state==='ready'||!status?(shot?(shot.signature===this.signature?'ready':'stale'):'empty'):status.state;}
  snapshot(frames:NativeFrame[],origin='http://127.0.0.1:5175'){
    // Only capture has a real fraction: the screens done. Building and preparing a simulator report -1.
    const capturing=this.steps.find(s=>s.id==='capture')?.state==='active',progress=capturing&&this.total?this.done/this.total:-1;
    return {state:this.state,phase:this.phase,message:this.message,error:this.error,done:this.done,total:this.total,
      steps:this.steps.map(s=>({...s,detail:s.id==='capture'&&s.state==='active'?`${Math.min(this.done+1,this.total)} of ${this.total}`:s.detail})),progress,elapsed:this.elapsed,estimate:this.estimate,frames:frames.map(f=>{const key=frameKey(f),shot=this.disk.shots[key],status=this.statuses.get(key);return {id:f.id,state:this.frameState(key),shot:shot?`${origin}/native/shot/${this.key}/${shot.file}?v=${shot.capturedAt}`:'',width:shot?.width??0,height:shot?.height??0,capturedAt:shot?.capturedAt??0,error:status?.error??''};})};}
  /** Starts one job per new token. `capture` empty: every frame that is not ready; ids: exactly those frames. */
  start(token:string,frames:NativeFrame[],capture:string[]=[]){
    if(this.service.stopping||!token||this.tokens.has(token))return this.tail;
    this.tokens.add(token);this.pending++;
    if(this.state!=='working')this.waiting();
    const copy=frames.map(f=>({...f,appearance:f.appearance??'light'})),ids=[...capture];this.tail=this.service.enqueue(()=>this.job(copy,ids)).finally(()=>{this.pending--;});return this.tail;
  }
  private waiting(){this.state='working';this.phase='queued';this.message='Waiting for native refresh…';this.error='';this.done=0;this.total=0;this.publish();}
  private progress(phase:string,text:string){this.phase=phase;this.message=text;
    if(phase==='boot'||phase==='install')this.step('device','active',text);
    if(phase==='capture'){const device=this.steps.find(s=>s.id==='device');if(device?.state==='pending')this.step('device','skipped','Already running');this.step('capture','active',`${Math.min(this.done+1,this.total)} of ${this.total}`);}
    this.publish();}
  /** Moves a job to a step. One step is active at a time: an earlier active step is done, and a later one goes back to
   *  pending, as when a capture has to launch the app first. */
  private step(id:Step['id'],state:StepState,detail:string){
    const index=this.steps.findIndex(s=>s.id===id);if(index<0)return;const step=this.steps[index]!;
    if(state==='active'){this.steps.forEach((s,i)=>{if(i!==index&&s.state==='active')s.state=i<index?'done':'pending';});if(step.state!=='active')this.stepAt=this.service.now();}
    step.state=state;step.detail=detail;this.publish();}
  private startSteps(){this.steps=[{id:'build',label:'Build app',state:'pending',detail:''},{id:'device',label:'Prepare simulator',state:'pending',detail:''},{id:'capture',label:'Capture',state:'pending',detail:''}];this.estimate=0;this.stepAt=this.service.now();
    clearInterval(this.ticker);this.ticker=setInterval(()=>this.publish(),1000);this.ticker.unref?.();}
  private endSteps(){clearInterval(this.ticker);this.ticker=undefined;this.steps=[];this.estimate=0;}
  /** Seconds the active step has run, for the drawer's timer. */
  get elapsed(){return this.state==='working'&&this.steps.some(s=>s.state==='active')?Math.max(0,Math.floor((this.service.now()-this.stepAt)/1000)):0;}
  private async job(frames:NativeFrame[],capture:string[]){
    this.service.nextJob();this.state='working';this.phase='';this.message='Preparing native previews…';this.error='';this.done=0;this.total=0;this.startSteps();this.publish();let jobs:Job[]=[],appId='';const used:string[]=[];
    try{
      this.service.checkRunning();
      try{await this.service.target.available();}catch(e){this.state='unavailable';throw e;}
      const app=JSON.parse(await readFile(join(this.appDir,'app.json'),'utf8'));const handler=app.protocol_handlers?.find((h:any)=>typeof h.protocol==='string'&&!['http','https'].includes(h.protocol.toLowerCase())&&!h.distribution_only&&typeof h.url==='string'&&h.url.includes('%s'));
      if(!handler)throw new Error('Add protocol_handlers and an /open route to open native screens. See the Ember example.');if(!app.app?.id)throw new Error('Set app.id in app.json.');appId=app.app.id;
      const inputSignature=await this.refresh();this.service.checkRunning();
      // Refresh all skips frames already current for this build; a list of ids captures exactly those frames.
      const chosen=new Map<string,Job>();for(const frame of frames){const key=frameKey(frame);if(chosen.has(key))continue;if(capture.length?capture.includes(frame.id):this.frameState(key)!=='ready')chosen.set(key,{key,frame});}
      jobs=[...chosen.values()];
      if(!jobs.length){this.state='idle';this.message='Native previews are up to date.';return;}
      this.total=jobs.length;for(const j of jobs)this.statuses.set(j.key,{state:'queued',error:''});this.publish();
      if(this.disk.signature!==inputSignature||!this.disk.app||!existsSync(this.disk.app)){
        // Cold: neither this helper nor the SDK's CLI (`bun exact.mjs ios`, or an interrupted refresh) has built the app for
        // the iOS Simulator in this checkout, so every crate and Swift target compiles.
        const built=!!this.disk.app&&existsSync(this.disk.app),cold=!built&&!existsSync(join(this.appDir,'target','aarch64-apple-ios-sim'));
        const fs=await statfs(this.appDir);const free=this.service.options.free?await this.service.options.free(this.appDir):fs.bavail*fs.bsize;const min=cold?20:10;
        if(free<min*1024**3)throw new Error(`Only ${(free/1024**3).toFixed(1)} GB free. Native builds need ${min} GB free.`);
        this.service.checkRunning();
        this.message=cold?`Building ${app.name} for iOS. The first build in this checkout takes several minutes.`:built?`Rebuilding ${app.name} with your changes…`:`Building ${app.name} for iOS…`;this.phase='build';
        this.estimate=Math.round(((cold?this.disk.coldMs:this.disk.buildMs)??0)/1000);
        const reader=new BuildProgress();this.step('build','active',reader.detail);let output='';const started=this.service.now();
        try{output=await this.service.run([process.execPath,join(root,'tools/native-build.mjs'),this.appDir,...this.service.target.buildArgs],{PATH:`${homedir()}/.cargo/bin:${process.env.PATH}`,EXACT_FEEDBACK:'0'},text=>{if(reader.feed(text))this.step('build','active',reader.detail);});await writeFile(join(this.dir,'build.log'),output);const built=/host\/apple:\s+(.+?\.app)(?:\s|$)/.exec(output)?.[1];if(!built||!existsSync(built))throw new Error('Build did not produce an app bundle.');this.disk.app=built;this.disk.signature=inputSignature;const took=this.service.now()-started;this.disk.buildMs=took;if(cold)this.disk.coldMs=took;await this.save();await this.refresh();this.estimate=0;this.step('build','done',`Built in ${Math.max(1,Math.round(took/1000))} s`);}
        catch(e){await writeFile(join(this.dir,'build.log'),output+'\n'+message(e));this.step('build','failed','Build failed');throw new Error(`${brief(e)} Full log: ${join(this.dir,'build.log')}`);}
      }else this.step('build','skipped','Up to date');
      this.service.checkRunning();const context={name:app.name as string,appId:app.app.id as string,scheme:handler.protocol as string,signature:this.disk.signature!};
      const fail=(group:Job[],e:unknown)=>{for(const j of group)if(this.statuses.get(j.key)?.state!=='ready'&&this.statuses.get(j.key)?.state!=='error'){this.statuses.set(j.key,{state:'error',error:brief(e)});this.done++;}this.publish();};
      // One device listing per job: which simulators exist and which are booted.
      const target=this.service.target;await target.scan();const devices:{slug:string;id:string;booted:boolean;group:Job[]}[]=[];
      for(const slug of new Set(jobs.map(j=>j.frame.device))){this.service.checkRunning();const group=jobs.filter(j=>j.frame.device===slug),device=nativeDevice(slug)!;
        try{const id=await target.destination(device.name.replace(/^Native /,''),device.simulator!),booted=await target.booted(id);if(!booted)this.service.records.delete(id);devices.push({slug,id,booted,group});used.push(id);}catch(e){fail(group,e);}}
      // Booted devices first: they cost no memory, and a cold one waits for a free slot.
      devices.sort((a,b)=>Number(b.booted)-Number(a.booted));let index=0;
      const worker=async()=>{while(index<devices.length&&!this.service.stopping){const d=devices[index++];try{await this.device(d.slug,d.id,d.booted,d.group,context);}catch(e){this.service.records.delete(d.id);fail(d.group,e);}finally{this.service.starting.delete(d.id);}}};
      await Promise.all(Array.from({length:await this.service.parallelism(devices)},worker));
      this.service.checkRunning();await this.save();this.state='idle';this.message='Native previews updated.';
    }catch(e){for(const s of this.steps)if(s.state==='active')s.state='failed';if(this.state!=='unavailable')this.state='error';this.error=message(e).includes('Full log:')?message(e):brief(e);this.message=this.error;for(const j of jobs)this.statuses.set(j.key,{state:'error',error:this.error});}
    finally{this.endSteps();if(this.pending>1&&!this.service.stopping)this.waiting();else{this.phase='';this.publish();}
      // So the next job starts on the tree: open runners now that this job's boots and launches are over.
      if(!this.service.stopping&&used.length&&appId)await this.service.openRunners(used,appId).catch(()=>{});}
  }
  /** One device's frames, warm: the app keeps running and each screen is opened with a link after a root reset. A device
   *  this process already prepared and that is still booted skips straight to its screens. */
  private async device(slug:string,id:string,booted:boolean,group:Job[],c:{name:string;appId:string;scheme:string;signature:string}){
    const target=this.service.target,readiness=this.service.readiness,name=nativeDevice(slug)!.name.replace(/^Native /,'');
    this.service.checkRunning();let record=this.service.records.get(id);
    await readiness.releaseOtherApp?.(id,c.appId);this.service.checkRunning();
    if(!booted||!record){this.progress('boot',`Starting ${name}…`);if(!booted)await this.service.bootGate(id);this.service.checkRunning();const fresh=await target.boot(id);record={coldAt:fresh?this.service.now():record?.coldAt};this.service.records.set(id,record);}
    this.service.checkRunning();readiness.forget?.(id);
    let relaunch=false;
    const installKey=`${id}\0${c.appId}`,buildKey=`${this.key}\0${c.signature}`;
    if(this.service.installed.get(installKey)!==buildKey){this.progress('install',`Installing ${c.name} on ${name}…`);this.service.installed.delete(installKey);await target.install(id,this.disk.app!);this.service.installed.set(installKey,buildKey);relaunch=true;record={coldAt:record.coldAt};this.service.records.set(id,record);}
    this.service.checkRunning();const approval=`${c.scheme}\0${c.appId}`;if(record.approved!==approval){await target.approve(id,c.scheme,c.appId);record.approved=approval;}
    this.service.checkRunning();const reduce=this.service.reduceMotion;if(record.reduceMotion!==reduce){if(await target.reduceMotion(id,reduce))relaunch=true;record.reduceMotion=reduce;}
    this.service.checkRunning();const r=record;r.appearance??=await target.appearance(id);
    // `known`: the app is running as this process left it. `atRoot`: it shows its root screen, settled.
    // `confirmed`: the last wait read the tree, which also confirmed the app in front.
    let known=r.running===c.appId&&!relaunch,atRoot=false,confirmed=false;
    // A touch runner's start is heavy: on a device that boots or launches in this job it waits for the job's end
    // (`openRunners`), and the device reads pixels until then. A warm device opens one at once, memory permitting; after
    // too little memory it stays on pixels for this job.
    let cold=!booted,lowMemory=false;
    const runner=async()=>{if(cold||lowMemory)return;if(!await this.service.openRunners([id],c.appId))lowMemory=true;};
    if(known)await runner();
    const deadline=readiness.deadline??8000;
    // Soon after a boot or launch the device is still busy, and pixels are slower than the tree: both get longer.
    const deadlineFor=(mark:Mark)=>deadline*(this.service.now()-(r.coldAt??-Infinity)<COLD_WINDOW?COLD_FACTOR:1)*(mark.mode==='pixel'?PIXEL_FACTOR:1);
    let used=deadline;
    const ensure=async()=>{
      this.service.checkRunning();if(known)return;let running=await target.running(id,c.appId);
      if(running&&relaunch){readiness.forget?.(id);await target.terminate(id,c.appId);running=false;}relaunch=false;
      if(running){known=true;r.running=c.appId;this.service.starting.delete(id);await runner();return;}
      this.service.checkRunning();this.progress('boot',`Opening ${c.name} on ${name}…`);cold=true;this.service.starting.add(id);readiness.forget?.(id);const mark=await readiness.mark(id,c.appId,true);this.service.checkRunning();await target.launch(id,c.appId);r.coldAt=this.service.now();
      // A first launch after a boot or install is slower than a link; it gets two and a half link deadlines. Only the tree
      // tells the root screen from a launch screen, so pixels leave the root to the first reset.
      this.service.checkRunning();const outcome=await readiness.wait(mark,deadline*LAUNCH_FACTOR);this.service.checkRunning();this.service.starting.delete(id);known=outcome!=='quit';r.running=known?c.appId:undefined;confirmed=mark.via==='ax';atRoot=outcome==='ready'&&confirmed;
    };
    const go=async(url:string):Promise<Outcome>=>{this.service.checkRunning();const mark=await readiness.mark(id,c.appId);this.service.checkRunning();await target.open(id,url);this.service.checkRunning();used=deadlineFor(mark);const outcome=await readiness.wait(mark,used);this.service.checkRunning();confirmed=mark.via==='ax';return outcome;};
    const lose=()=>{known=false;atRoot=false;r.running=undefined;};
    const appearances=[...new Set(group.map(j=>j.frame.appearance??'light'))].sort((a,b)=>Number(b===r.appearance)-Number(a===r.appearance));
    try{
      for(const appearance of appearances){this.service.checkRunning();
        if(appearance!==r.appearance){
          // A running app redraws in place: wait for it. One about to launch starts in the new appearance.
          if(known){const mark=await readiness.mark(id,c.appId);this.service.checkRunning();await target.setAppearance(id,appearance);r.appearance=appearance;this.service.checkRunning();if(await readiness.wait(mark,deadlineFor(mark))==='quit')lose();}
          else{readiness.forget?.(id);await target.setAppearance(id,appearance);r.appearance=appearance;}
        }
        // The root screen first: it needs no reset, and the next screen starts from it.
        for(const {key,frame} of group.filter(j=>(j.frame.appearance??'light')===appearance).sort((a,b)=>Number(b.frame.route==='/')-Number(a.frame.route==='/'))){
          this.service.checkRunning();this.statuses.set(key,{state:'capturing',error:''});this.progress('capture',`Capturing ${this.done+1} of ${this.total}…`);
          const pending=join(this.dir,'shots',`${key}.pending.png`),quit=()=>new Error(`${c.name} quit while opening ${frame.route}`);
          try{
            await ensure();
            for(let attempt=1;;attempt++){this.service.checkRunning();
              let outcome:Outcome='ready';
              // The root link resets the app: it dismisses a sheet and leaves a full-screen route. For `/` it is the capture.
              if(!atRoot||attempt>1){atRoot=false;outcome=await go(`${c.scheme}://`);if(outcome==='ready')atRoot=true;}
              if(outcome==='ready'&&frame.route!=='/'){atRoot=false;outcome=await go(`${c.scheme}://${frame.route.slice(1)}`);}
              if(outcome==='ready')break;
              atRoot=false;
              if(outcome==='quit'){lose();if(attempt>=2)throw quit();await ensure();continue;}
              if(attempt>=2)throw new Error(`${c.name} did not settle on ${frame.route} within ${Math.round(used/100)/10} s.`);
            }
            this.service.checkRunning();await target.screenshot(id,pending,'png');
            // A tree read already confirmed the app in front; pixels cannot tell, so ask the device.
            if(!confirmed&&!await target.running(id,c.appId)){lose();throw quit();}
            const png=await readFile(pending);if(png.length<24||png.toString('hex',0,8)!=='89504e470d0a1a0a')throw new Error('Simulator returned an invalid PNG.');
            const file=`${key}.png`;await rename(pending,join(this.dir,'shots',file));
            this.disk.shots[key]={signature:c.signature,file,width:png.readUInt32BE(16),height:png.readUInt32BE(20),capturedAt:Date.now()};this.statuses.set(key,{state:'ready',error:''});
            // On a warm device, a runner that failed to open gets its one more try once a screen has settled.
            await runner();
          }catch(e){atRoot=false;this.statuses.set(key,{state:'error',error:brief(e)});}
          finally{await unlink(pending).catch(()=>{});}
          this.done++;this.publish();
        }
      }
    }finally{if(r.appearance!=='light'){readiness.forget?.(id);await target.setAppearance(id,'light').then(()=>{r.appearance='light';},()=>{r.appearance=undefined;});}}
  }
}
const service=new NativePreviews();
export function nativeShot(path:string):Response{if(!/^[a-f0-9]{16}\/[a-z0-9-]+\.png$/.test(path))return new Response(null,{status:404});const [key,file]=path.split('/');try{return new Response(readFileSync(join(service.cache,key,'shots',file)),{headers:{'content-type':'image/png','cache-control':'no-store'}});}catch{return new Response(null,{status:404});}}
/** Validates a `/native` request body: its frames (appearance defaults to light) and the `capture` ids. */
export function nativeRequest(body:unknown):{project:string;run:string;capture:string[];frames:NativeFrame[]}{
  const b=body as any;if(!b||typeof b.project!=='string'||typeof b.run!=='string'||b.run.length>200||!Array.isArray(b.frames)||b.frames.length>200)throw new Error('Invalid native preview request.');
  if(b.capture!==undefined&&(!Array.isArray(b.capture)||b.capture.length>200||b.capture.some((id:unknown)=>typeof id!=='string'||id.length>100)))throw new Error('Invalid native preview request.');
  const frames=b.frames.map((f:any)=>{if(!f||typeof f.id!=='string'||f.id.length>100||typeof f.device!=='string'||!nativeDevice(f.device)||typeof f.route!=='string'||screenRoute(f.route)!==f.route||(f.appearance!==undefined&&f.appearance!=='light'&&f.appearance!=='dark'))throw new Error('Invalid native preview frame.');return {id:f.id,device:f.device,route:f.route,appearance:f.appearance??'light'};});
  return {project:b.project,run:b.run,capture:b.capture??[],frames};
}
export function nativeScreens(body:unknown,request:Request):Response{
  let app:AppPreviews|undefined,frames:NativeFrame[]=[],error='',closed=false,last='',unsubscribe=()=>{},poll:ReturnType<typeof setInterval>,keep:ReturnType<typeof setInterval>,controller:ReadableStreamDefaultController<Uint8Array>;
  const origin=`http://127.0.0.1:${new URL(request.url).port||80}`;
  const publish=()=>{if(closed)return;const snapshot=error?{state:'error',phase:'',message:error,error,done:0,total:frames.length,steps:[],progress:-1,elapsed:0,estimate:0,frames:frames.map(f=>({id:f.id,state:'error',shot:'',width:0,height:0,capturedAt:0,error}))}:app?.snapshot(frames,origin);if(!snapshot)return;const text=JSON.stringify(snapshot);if(text!==last){last=text;controller.enqueue(new TextEncoder().encode(`data: ${text}\n\n`));}};
  const close=()=>{if(closed)return;closed=true;clearInterval(poll);clearInterval(keep);unsubscribe();request.signal.removeEventListener('abort',close);try{controller.close();}catch{}};
  const stream=new ReadableStream<Uint8Array>({start(c){controller=c;request.signal.addEventListener('abort',close,{once:true});if(request.signal.aborted){close();return;}
    keep=setInterval(()=>{if(!closed)controller.enqueue(new TextEncoder().encode(': keepalive\n\n'));},15000);keep.unref();
    void(async()=>{try{const b=nativeRequest(body);frames=b.frames;app=await service.project(b.project);if(closed)return;unsubscribe=app.subscribe(publish);if(b.run)void app.start(b.run,frames,b.capture);else {try{await service.target.available();await app.refresh();}catch(e){app.state='unavailable';app.error=message(e);}}if(closed)return;publish();let checking=false;poll=setInterval(async()=>{if(checking)return;checking=true;try{await app!.refresh();}catch{}finally{checking=false;}},2000);poll.unref();}catch(e){error=message(e);publish();}})();
  },cancel:close});return new Response(stream,{headers:{'content-type':'text/event-stream','cache-control':'no-store'}});
}
export async function stopNativePreviews(){await service.stop();}
