import {spawn} from 'node:child_process';
/** Runs a command and resolves with its output. `onOutput` receives the output as it arrives, for progress. */
export type Runner=(args:string[],env?:Record<string,string>,onOutput?:(text:string)=>void)=>Promise<string>;
export const command:Runner=(args,env={},onOutput)=>new Promise((resolve,reject)=>{
  const child=spawn(args[0],args.slice(1),{env:{...process.env,...env}});let output='';
  const take=(b:Buffer)=>{const text=String(b);output+=text;onOutput?.(text);};
  child.stdout.on('data',take);child.stderr.on('data',take);
  child.on('error',reject);child.on('close',code=>code===0?resolve(output):reject(new Error(output.trim()||`${args[0]} exited ${code}`)));
});
export type Runtime={identifier:string;version:string;isAvailable:boolean;supportedDeviceTypes?:{identifier:string}[]};
export type Appearance='light'|'dark';
export function selectRuntime(runtimes:Runtime[],type:string){return runtimes.filter(r=>r.isAvailable&&r.identifier.includes('.iOS-')&&r.supportedDeviceTypes?.some(d=>d.identifier===type)).sort((a,b)=>b.version.localeCompare(a.version,undefined,{numeric:true}))[0];}
export const SCHEME=/^[A-Za-z][A-Za-z0-9+.-]*$/;
export const BUNDLE_ID=/^[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$/;
/** Bytes of memory macOS can hand out now, from `vm_stat`: free, inactive and speculative pages. Undefined when unreadable. */
export function availableMemory(vmStat:string):number|undefined{
  const page=Number(/page size of (\d+) bytes/.exec(vmStat)?.[1]);const pages=(name:string)=>Number(new RegExp(`Pages ${name}:\\s+(\\d+)`).exec(vmStat)?.[1]);
  const total=pages('free')+pages('inactive')+pages('speculative');return page>0&&Number.isFinite(total)?total*page:undefined;
}
/** Memory a simulator needs to boot alongside the others. */
export const BOOT_MEMORY=2*1024**3;
/** How many devices to drive at once: every one up to `cap`, but each that is not booted yet needs BOOT_MEMORY of the
 *  available memory (when it is known). Booted devices are already paid for. Always at least one. */
export function deviceParallelism(o:{devices:number;cold:number;cap:number;available?:number}){
  const warm=o.devices-o.cold,cold=o.available===undefined?o.cold:Math.min(o.cold,Math.floor(o.available/BOOT_MEMORY));
  return Math.max(1,Math.min(o.cap,o.devices,warm+cold));
}
// A macOS target would build `mac`, launch with EXACT_LAUNCH_URL and capture its window with screencapture -l <windowid>.
export interface NativeTarget {
  readonly buildArgs:string[]; available():Promise<void>;
  /** Lists the devices once for a job: `destination` and `booted` read this listing. */
  scan():Promise<void>;
  destination(name:string,type:string):Promise<string>;
  /** Whether the device was booted at the last scan. */
  booted(id:string):Promise<boolean>;
  /** Boots when needed and sets the status bar; true when this call booted it. */
  boot(id:string):Promise<boolean>;
  install(id:string,app:string):Promise<void>;
  /** Lets the app open its own links without the "Open in …?" prompt. */
  approve(id:string,scheme:string,appId:string):Promise<void>;
  /** Sets Reduce Motion; true when the value changed, so a running app must relaunch to read it. */
  reduceMotion(id:string,on:boolean):Promise<boolean>;
  appearance(id:string):Promise<Appearance>; setAppearance(id:string,appearance:Appearance):Promise<void>;
  running(id:string,appId:string):Promise<boolean>;
  /** Launches the app, or brings it to the front when running; never terminates it. */
  launch(id:string,appId:string):Promise<void>; terminate(id:string,appId:string):Promise<void>;
  open(id:string,url:string):Promise<void>;
  screenshot(id:string,path:string,type?:'png'|'bmp'):Promise<void>; stop():Promise<void>;
}
type Listed={udid:string;name:string;deviceTypeIdentifier:string;isAvailable:boolean;state:string;runtime:string};
export class Simulators implements NativeTarget {
  readonly buildArgs=['ios','--no-install'];
  private owned=new Set<string>();private started=new Set<string>();private version?:Promise<string>;private simctl?:Promise<string>;
  private runtimeList?:Runtime[];private listing?:Map<string,Listed>;private destinations=new Map<string,string>();private ready=false;
  constructor(readonly run:Runner=command,readonly platform=process.platform){}
  /** simctl itself, found once with `xcrun --find`: each `xcrun simctl` call costs an extra process, which a loaded Mac
   *  makes slow. */
  private simctlPath(){return this.simctl??=this.run(['xcrun','--find','simctl']).then(p=>p.trim().split('\n').at(-1)!.trim()).catch(e=>{this.simctl=undefined;throw e;});}
  async sim(...args:string[]){return this.run([await this.simctlPath(),...args]);}
  /** Every command that changes a simulator goes through here: only `Exact Design …` devices this helper resolved. */
  private managed(id:string){if(!this.owned.has(id))throw new Error('Refusing to use an unmanaged simulator.');return id;}
  xcodeVersion(){return this.version??=this.run(['xcodebuild','-version']).catch(e=>{this.version=undefined;throw e;});}
  /** Checks Xcode, simctl and an iOS runtime; once they are found the answer holds for the helper's lifetime. */
  async available(){if(this.platform!=='darwin')throw new Error('Native iOS previews require macOS and Xcode.');if(this.ready)return;
    try{await this.simctlPath();await this.xcodeVersion();}catch{this.version=undefined;throw new Error('Native iOS previews need Xcode with the iOS Simulator. Install Xcode, select it with xcode-select, then refresh.');}
    const runtimes=await this.runtimes();if(!runtimes.some(r=>r.isAvailable&&r.identifier.includes('.iOS-')))throw new Error('No installed iOS Simulator runtime. Add one in Xcode › Settings › Components.');this.runtimeList=runtimes;this.ready=true;}
  async runtimes():Promise<Runtime[]>{return JSON.parse(await this.sim('list','runtimes','-j')).runtimes;}
  async scan(){const devices=JSON.parse(await this.sim('list','devices','-j')).devices??{};const listing=new Map<string,Listed>();
    for(const [runtime,list] of Object.entries(devices))for(const d of list as any[])if(typeof d?.udid==='string')listing.set(d.udid,{...d,runtime});this.listing=listing;}
  async destination(name:string,type:string){
    const key=`${name}\0${type}`,cached=this.destinations.get(key);if(!this.listing)await this.scan();
    if(cached&&this.listing!.get(cached)?.isAvailable){this.owned.add(cached);return cached;}
    const runtime=selectRuntime(this.runtimeList??=await this.runtimes(),type);if(!runtime)throw new Error(`No installed iOS Simulator runtime supports ${name}. Add one in Xcode › Settings › Components.`);
    const full=`Exact Design ${name}`,existing=[...this.listing!.values()].find(d=>d.runtime===runtime.identifier&&d.isAvailable&&d.name===full&&d.deviceTypeIdentifier===type);
    let id=existing?.udid;
    if(!id){id=(await this.sim('create',full,type,runtime.identifier)).trim();this.listing!.set(id,{udid:id,name:full,deviceTypeIdentifier:type,isAvailable:true,state:'Shutdown',runtime:runtime.identifier});}
    this.owned.add(id);this.destinations.set(key,id);return id;
  }
  async booted(id:string){if(!this.listing)await this.scan();return this.listing!.get(id)?.state==='Booted';}
  async boot(id:string){this.managed(id);let fresh=true;try{await this.sim('boot',id);this.started.add(id);}catch(e){if(!String(e).includes('current state: Booted'))throw e;fresh=false;}
    await this.sim('bootstatus',id,'-b');await this.sim('status_bar',id,'override','--time','9:41','--batteryState','charged','--batteryLevel','100','--cellularBars','4','--wifiBars','3');
    const listed=this.listing?.get(id);if(listed)listed.state='Booted';return fresh;}
  async install(id:string,app:string){await this.sim('install',this.managed(id),app);}
  async approve(id:string,scheme:string,appId:string){
    if(!SCHEME.test(scheme))throw new Error(`${scheme} is not a URL scheme.`);if(!BUNDLE_ID.test(appId))throw new Error(`${appId} is not a bundle identifier.`);
    await this.sim('spawn',this.managed(id),'defaults','write','com.apple.launchservices.schemeapproval',`com.apple.CoreSimulator.CoreSimulatorBridge-->${scheme}`,'-string',appId);
  }
  async reduceMotion(id:string,on:boolean){this.managed(id);let current=false;try{current=(await this.sim('spawn',id,'defaults','read','com.apple.Accessibility','ReduceMotionEnabled')).trim()==='1';}catch{}
    if(current===on)return false;await this.sim('spawn',id,'defaults','write','com.apple.Accessibility','ReduceMotionEnabled','-bool',on?'true':'false');return true;}
  async appearance(id:string):Promise<Appearance>{return (await this.sim('ui',this.managed(id),'appearance')).trim()==='dark'?'dark':'light';}
  async setAppearance(id:string,appearance:Appearance){await this.sim('ui',this.managed(id),'appearance',appearance);}
  async running(id:string,appId:string){const escaped=appId.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');return new RegExp(`UIKitApplication:${escaped}(\\[|\\s|$)`).test(await this.sim('spawn',this.managed(id),'launchctl','list'));}
  async launch(id:string,appId:string){await this.sim('launch',this.managed(id),appId);}
  async terminate(id:string,appId:string){await this.sim('terminate',this.managed(id),appId).catch(()=>{});}
  async open(id:string,url:string){await this.sim('openurl',this.managed(id),url);}
  async screenshot(id:string,path:string,type:'png'|'bmp'='png'){await this.sim('io',this.managed(id),'screenshot',`--type=${type}`,path);}
  /** Shuts down only the simulators this helper booted. */
  async stop(){await Promise.all([...this.started].map(id=>this.sim('shutdown',id).catch(()=>{})));this.started.clear();}
}
