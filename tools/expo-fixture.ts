/** Deterministic Expo Simulators fixture for the test launchers: never runs EAS CLI or starts a session. The token
 *  `expo_fixture_token` is accepted for the account `fixture-team`; a route naming `fail` fails to open. */
import {nativeDevice} from '../studio/devices';
type Project={account:string;running:boolean;device:string;built:boolean};
const projects=new Map<string,Project>(),runs=new Set<string>();
const project=(url:string)=>{let p=projects.get(url);if(!p){p={account:'',running:false,device:'',built:false};projects.set(url,p);}return p;};
const TOKEN='expo_fixture_token';
export async function expoSetup(body:any){
  if(body?.mode==='reset'){projects.clear();runs.clear();return {ok:true,error:'',account:''};}
  if(typeof body?.project!=='string'||typeof body?.token!=='string')return {ok:false,error:'Invalid Expo Simulators setup.',account:''};
  const p=project(body.project),token=body.token.trim();
  if(!token){p.account='';p.running=false;return {ok:true,error:'',account:''};}
  if(token!==TOKEN)return {ok:false,error:'Expo didn’t accept that token. Copy a new one from expo.dev → Account settings → Access tokens.',account:''};
  p.account='fixture-team';return {ok:true,error:'',account:p.account};
}
export function expoStream(body:any,request:Request):Response{
  if(body?.mode==='reset'){projects.clear();runs.clear();return Response.json({ok:true});}
  const p=project(String(body?.project??'')),device=String(body?.device??''),route=String(body?.route??''),action=body?.action==='stop'?'stop':'test';
  const name=nativeDevice(device)?.name.replace(/^Native /,'')??'iPhone';
  const run=JSON.stringify([body?.project,body?.run]),fresh=typeof body?.run==='string'&&!!body.run&&!runs.has(run);if(fresh)runs.add(run);
  let closed=false,timer:ReturnType<typeof setTimeout>|undefined;
  const stream=new ReadableStream<Uint8Array>({start(controller){
    let state='idle',message='',error='';const steps=[{id:'build',label:'Build your latest code',state:'pending',detail:''},{id:'session',label:`Start a cloud ${name}`,state:'pending',detail:''},{id:'upload',label:'Upload the app',state:'pending',detail:''},{id:'open',label:'Open this screen',state:'pending',detail:''}];
    const url=`https://expo.dev/accounts/${p.account}/projects/exact-design-notebook/simulator-sessions/fixture-session/preview`;
    const emit=()=>{if(!closed)controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({configured:!!p.account,account:p.account,state,message,error,steps:state==='working'?steps:[],elapsed:state==='working'?1:0,estimate:0,running:p.running,device:p.running?p.device:'',url:p.running?url:'',stale:false})}\n\n`));};
    request.signal.addEventListener('abort',()=>{closed=true;clearTimeout(timer);try{controller.close();}catch{}},{once:true});
    if(!fresh){emit();return;}
    if(action==='stop'){p.running=false;message='Cloud iPhone stopped.';emit();return;}
    if(!p.account){state='error';error=message='Set up Expo Simulators for this project first.';emit();return;}
    state='working';message='Getting your cloud iPhone ready…';
    const reuse=p.running&&p.device===device;
    const plan:[number,string,string][]=[[0,'active','Compiling Swift…'],[0,p.built?'skipped':'done',p.built?'Up to date':'Built in 1 s'],[1,reuse?'skipped':'active',reuse?'Already running':'Usually about 30 s'],[1,reuse?'skipped':'done','Started'],[2,reuse?'skipped':'active',reuse?'Up to date':'Installing on the cloud simulator…'],[2,reuse?'skipped':'done',reuse?'Up to date':'Installed'],[3,'active',route||'First screen']];
    let i=0;
    const next=()=>{if(closed)return;
      if(i<plan.length){const [index,s,detail]=plan[i++]!;steps.forEach((x,j)=>{if(s==='active'&&j!==index&&x.state==='active')x.state='done';});steps[index]={...steps[index]!,state:s,detail};if(index===1&&s==='done'){p.running=true;p.device=device;}emit();timer=setTimeout(next,150);return;}
      p.built=true;
      if(route.includes('fail')){steps[3]={...steps[3]!,state:'failed'};state='error';error=message='The screen did not open in the fixture.';}
      else{state='idle';message=`Ready on a cloud ${name}.`;}
      emit();
    };
    next();
  },cancel(){closed=true;clearTimeout(timer);}});
  return new Response(stream,{headers:{'content-type':'text/event-stream','cache-control':'no-store'}});
}
