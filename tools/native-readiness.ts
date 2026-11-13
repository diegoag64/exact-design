import {join,resolve} from 'node:path';
/**
 * When a native screen is ready to capture after a link, a launch or an appearance switch.
 *
 * `ax` (default) reads the app's accessibility tree through the SDK's touch runner (`.exact-sdk/host/apple/touches.mjs`),
 * one session per device, kept until `close()`. The session opens in the background when `prepare` is called; nothing
 * waits for it: a wait that starts before it is ready uses pixels. One that fails to open or breaks is opened once more
 * at the next `prepare`, so the caller decides when (after the app has settled). A screen is ready when the app is in front, shows
 * no alert, exposes an Exact route container (`exact-navigation-*`), its element identity has held still for the stable
 * window, and that identity differs from the one before the link, or the unchanged window has passed (a link to the screen
 * already shown). A transition exposes a short tree with no route container and can hold still for over half a second, so
 * stillness alone is not enough.
 *
 * `pixel` is the fallback for a device whose runner cannot open or answer: BMP screenshots until two in a row match and,
 * unless the unchanged window has passed, differ from the screen before the link.
 */
const root=resolve(import.meta.dir,'..');
export type Outcome='ready'|'timeout'|'quit';
export type TouchSession={ask(request:Record<string,unknown>,ms?:number):Promise<any>;close():Promise<void>};
export type Bitmap={width:number;height:number;samples:Uint8Array};
/** What the screen showed before the link: an AX identity, a pixel frame, `null` when the app was not in front (anything
 *  it shows next is a change), or `undefined` when unknown (only the unchanged window counts). */
export type Baseline=string|Bitmap|null|undefined;
/** `mode` is how the baseline was read; `via` is set by `wait` to what decided the outcome: `ax` also confirmed the app in
 *  front. */
export type Mark={udid:string;appId:string;at:number;baseline:Baseline;mode?:'ax'|'pixel';via?:'ax'|'pixel'};
export interface Readiness {
  readonly deadline?:number;
  /** Ends a device session before a different app uses that device. */
  releaseOtherApp?(udid:string,appId:string):Promise<void>;
  /** Starts opening what readiness needs for a device without waiting for it. */
  prepare?(udid:string,appId:string):void;
  /** Whether `prepare` would start opening something now (nothing open or opening, and not given up). */
  needsOpen?(udid:string,appId:string):boolean;
  /** Drops what readiness remembers of the screen, after something changed it without a wait. */
  forget?(udid:string):void;
  /** Reads the screen before a link, launch or switch; the readiness clock starts when it returns. `blank`: the screen
   *  before says nothing about the next one (a launch), so it is not read. */
  mark(udid:string,appId:string,blank?:boolean):Promise<Mark>;
  /** Waits until the screen is ready, the deadline passes, or the app quits. */
  wait(mark:Mark,deadline?:number):Promise<Outcome>;
  close():Promise<void>;
}
export type ReadinessOptions={
  /** A BMP screenshot of the device. */
  shoot:(udid:string)=>Promise<Buffer>;
  /** Opens a touch-runner session; the default loads the SDK's runner only when first needed. */
  open?:(udid:string,appId:string)=>Promise<TouchSession>;
  mode?:'ax'|'pixel';
  /** Called once per device when it falls back to pixels. */
  notice?:(udid:string,reason:string)=>void;
  poll?:number;pixelPoll?:number;stable?:number;unchanged?:number;deadline?:number;
  now?:()=>number;sleep?:(ms:number)=>Promise<void>;
};
const env=(name:string,fallback:number)=>{const v=Number(process.env[name]);return Number.isFinite(v)&&v>0?v:fallback;};
export const readinessDefaults=()=>({poll:env('EXACT_DESIGN_NATIVE_POLL_MS',300),pixelPoll:600,stable:env('EXACT_DESIGN_NATIVE_STABLE_MS',600),unchanged:1500,deadline:env('EXACT_DESIGN_NATIVE_READY_MS',8000)});
/** A pixel frame differs from another when more than this share of sampled pixels moved by more than CHANNEL_DELTA. */
export const PIXEL_SHARE=0.005,CHANNEL_DELTA=24;
const NAVIGATION='exact-navigation-';
const snap=(v:unknown)=>typeof v==='number'?Math.round(v/4)*4:0;
/** The elements a screen exposes, ignoring their text so a ticking label does not keep it moving: type, identifier and
 *  frame rounded to 4 pt, sorted. */
