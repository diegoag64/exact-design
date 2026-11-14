/** Deterministic Expo Simulators fixture for the test launchers: never runs EAS CLI or starts a session. The token
 *  `expo_fixture_token` is accepted for the account `fixture-team`; a route naming `fail` fails to open. Jobs belong to
 *  the project, as in the real service, so one started from the open tab streams to the drawer. */
import {nativeDevice} from '../studio/devices';
import {expoOpenLink,expoOpenPage} from './expo-open-page';
type Step={id:string;label:string;state:string;detail:string};
type Project={account:string;running:boolean;device:string;built:boolean;state:string;message:string;error:string;steps:Step[];listeners:Set<()=>void>;timer?:ReturnType<typeof setTimeout>};
const projects=new Map<string,Project>(),runs=new Set<string>();
const project=(url:string)=>{let p=projects.get(url);if(!p){p={account:'',running:false,device:'',built:false,state:'idle',message:'',error:'',steps:[],listeners:new Set()};projects.set(url,p);}return p;};
const TOKEN='expo_fixture_token',KEY='fixture-key';
const publish=(p:Project)=>{for(const fn of p.listeners)fn();};
const snapshot=(p:Project)=>({idleMinutes:15,maxMinutes:60,configured:!!p.account,account:p.account,state:p.state,message:p.message,error:p.error,steps:p.state==='working'?p.steps:[],elapsed:p.state==='working'?1:0,estimate:0,running:p.running,device:p.running?p.device:'',url:p.running?`https://expo.dev/accounts/${p.account}/projects/exact-design-notebook/simulator-sessions/fixture-session/preview`:'',stale:false});
function test(p:Project,device:string,route:string){
  const name=nativeDevice(device)?.name.replace(/^Native /,'')??'iPhone';
  clearTimeout(p.timer);p.error='';
  if(!p.account){p.state='error';p.error=p.message='Set up Expo Simulators for this project first.';publish(p);return;}
  p.state='working';p.message='Getting your cloud iPhone ready…';
  p.steps=[{id:'build',label:'Build your latest code',state:'pending',detail:''},{id:'session',label:`Start a cloud ${name}`,state:'pending',detail:''},{id:'upload',label:'Upload the app',state:'pending',detail:''},{id:'open',label:'Open this screen',state:'pending',detail:''}];
  const reuse=p.running&&p.device===device;
  const plan:[number,string,string][]=[[0,'active','Compiling Swift…'],[0,p.built?'skipped':'done',p.built?'Up to date':'Built in 1 s'],[1,reuse?'skipped':'active',reuse?'Already running':'Usually about 30 s'],[1,reuse?'skipped':'done','Started'],[2,reuse?'skipped':'active',reuse?'Up to date':'Installing on the cloud simulator…'],[2,reuse?'skipped':'done',reuse?'Up to date':'Installed'],[3,'active',route||'First screen']];
  let i=0;
  const next=()=>{
    if(i<plan.length){const [index,s,detail]=plan[i++]!;p.steps.forEach((x,j)=>{if(s==='active'&&j!==index&&x.state==='active')x.state='done';});p.steps[index]={...p.steps[index]!,state:s,detail};if(index===1&&s==='done'){p.running=true;p.device=device;}publish(p);p.timer=setTimeout(next,150);return;}
    p.built=true;
    if(route.includes('fail')){p.state='error';p.error=p.message='The screen did not open in the fixture.';}else{p.state='idle';p.message=`Ready on a cloud ${name}.`;}
    publish(p);
  };
  next();
}
export async function expoSetup(body:any){
  if(body?.mode==='reset'){for(const p of projects.values())clearTimeout(p.timer);projects.clear();runs.clear();return {ok:true,error:'',account:''};}
  // Ends the session as if it was stopped on expo.dev, as the real service's watch reports it.
  if(body?.mode==='end'&&typeof body.project==='string'){const p=project(body.project);clearTimeout(p.timer);p.running=false;p.state='idle';p.error='';p.message='The cloud iPhone ended on expo.dev.';publish(p);return {ok:true,error:'',account:p.account};}
  if(typeof body?.project!=='string'||typeof body?.token!=='string')return {ok:false,error:'Invalid Expo Simulators setup.',account:''};
  const p=project(body.project),token=body.token.trim();
  if(!token){p.account='';p.running=false;p.state='idle';p.message='';publish(p);return {ok:true,error:'',account:''};}
  if(token!==TOKEN)return {ok:false,error:'Expo didn’t accept that token. Copy a new one from expo.dev → Account settings → Access tokens.',account:''};
  p.account='fixture-team';publish(p);return {ok:true,error:'',account:p.account};
}
export function expoStream(body:any,request:Request):Response{
  const url=String(body?.project??''),p=project(url),open=expoOpenLink(new URL(request.url).origin,url,KEY);
  const run=JSON.stringify([url,body?.run]),fresh=typeof body?.run==='string'&&!!body.run&&!runs.has(run);if(fresh)runs.add(run);
  let closed=false,last='';const listener=()=>emit();let controller:ReadableStreamDefaultController<Uint8Array>;
  const emit=()=>{if(closed)return;const text=JSON.stringify({...snapshot(p),open});if(text!==last){last=text;controller.enqueue(new TextEncoder().encode(`data: ${text}\n\n`));}};
  const close=()=>{closed=true;p.listeners.delete(listener);try{controller.close();}catch{}};
  const stream=new ReadableStream<Uint8Array>({start(c){controller=c;p.listeners.add(listener);request.signal.addEventListener('abort',close,{once:true});
    if(fresh&&body?.action==='stop'){clearTimeout(p.timer);p.running=false;p.state='idle';p.error='';p.message='Cloud iPhone stopped.';publish(p);}
    else if(fresh)test(p,String(body?.device??''),String(body?.route??''));
    emit();
  },cancel:close});
  return new Response(stream,{headers:{'content-type':'text/event-stream','cache-control':'no-store'}});
}
export async function expoOpen(url:URL):Promise<Response>{
  if(url.searchParams.get('key')!==KEY)return new Response('Open this from the studio.',{status:403});
  const target=url.searchParams.get('project')??'',device=url.searchParams.get('device')??'',route=url.searchParams.get('route')??'';
  if(!nativeDevice(device))return new Response('Invalid Expo Simulators request.',{status:400});
  test(project(target),device,route);
  return expoOpenPage(`/expo/status?project=${encodeURIComponent(target)}&key=${KEY}`,`${route||'Your app'} on a cloud ${nativeDevice(device)!.name.replace(/^Native /,'')}`);
}
export async function expoStatus(url:URL):Promise<Response>{
  if(url.searchParams.get('key')!==KEY)return new Response(null,{status:403});
  return Response.json(snapshot(project(url.searchParams.get('project')??'')));
}
