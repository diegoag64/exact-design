/** Expo Simulators: runs the app's latest saved source on a hosted iOS Simulator. The helper builds the app with the same
 *  build as native previews, uploads it to a session it starts with EAS CLI, and opens the selected screen's deep link.
 *  Each app keeps its own Expo access token, in the helper's cache outside the repository. One session runs per app;
 *  testing again reuses it, uploading only a changed build. https://docs.expo.dev/eas/simulators/ */
import {spawn} from 'node:child_process';
import {existsSync} from 'node:fs';
import {chmod,mkdir,readFile,rm,writeFile,rename} from 'node:fs/promises';
import {basename,dirname,join} from 'node:path';
import {nativeDevice} from '../studio/devices';
import {screenRoute} from '../studio/project';
import {linkScheme,nativePreviews,type AppPreviews,type NativePreviews,type StepState} from './native-previews';

/** Pinned EAS CLI, run with `bun x`; EXACT_DESIGN_EAS_CLI overrides it. */
export const EAS_CLI=process.env.EXACT_DESIGN_EAS_CLI||'eas-cli@27.6.0';
/** A session stops itself after this long without use, and after the hour in all, so a forgotten one stops costing. */
export const IDLE_MINUTES=15,MAX_MINUTES=60;
export type Eas=(args:string[],options:{cwd:string;token:string})=>Promise<string>;
const NOISE=/eas-cli@|npm install|outdated version|version control|git rev-parse|Falling back|EAS_PROJECT_ROOT|^\s*$|^\s*[-✔⏳🚀]/;
/** The failing line of an EAS CLI run, without update notices and progress lines. */
export function easError(output:string,token=''){
  const lines=output.split('\n').map(l=>l.replace(/\u001b\[[0-9;]*m/g,'').trim()).filter(l=>!NOISE.test(l));
  const line=lines.find(l=>/could not|not supported|not authorized|unauthori[sz]ed|forbidden|invalid|denied|not found|limit|quota|access/i.test(l))??lines.find(l=>/^✖|error/i.test(l))??lines.at(-1)??'Expo Simulators failed.';
  return (token?line.split(token).join('…'):line).replace(/^✖\s*/,'').replace(/^Error:\s*/,'').slice(0,400);
}
export const eas:Eas=(args,{cwd,token})=>new Promise((resolve,reject)=>{
  const child=spawn(process.execPath,['x',EAS_CLI,...args],{cwd,env:{...process.env,EXPO_TOKEN:token,EAS_NO_VCS:'1',EAS_PROJECT_ROOT:cwd,EXPO_NO_TELEMETRY:'1',CI:'1'}});
  let out='',err='';child.stdout.on('data',b=>{out+=b;});child.stderr.on('data',b=>{err+=b;});
  child.on('error',reject);child.on('close',code=>code===0?resolve(out):reject(new Error(easError(`${err}\n${out}`,token))));
});
/** The JSON object an EAS CLI `--json` run printed. */
export function easJson(output:string):any{const start=output.indexOf('{');if(start<0)throw new Error('Expo did not answer with session details.');return JSON.parse(output.slice(start));}
const slug=(name:string)=>name.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')||'app';
const message=(e:unknown)=>e instanceof Error?e.message:String(e);

type StepId='build'|'session'|'upload'|'open';
export type ExpoStep={id:StepId;label:string;state:StepState;detail:string};
type Session={id:string;device:string;url:string;signature:string};
type Saved={account:string;projectId:string;slug:string};
export type ExpoSnapshot={configured:boolean;account:string;state:string;message:string;error:string;steps:ExpoStep[];elapsed:number;estimate:number;running:boolean;device:string;url:string;stale:boolean};

export class AppSession {
  state='idle';message='';error='';steps:ExpoStep[]=[];estimate=0;saved?:Saved;session?:Session;
  private stepAt=0;private ticker?:ReturnType<typeof setInterval>;private tokens=new Set<string>();private tail=Promise.resolve();private listeners=new Set<()=>void>();
  readonly dir:string;readonly link:string;
  constructor(readonly app:AppPreviews,readonly service:NativePreviews,readonly run:Eas){this.dir=join(app.dir,'expo');this.link=join(this.dir,'project');}
  static async open(app:AppPreviews,service:NativePreviews,run:Eas){const s=new AppSession(app,service,run);try{s.saved=JSON.parse(await readFile(join(s.dir,'account.json'),'utf8'));if(!existsSync(join(s.dir,'token')))s.saved=undefined;}catch{}return s;}
  subscribe(fn:()=>void){this.listeners.add(fn);const off=this.app.subscribe(fn);return ()=>{this.listeners.delete(fn);off();};}
  private publish(){for(const fn of this.listeners)fn();}
  private token(){return readFile(join(this.dir,'token'),'utf8').then(t=>t.trim(),()=>'');}
  snapshot():ExpoSnapshot{
    const s=this.session;
    return {configured:!!this.saved,account:this.saved?.account??'',state:this.state,message:this.message,error:this.error,steps:this.steps,
      elapsed:this.state==='working'&&this.steps.some(x=>x.state==='active')?Math.max(0,Math.floor((this.service.now()-this.stepAt)/1000)):0,estimate:this.estimate,
      running:!!s,device:s?.device??'',url:s?.url??'',stale:!!s&&!!this.app.signature&&s.signature!==this.app.signature};
  }
  private step(id:StepId,state:StepState,detail:string){
    const index=this.steps.findIndex(s=>s.id===id);if(index<0)return;
    if(state==='active'){this.steps.forEach((s,i)=>{if(i!==index&&s.state==='active')s.state=i<index?'done':'pending';});if(this.steps[index]!.state!=='active')this.stepAt=this.service.now();}
    this.steps[index]={...this.steps[index]!,state,detail};this.publish();
  }
  /** Saves a token for this app after Expo accepts it, and creates or links the app's Expo project. An empty token removes
   *  the setup and stops the running session. */
  setup(token:string):Promise<{ok:boolean;error:string;account:string}>{
    const job=this.tail.then(async()=>{
      token=token.trim();
      if(!token){await this.stopSession();await rm(join(this.dir,'token'),{force:true});await rm(join(this.dir,'account.json'),{force:true});this.saved=undefined;this.state='idle';this.message='';this.error='';this.publish();return {ok:true,error:'',account:''};}
      if(token.length>200||/\s/.test(token))return {ok:false,error:'That doesn’t look like an Expo access token.',account:''};
      try{
        await mkdir(this.link,{recursive:true,mode:0o700});await chmod(this.dir,0o700);
        let who='';try{who=await this.run(['whoami'],{cwd:this.link,token});}catch{return {ok:false,error:'Expo didn’t accept that token. Copy a new one from expo.dev → Account settings → Access tokens.',account:''};}
        const account=/^\s*([A-Za-z0-9_.-]+)/m.exec(who.split('\n').find(l=>!NOISE.test(l))??'')?.[1]??'';if(!account)return {ok:false,error:'Expo didn’t say which account that token belongs to.',account:''};
        // A project per app, owned by the token's account; init links an existing one with the same slug.
        const app=JSON.parse(await readFile(join(this.app.appDir,'app.json'),'utf8')),name=String(app.name||'App'),projectSlug=`exact-design-${slug(name)}`;
        await writeFile(join(this.link,'package.json'),JSON.stringify({name:projectSlug,private:true})+'\n');
        await writeFile(join(this.link,'app.json'),JSON.stringify({expo:{name,slug:projectSlug}},null,2)+'\n');
        const init=easJson(await this.run(['init','--non-interactive','--force','--json'],{cwd:this.link,token}));
        if(typeof init.projectId!=='string')throw new Error('Expo did not create a project for this app.');
        if(this.saved?.account!==account)await this.stopSession();
        await writeFile(join(this.dir,'token.tmp'),token,{mode:0o600});await rename(join(this.dir,'token.tmp'),join(this.dir,'token'));
        this.saved={account:String(init.owner||account),projectId:init.projectId,slug:projectSlug};await writeFile(join(this.dir,'account.json'),JSON.stringify(this.saved));
        this.state='idle';this.message='';this.error='';this.publish();return {ok:true,error:'',account:this.saved.account};
      }catch(e){return {ok:false,error:message(e),account:''};}
    });
    this.tail=job.then(()=>{},()=>{});return job;
  }
  /** Starts one job per new token: test the screen at `route` on `device`, or stop the session. */
  start(token:string,action:'test'|'stop',device:string,route:string){
    if(!token||this.tokens.has(token)||this.service.stopping)return this.tail;this.tokens.add(token);
    if(action==='test'){this.state='working';this.message='Waiting…';this.error='';this.publish();}
    this.tail=this.tail.then(()=>action==='stop'?this.stopSession().then(()=>{this.state='idle';this.message='Cloud iPhone stopped.';this.error='';this.publish();},e=>{this.state='error';this.error=this.message=message(e);this.publish();}):this.test(device,route));
    return this.tail;
  }
  async stopSession(){
    const s=this.session;if(!s)return;this.session=undefined;this.publish();
    const token=await this.token();if(token)await this.run(['simulator:stop','--id',s.id],{cwd:this.link,token});
  }
  private async alive(s:Session,token:string){try{const d=easJson(await this.run(['simulator:get','--id',s.id,'--json','--non-interactive'],{cwd:this.link,token}));return /^in[-_ ]?progress$/i.test(String(d.status));}catch{return false;}}
  private async test(device:string,route:string){
    const remote=nativeDevice(device)?.remote,name=nativeDevice(device)?.name.replace(/^Native /,'')??'iPhone';
    this.state='working';this.error='';this.message='Getting your cloud iPhone ready…';this.estimate=0;
    this.steps=[{id:'build',label:'Build your latest code',state:'pending',detail:''},{id:'session',label:`Start a cloud ${name}`,state:'pending',detail:''},{id:'upload',label:'Upload the app',state:'pending',detail:''},{id:'open',label:'Open this screen',state:'pending',detail:''}];
    this.stepAt=this.service.now();clearInterval(this.ticker);this.ticker=setInterval(()=>this.publish(),1000);this.ticker.unref?.();this.publish();
    try{
      const token=await this.token();if(!token||!this.saved)throw new Error('Set up Expo Simulators for this project first.');
      if(!remote)throw new Error('Choose an iPhone or iPad for the cloud simulator.');
      const app=JSON.parse(await readFile(join(this.app.appDir,'app.json'),'utf8'));const scheme=linkScheme(app),appId=app.app?.id;
      if(!appId)throw new Error('Set app.id in app.json.');
      // The build is shared with native previews, so it waits for any capture job and never runs twice at once.
      let bundle='',signature='';
      await this.service.enqueue(async()=>{await this.service.target.available();signature=await this.app.refresh();
        bundle=await this.app.build(app,signature,{message:text=>{this.message=text;this.publish();},step:(state,detail)=>this.step('build',state,detail),estimate:s=>{this.estimate=s;}});});
      this.service.checkRunning();if(!bundle)throw new Error('Expo Simulators are stopping.');
      // One session per app: reuse it on the same device while Expo still runs it.
      if(this.session&&(this.session.device!==device||!(await this.alive(this.session,token)))){const old=this.session;this.session=undefined;if(old.device!==device)await this.run(['simulator:stop','--id',old.id],{cwd:this.link,token}).catch(()=>{});}
      if(!this.session){
        this.step('session','active','Usually about 30 s');this.message=`Starting a cloud ${name}…`;
        const started=easJson(await this.run(['simulator:start','--platform','ios','--type','agent-device','--device',remote,'--name',`${app.name} from Exact Design`,'--max-duration-minutes',String(MAX_MINUTES),'--max-idle-time-minutes',String(IDLE_MINUTES),'--json','--non-interactive'],{cwd:this.link,token}));
        const url=started.remoteConfig?.webPreviewUrl||(started.deviceRunSessionUrl?`${started.deviceRunSessionUrl}/preview`:'');
        if(typeof started.id!=='string'||!url.startsWith('https://'))throw new Error('Expo did not return the session’s page.');
        this.session={id:started.id,device,url,signature:''};this.step('session','done','Started');
      }else this.step('session','skipped','Already running');
      const s=this.session;
      if(s.signature!==signature){
        this.step('upload','active','Packing the app…');this.message='Uploading your app…';
        const archive=join(this.dir,'app.tar.gz');
        await new Promise<void>((resolve,reject)=>{const tar=spawn('tar',['-czf',archive+'.tmp','-C',dirname(bundle),basename(bundle)]);tar.on('error',reject);tar.on('close',code=>code===0?resolve():reject(new Error('Could not pack the app for upload.')));});
        await rename(archive+'.tmp',archive);this.step('upload','active','Installing on the cloud simulator…');
        await this.run(['simulator:control','app.install',archive,'--id',s.id],{cwd:this.link,token});
        if(scheme)await this.run(['simulator:control','app.approveUrlScheme',appId,scheme,'--id',s.id],{cwd:this.link,token});
        s.signature=signature;this.step('upload','done','Installed');
      }else this.step('upload','skipped','Up to date');
      this.step('open','active',route||'First screen');this.message='Opening the screen…';
      if(scheme&&route){
        // As native captures do: the root link dismisses a sheet, then the route opens.
        await this.run(['simulator:control','app.openUrl',appId,`${scheme}://`,'--id',s.id],{cwd:this.link,token});
        if(route!=='/')await this.run(['simulator:control','app.openUrl',appId,`${scheme}://${route.slice(1)}`,'--id',s.id],{cwd:this.link,token});
      }else await this.run(['simulator:control','app.launch',appId,'--id',s.id],{cwd:this.link,token});
      this.step('open','done',route||'First screen');this.state='idle';this.message=`Ready on a cloud ${name}.`;
    }catch(e){for(const s of this.steps)if(s.state==='active')s.state='failed';this.state='error';this.error=this.message=message(e);}
    finally{clearInterval(this.ticker);this.ticker=undefined;this.steps=[];this.estimate=0;this.publish();}
  }
}

export class ExpoSessions {
  private apps=new Map<string,Promise<AppSession>>();
  constructor(readonly service:NativePreviews=nativePreviews,readonly run:Eas=eas){}
  async project(project:string){const app=await this.service.project(project);let s=this.apps.get(app.dir);if(!s){s=AppSession.open(app,this.service,this.run);this.apps.set(app.dir,s);}return s;}
  /** Stops every running session, so none keeps costing after the studio closes. */
  async stop(){await Promise.all([...this.apps.values()].map(p=>p.then(s=>s.stopSession()).catch(()=>{})));}
}
const sessions=new ExpoSessions();

/** Validates a `/expo` request body. */
export function expoRequest(body:unknown){
  const b=body as any;if(!b||typeof b.project!=='string'||typeof b.run!=='string'||b.run.length>200||typeof b.device!=='string'||!nativeDevice(b.device)||typeof b.route!=='string'||(b.route&&screenRoute(b.route)!==b.route)||!['test','stop',''].includes(b.action??''))throw new Error('Invalid Expo Simulators request.');
  return {project:b.project as string,run:b.run as string,device:b.device as string,route:b.route as string,action:(b.action||'test') as 'test'|'stop'};
}
const failed=(error:string):ExpoSnapshot=>({configured:false,account:'',state:'unavailable',message:error,error,steps:[],elapsed:0,estimate:0,running:false,device:'',url:'',stale:false});
/** `POST /expo`: a stream of snapshots for the project's session; a new `run` token starts its action. */
export function expoStream(body:unknown,request:Request,service=sessions):Response{
  let closed=false,last='',unsubscribe=()=>{},keep:ReturnType<typeof setInterval>|undefined,controller:ReadableStreamDefaultController<Uint8Array>;
  const send=(s:ExpoSnapshot)=>{if(closed)return;const text=JSON.stringify(s);if(text!==last){last=text;controller.enqueue(new TextEncoder().encode(`data: ${text}\n\n`));}};
  const close=()=>{if(closed)return;closed=true;clearInterval(keep);unsubscribe();try{controller.close();}catch{}};
  const stream=new ReadableStream<Uint8Array>({start(c){controller=c;request.signal.addEventListener('abort',close,{once:true});if(request.signal.aborted){close();return;}
    keep=setInterval(()=>{if(!closed)controller.enqueue(new TextEncoder().encode(': keepalive\n\n'));},15000);keep.unref?.();
    void(async()=>{try{const b=expoRequest(body);const s=await service.project(b.project);if(closed)return;unsubscribe=s.subscribe(()=>send(s.snapshot()));if(b.run)void s.start(b.run,b.action,b.device,b.route);send(s.snapshot());}catch(e){send(failed(message(e)));}})();
  },cancel:close});
  return new Response(stream,{headers:{'content-type':'text/event-stream','cache-control':'no-store'}});
}
/** `POST /expo/setup`: saves, or with an empty token removes, the project's Expo access token. */
export async function expoSetup(body:unknown,service=sessions){
  const b=body as any;if(!b||typeof b.project!=='string'||typeof b.token!=='string')return {ok:false,error:'Invalid Expo Simulators setup.',account:''};
  try{return await (await service.project(b.project)).setup(b.token);}catch(e){return {ok:false,error:message(e),account:''};}
}
export async function stopExpoSessions(){await sessions.stop();}