export function identity(elements:any[]):string{
  return JSON.stringify(elements.map(e=>`${e?.type??''}|${e?.identifier??''}|${(Array.isArray(e?.frame)?e.frame:[]).slice(0,4).map(snap).join(',')}`).sort());
}
/** Whether a tree shows a settled Exact screen: a route container and no alert. */
export function routeShown(elements:any[]){return elements.some(e=>typeof e?.identifier==='string'&&e.identifier.startsWith(NAVIGATION))&&!elements.some(e=>e?.type==='Alert');}
/** Reads a BMP's pixels into an RGB sample every `step` pixels in each direction. Handles bottom-up and top-down rows,
 *  24 and 32 bits per pixel, and BI_BITFIELDS channel masks. */
export function parseBmp(b:Buffer,step=4):Bitmap{
  if(b.length<54||b.toString('latin1',0,2)!=='BM')throw new Error('Not a BMP screenshot.');
  const offset=b.readUInt32LE(10),header=b.readUInt32LE(14),width=b.readInt32LE(18),raw=b.readInt32LE(22),bpp=b.readUInt16LE(28),compression=b.readUInt32LE(30);
  if(header<40||width<=0||raw===0||![24,32].includes(bpp)||![0,3,6].includes(compression))throw new Error('Unsupported BMP screenshot.');
  const height=Math.abs(raw),stride=Math.ceil(width*bpp/32)*4,bytes=bpp/8;
  if(offset+stride*height>b.length)throw new Error('Truncated BMP screenshot.');
  // Byte index of red, green and blue within a pixel: BGR(X) unless the masks say otherwise.
  let channels=[2,1,0];
  if(compression!==0&&b.length>=66){const masks=[54,58,62].map(o=>b.readUInt32LE(o)),index=masks.map(m=>[0,1,2,3].find(i=>m===0xff<<(i*8)>>>0));if(index.every(i=>i!==undefined&&i<bytes))channels=index as number[];}
  const columns=Math.ceil(width/step),rows=Math.ceil(height/step),samples=new Uint8Array(columns*rows*3);let n=0;
  for(let y=0;y<height;y+=step){const row=offset+(raw<0?y:height-1-y)*stride;for(let x=0;x<width;x+=step){const p=row+x*bytes;samples[n++]=b[p+channels[0]];samples[n++]=b[p+channels[1]];samples[n++]=b[p+channels[2]];}}
  return {width,height,samples};
}
/** The share of sampled pixels whose largest channel moved by more than CHANNEL_DELTA; 1 when the sizes differ. */
export function pixelChange(a:Bitmap,b:Bitmap){
  if(a.width!==b.width||a.height!==b.height||a.samples.length!==b.samples.length)return 1;
  let changed=0;const s=a.samples,t=b.samples;
  for(let i=0;i<s.length;i+=3)if(Math.abs(s[i]-t[i])>CHANNEL_DELTA||Math.abs(s[i+1]-t[i+1])>CHANNEL_DELTA||Math.abs(s[i+2]-t[i+2])>CHANNEL_DELTA)changed++;
  return changed/(s.length/3||1);
}
const isBitmap=(b:Baseline):b is Bitmap=>typeof b==='object'&&b!==null;
async function sdkTouches(udid:string,appId:string):Promise<TouchSession>{
  const {openTouches}=await import(join(root,'.exact-sdk/host/apple/touches.mjs'));
  return openTouches({udid,appId,foldable:false});
}
type Slot={appId:string;attempts:number;opening?:Promise<void>;session?:TouchSession};
export class NativeReadiness implements Readiness {
  private slots=new Map<string,Slot>();private pixel=new Set<string>();private settled=new Map<string,Bitmap>();private closed=false;
  readonly poll:number;readonly pixelPoll:number;readonly stable:number;readonly unchanged:number;readonly deadline:number;
  private now:()=>number;private sleep:(ms:number)=>Promise<void>;
  constructor(readonly options:ReadinessOptions){const d=readinessDefaults();this.poll=options.poll??d.poll;this.pixelPoll=options.pixelPoll??d.pixelPoll;this.stable=options.stable??d.stable;this.unchanged=options.unchanged??d.unchanged;this.deadline=options.deadline??d.deadline;this.now=options.now??Date.now;this.sleep=options.sleep??(ms=>Bun.sleep(ms));}
  /** Whether a device is on pixels for good: forced, or its runner failed twice. */
  usesPixels(udid:string){return this.options.mode==='pixel'||this.pixel.has(udid);}
  /** Whether a device's touch-runner session is open now. */
  axReady(udid:string){return !!this.slots.get(udid)?.session;}
  needsOpen(udid:string,appId:string){if(this.closed||this.usesPixels(udid))return false;const slot=this.slots.get(udid);return !slot||slot.appId!==appId||(!slot.session&&!slot.opening);}
  prepare(udid:string,appId:string){
    if(this.closed||this.usesPixels(udid))return;let slot=this.slots.get(udid);
    if(slot&&slot.appId!==appId){this.slots.delete(udid);void slot.session?.close().catch(()=>{});slot=undefined;}
    if(!slot){slot={appId,attempts:0};this.slots.set(udid,slot);}
    if(!slot.session&&!slot.opening)this.start(udid,slot);
  }
  /** Opens a session in the background; after a failure the next `prepare` tries once more, then the device stays on
   *  pixels. */
  private start(udid:string,slot:Slot){
    slot.attempts++;
    slot.opening=(this.options.open??sdkTouches)(udid,slot.appId).then(async session=>{
      slot.opening=undefined;if(this.closed||this.slots.get(udid)!==slot){await session.close().catch(()=>{});return;}slot.session=session;
    },e=>{slot.opening=undefined;if(this.closed||this.slots.get(udid)!==slot)return;this.lost(udid,slot,`the accessibility runner did not open (${String(e?.message??e).split('\n')[0].slice(0,300)})`);});
  }
  /** A session that failed to open or broke: the next `prepare` opens it once more, then pixels for good. A just-booted
   *  device can fail to answer its accessibility settings; the caller prepares again only once the app has settled. */
  private lost(udid:string,slot:Slot,reason:string){
    const session=slot.session;slot.session=undefined;void session?.close().catch(()=>{});
    if(slot.attempts<2&&!this.closed)return;
    this.slots.delete(udid);this.pixel.add(udid);this.options.notice?.(udid,reason);
  }
  async releaseOtherApp(udid:string,appId:string){const slot=this.slots.get(udid);if(!slot||slot.appId===appId)return;this.slots.delete(udid);this.settled.delete(udid);this.pixel.delete(udid);await slot.opening;await slot.session?.close();}
  forget(udid:string){this.settled.delete(udid);}
  private async ask(session:TouchSession,request:Record<string,unknown>){try{return await session.ask(request);}catch(e){return {error:`the touch runner failed: ${String((e as Error)?.message??e)}`};}}
  async mark(udid:string,appId:string,blank=false):Promise<Mark>{
    const slot=this.slots.get(udid),session=slot?.session;
    // After a launch the tree's first settled screen is new (null); pixels wait out the unchanged window (undefined),
    // since a launch screen can hold still.
    if(blank){this.settled.delete(udid);return session?{udid,appId,at:this.now(),baseline:null,mode:'ax'}:{udid,appId,at:this.now(),baseline:undefined,mode:'pixel'};}
    if(slot&&session){const reply=await this.ask(session,{op:'tree'});
      if(!reply.error&&Array.isArray(reply.elements)){this.settled.delete(udid);return {udid,appId,at:this.now(),baseline:identity(reply.elements),mode:'ax'};}
      const error=String(reply.error??'the tree had no elements');
      if(/not in the foreground/.test(error)){this.settled.delete(udid);return {udid,appId,at:this.now(),baseline:null,mode:'ax'};}
      if(/snapshot failed/.test(error)){this.settled.delete(udid);return {udid,appId,at:this.now(),baseline:undefined,mode:'ax'};}
      this.lost(udid,slot,error);
    }
    // The last pixel wait's settled frame is the screen now, unless something changed it since: no screenshot needed.
    let frame=this.settled.get(udid);this.settled.delete(udid);
    if(!frame)try{frame=parseBmp(await this.options.shoot(udid));}catch{}
    return {udid,appId,at:this.now(),baseline:frame,mode:'pixel'};
  }
  async wait(mark:Mark,deadline=this.deadline):Promise<Outcome>{
    const end=mark.at+deadline,slot=this.slots.get(mark.udid);this.settled.delete(mark.udid);
    if(mark.mode!=='pixel'&&slot?.session){mark.via='ax';const outcome=await this.tree(slot,mark,end);if(outcome)return outcome;}
    mark.via='pixel';
    // A baseline read from the tree says nothing about pixels: only the unchanged window counts.
    return this.pixels(mark,mark.mode==='pixel'?mark.baseline:undefined,end);
  }
  /** The AX loop; undefined when the session broke part way. */
  private async tree(slot:Slot,mark:Mark,end:number):Promise<Outcome|undefined>{
    const session=slot.session!;let last:string|undefined,since=0,failures=0;
    while(true){
      const t=this.now(),reply=await this.ask(session,{op:'tree'});
      if(reply.error||!Array.isArray(reply.elements)){
        const error=String(reply.error??'the tree had no elements');
        if(/not in the foreground/.test(error)){last=undefined;if((await this.ask(session,{op:'foreground'})).state==='notRunning')return 'quit';}
        // A snapshot can fail while the app is mid-transition; a runner that hung up or stopped answering is gone.
        else if(!/snapshot failed/.test(error)||++failures>=3){if(slot.session===session)this.lost(mark.udid,slot,error);return undefined;}
      }else{
        failures=0;const elements=reply.elements,id=identity(elements);
        if(id!==last){last=id;since=t;}
        const moved=typeof mark.baseline==='string'?id!==mark.baseline:mark.baseline===null;
        if(routeShown(elements)&&t-since>=this.stable&&(moved||t-mark.at>=this.unchanged)){
          const state=(await this.ask(session,{op:'foreground'})).state;
          if(state==='runningForeground')return 'ready';if(state==='notRunning')return 'quit';
        }
      }
      if(this.now()>=end)return 'timeout';
      await this.sleep(Math.max(0,Math.min(this.poll-(this.now()-t),end-this.now())));
    }
  }
  private async pixels(mark:Mark,baseline:Baseline,end:number):Promise<Outcome>{
    let previous:Bitmap|undefined;
    while(true){
      const t=this.now();let frame:Bitmap|undefined;try{frame=parseBmp(await this.options.shoot(mark.udid));}catch{}
      if(frame&&previous&&pixelChange(previous,frame)<PIXEL_SHARE){
        const moved=isBitmap(baseline)?pixelChange(baseline,frame)>=PIXEL_SHARE:baseline===null;
        if(moved||t-mark.at>=this.unchanged){this.settled.set(mark.udid,frame);return 'ready';}
      }
      previous=frame;
      if(this.now()>=end)return 'timeout';
      await this.sleep(Math.max(0,Math.min(this.pixelPoll-(this.now()-t),end-this.now())));
    }
  }
  /** Ends every touch-runner session, including ones still opening, which puts each simulator's accessibility back. */
  async close(){this.closed=true;const slots=[...this.slots.values()];this.slots.clear();this.settled.clear();
    await Promise.all(slots.map(async slot=>{while(slot.opening)await slot.opening.catch(()=>{});await slot.session?.close().catch(()=>{});slot.session=undefined;}));}
}
