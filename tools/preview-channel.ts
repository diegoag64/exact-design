import {emptySpacing,type SpacingBox} from '../studio/spacing';

/** Preview feedback is independent of source inspection and code compilation. */
export class PreviewChannel {
  private cleanups=new Set<()=>void>();
  revision=0;
  updateRevision=0;
  measurement=emptySpacing();
  listeners=new Set<ReadableStreamDefaultController<Uint8Array>>();
  snapshot(){return {revision:this.revision,updateRevision:this.updateRevision,measurement:this.measurement};}
  publish(update=false,measurement?:{frame:string;id:string;plan:string;boxes:SpacingBox[]}){
    if(measurement)this.measurement=measurement;
    if(update)this.updateRevision++;
    this.revision++;
    const bytes=this.event();
    for(const listener of this.listeners)try{listener.enqueue(bytes);}catch{this.listeners.delete(listener);}
  }
  event(){return new TextEncoder().encode(`id: ${this.revision}\ndata: ${JSON.stringify(this.snapshot())}\n\n`);}
  subscribe(request:Request){
    if(this.listeners.size>=4)return new Response(null,{status:429});
    let controller:ReadableStreamDefaultController<Uint8Array>,timer:ReturnType<typeof setInterval>;
    const close=()=>{this.cleanups.delete(close);clearInterval(timer);this.listeners.delete(controller);request.signal.removeEventListener('abort',close);try{controller.close();}catch{}};
    const stream=new ReadableStream<Uint8Array>({start:c=>{
      controller=c;this.cleanups.add(close);this.listeners.add(c);c.enqueue(this.event());
      timer=setInterval(()=>{try{c.enqueue(new TextEncoder().encode(': keepalive\n\n'));}catch{close();}},15000);timer.unref();
      request.signal.addEventListener('abort',close,{once:true});
    },cancel:close});
    return new Response(stream,{headers:{'content-type':'text/event-stream','cache-control':'no-store','x-accel-buffering':'no'}});
  }
  close(){for(const close of [...this.cleanups])close();}
}
