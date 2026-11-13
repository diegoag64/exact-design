import {spawn} from 'node:child_process';
export type Runner=(args:string[],env?:Record<string,string>)=>Promise<string>;
export const command:Runner=(args,env={})=>new Promise((resolve,reject)=>{
  const child=spawn(args[0],args.slice(1),{env:{...process.env,...env}});let output='';
  child.stdout.on('data',b=>output+=b);child.stderr.on('data',b=>output+=b);
  child.on('error',reject);child.on('close',code=>code===0?resolve(output):reject(new Error(output.trim()||`${args[0]} exited ${code}`)));
});
export type Runtime={identifier:string;version:string;isAvailable:boolean;supportedDeviceTypes?:{identifier:string}[]};
export function selectRuntime(runtimes:Runtime[],type:string){return runtimes.filter(r=>r.isAvailable&&r.identifier.includes('.iOS-')&&r.supportedDeviceTypes?.some(d=>d.identifier===type)).sort((a,b)=>b.version.localeCompare(a.version,undefined,{numeric:true}))[0];}
// A macOS target would build `mac`, launch with EXACT_LAUNCH_URL and capture its window with screencapture -l <windowid>.
export interface NativeTarget {
  readonly buildArgs:string[]; available():Promise<void>; destination(name:string,type:string):Promise<string>; boot(id:string):Promise<boolean>;
  install(id:string,app:string):Promise<void>; launch(id:string,appId:string,url:string):Promise<void>;
  capture(id:string,path:string,appId:string):Promise<boolean>; stop():Promise<void>;
}
export class Simulators implements NativeTarget {
  readonly buildArgs=['ios','--no-install'];
  private owned=new Set<string>();private booted=new Set<string>();private version?:Promise<string>;
  constructor(readonly run:Runner=command,readonly platform=process.platform){}
  sim(...args:string[]){return this.run(['xcrun','simctl',...args]);}
  xcodeVersion(){return this.version??=this.run(['xcodebuild','-version']);}
  async available(){if(this.platform!=='darwin')throw new Error('Native iOS previews require macOS and Xcode.');try{await this.run(['xcrun','--find','simctl']);await this.xcodeVersion();}catch{this.version=undefined;throw new Error('Native iOS previews need Xcode with the iOS Simulator. Install Xcode, select it with xcode-select, then refresh.');}if(!(await this.runtimes()).some(r=>r.isAvailable&&r.identifier.includes('.iOS-')))throw new Error('No installed iOS Simulator runtime. Add one in Xcode › Settings › Components.');}
  async runtimes():Promise<Runtime[]>{return JSON.parse(await this.sim('list','runtimes','-j')).runtimes;}
  async destination(name:string,type:string){const runtime=selectRuntime(await this.runtimes(),type);if(!runtime)throw new Error(`No installed iOS Simulator runtime supports ${name}. Add one in Xcode › Settings › Components.`);
    const full=`Exact Design ${name}`,devices=JSON.parse(await this.sim('list','devices','-j')).devices;
    const existing=devices[runtime.identifier]?.find((d:any)=>d.isAvailable&&d.name===full&&d.deviceTypeIdentifier===type);
    const id=existing?.udid??(await this.sim('create',full,type,runtime.identifier)).trim();this.owned.add(id);return id;
  }
  async boot(id:string){if(!this.owned.has(id))throw new Error('Refusing to boot an unmanaged simulator.');let fresh=true;try{await this.sim('boot',id);this.booted.add(id);}catch(e){if(!String(e).includes('current state: Booted'))throw e;fresh=false;}
    await this.sim('bootstatus',id,'-b');await this.sim('status_bar',id,'override','--time','9:41','--batteryState','charged','--batteryLevel','100','--cellularBars','4','--wifiBars','3');await this.sim('ui',id,'appearance','light');return fresh;}
  async install(id:string,app:string){await this.sim('install',id,app);}
  async launch(id:string,appId:string,url:string){await this.run(['xcrun','simctl','launch','--terminate-running-process',id,appId],{SIMCTL_CHILD_EXACT_LAUNCH_URL:url});}
  async capture(id:string,path:string,appId:string){await this.sim('io',id,'screenshot','--type=png',path);return (await this.sim('spawn',id,'launchctl','list')).includes(`UIKitApplication:${appId}`);}
  async stop(){await Promise.all([...this.booted].map(id=>this.sim('shutdown',id).catch(()=>{})));this.booted.clear();}
}
