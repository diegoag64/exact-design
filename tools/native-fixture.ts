import {deflateSync} from 'node:zlib';
import {nativeDevice} from '../studio/devices';
type Frame={id:string;state:string;shot:string;width:number;height:number;capturedAt:number;error:string};
const cache=new Map<string,Frame>(),runs=new Set<string>(),built=new Set<string>();
const key=(project:string,f:{device:string;route:string;appearance?:string})=>JSON.stringify([project,f.device,f.route,f.appearance??'light']);
/** Deterministic SSE fixture: never invokes a native build or simulator. */
export function nativeScreens(body:any,request:Request):Response {
  if(body?.mode==='reset'){cache.clear();runs.clear();built.clear();return Response.json({ok:true});}
  if(!body||typeof body.project!=='string'||!Array.isArray(body.frames))return new Response('Invalid native request',{status:400});
  const frames:Frame[]=body.frames.map((f:any)=>({...cache.get(key(body.project,f))??{state:'empty',shot:'',width:0,height:0,capturedAt:0,error:''},id:f.id}));
  const run=JSON.stringify([body.project,body.run]),fresh=!!body.run&&!runs.has(run);
  if(fresh)runs.add(run);
  // `capture` lists frame ids to capture again even when current; empty captures every frame that is not `ready`.
  const ids=Array.isArray(body.capture)?body.capture.filter((id:unknown)=>typeof id==='string'):[];
  const jobs=fresh?frames.flatMap((frame,index)=>(ids.length?ids.includes(frame.id):frame.state!=='ready')?[{frame,input:body.frames[index]}]:[]):[];
  let timer:ReturnType<typeof setTimeout>|undefined,closed=false;
  const stream=new ReadableStream<Uint8Array>({start(controller){
    let done=0,phase='capture',progress=-1;
    // The first capture job for a project builds, with no fraction like a real build, then the build is done.
    const steps=[{id:'build',label:'Build app',state:'pending',detail:''},{id:'device',label:'Prepare simulator',state:'skipped',detail:'Already running'},{id:'capture',label:'Capture',state:'pending',detail:''}];
    const emit=(state:'working'|'idle',message:string)=>{if(!closed)controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({state,phase:state==='working'?phase:'',message,error:'',done,total:jobs.length,steps:state==='working'?steps:[],progress:state==='working'?progress:-1,elapsed:state==='working'?1:0,estimate:0,frames})}\n\n`));};
    const working=()=>{if(phase==='capture'){steps[2]={...steps[2]!,state:'active',detail:`${Math.min(done+1,jobs.length)} of ${jobs.length}`};progress=done/jobs.length;}emit('working',phase==='build'?'Building Native app for iOS…':`Capturing ${Math.min(done+1,jobs.length)} of ${jobs.length}…`);};
    const stop=()=>{closed=true;clearTimeout(timer);try{controller.close();}catch{}};
    request.signal.addEventListener('abort',stop,{once:true});
    if(!fresh){emit('idle','');return;}
    if(!jobs.length){emit('idle','Native previews are up to date.');return;}
    jobs.forEach(({frame})=>{frame.state='queued';});
    const project=String(body.project);
    if(!built.has(project)){phase='build';steps[0]={...steps[0]!,state:'active',detail:'Compiling Swift…'};}
    else steps[0]={...steps[0]!,state:'skipped',detail:'Up to date'};
    working();
    const next=()=>{
      if(closed)return;
      if(done===jobs.length){emit('idle','Native previews updated.');return;}
      const {frame,input}=jobs[done]!;frame.state='capturing';working();
      timer=setTimeout(()=>{
        const device=nativeDevice(input.device);
        // A route naming `fail` fails; one naming `stale` reports a screenshot older than the app's source.
        frame.state=input.device.includes('fail')||input.route.includes('fail')?'error':input.route.includes('stale')?'stale':'ready';
        frame.error=frame.state==='error'?'Fixture capture failed.':'';
        if(frame.state!=='error'){
          frame.width=device?.width??375;frame.height=device?.height??667;frame.capturedAt=1794540000000;
          frame.shot=`${new URL(request.url).origin}/native/shot/${frame.width}/${frame.height}.png`;
        }
        cache.set(key(body.project,input),{...frame});done++;working();next();
      },200);
    };
    if(phase==='build')timer=setTimeout(()=>{if(closed)return;built.add(project);phase='capture';steps[0]={...steps[0]!,state:'done',detail:'Built in 1 s'};working();timer=setTimeout(next,200);},400);
    else timer=setTimeout(next,200);
  },cancel(){closed=true;clearTimeout(timer);}});
  return new Response(stream,{headers:{'content-type':'text/event-stream','cache-control':'no-store'}});
}
const crc=(data:Buffer)=>{let c=0xffffffff;for(const b of data){c^=b;for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0);}return (c^0xffffffff)>>>0;};
const chunk=(name:string,data:Buffer)=>{const type=Buffer.from(name),size=Buffer.alloc(4),sum=Buffer.alloc(4);size.writeUInt32BE(data.length);sum.writeUInt32BE(crc(Buffer.concat([type,data])));return Buffer.concat([size,type,data,sum]);};
export function nativeShot(path:string):Response {
  const match=/^(\d+)\/(\d+)\.png$/.exec(path);if(!match)return new Response('Not found',{status:404});
  const width=Number(match[1]),height=Number(match[2]);if(width>2000||height>3000||!width||!height)return new Response('Invalid size',{status:400});
  const header=Buffer.alloc(13);header.writeUInt32BE(width);header.writeUInt32BE(height,4);header[8]=8;header[9]=2;
  const raw=Buffer.alloc((width*3+1)*height);for(let y=0;y<height;y++)for(let x=0;x<width;x++){const at=y*(width*3+1)+1+x*3;raw[at]=30+Math.round(x/width*100);raw[at+1]=80;raw[at+2]=140+Math.round(y/height*100);}
  return new Response(Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]),{headers:{'content-type':'image/png','access-control-allow-origin':'*'}});
}
