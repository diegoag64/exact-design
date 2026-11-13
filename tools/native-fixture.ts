import {deflateSync} from 'node:zlib';
import {nativeDevice} from '../studio/devices';
type Frame={id:string;state:string;shot:string;width:number;height:number;capturedAt:number;error:string};
const cache=new Map<string,Frame>(),runs=new Set<string>();
const key=(project:string,f:{device:string;route:string})=>JSON.stringify([project,f.device,f.route]);
/** Deterministic SSE fixture: never invokes a native build or simulator. */
export function nativeScreens(body:any,request:Request):Response {
  if(body?.mode==='reset'){cache.clear();runs.clear();return Response.json({ok:true});}
  if(!body||typeof body.project!=='string'||!Array.isArray(body.frames))return new Response('Invalid native request',{status:400});
  const frames:Frame[]=body.frames.map((f:any)=>({...cache.get(key(body.project,f))??{state:'empty',shot:'',width:0,height:0,capturedAt:0,error:''},id:f.id}));
  const run=JSON.stringify([body.project,body.run]),capture=!!body.run&&!runs.has(run);
  if(capture)runs.add(run);
  let timer:ReturnType<typeof setTimeout>|undefined,closed=false;
  const stream=new ReadableStream<Uint8Array>({start(controller){
    let done=0;
    const emit=(working:boolean)=>{if(!closed)controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({state:working?'working':'idle',phase:working?'capture':'',message:working?`Capturing ${Math.min(done+1,frames.length)} of ${frames.length}…`:'',error:'',done,total:frames.length,frames})}\n\n`));};
    const stop=()=>{closed=true;clearTimeout(timer);try{controller.close();}catch{}};
    request.signal.addEventListener('abort',stop,{once:true});
    if(!capture){emit(false);return;}
    frames.forEach(f=>{f.state='queued';});emit(true);
    let index=0;
    const next=()=>{
      if(closed)return;
      if(index===frames.length){emit(false);return;}
      const frame=frames[index],input=body.frames[index];frame.state='capturing';emit(true);
      timer=setTimeout(()=>{
        const device=nativeDevice(input.device);
        // A route naming `fail` fails; one naming `stale` reports a screenshot older than the app's source.
        frame.state=input.device.includes('fail')||input.route.includes('fail')?'error':input.route.includes('stale')?'stale':'ready';
        frame.error=frame.state==='error'?'Fixture capture failed.':'';
        if(frame.state!=='error'){
          frame.width=device?.width??375;frame.height=device?.height??667;frame.capturedAt=1794540000000;
          frame.shot=`${new URL(request.url).origin}/native/shot/${frame.width}/${frame.height}.png`;
        }
        cache.set(key(body.project,input),{...frame});done++;index++;emit(true);next();
      },200);
    };
    timer=setTimeout(next,200);
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
