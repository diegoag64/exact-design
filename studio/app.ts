import {draftChanges,workspaceChanges} from './design-history';
import type { Answer, Sources, Ctx2D, Frame } from './app.contract.d.ts';
import { validSource } from './workspace';
import {draftBucket} from './draft-storage';
import {draftReview} from './draft-review';
import { emptySpacing } from './spacing';
import { screenSource,localPreview,projectUrl } from './project';
import { parseRoutes, routeServed, type DiscoveredScreen } from './discovery';
import { snapTargets } from './snapping';
import { render } from './render';
import { deviceOptions, nativeDevice, DEFAULT_NATIVE_DEVICE } from './devices';
import { ProjectStore, ProjectWorkspace, resolveConnection, validKey, type LiveApp, type Intent } from './projects';
import { validCamera } from './persistence';
const catalog=deviceOptions();
// One page holds one store: each project it opens keeps its own editor, undo history, drafts and timeline. Requests name
// the project they were sent for, so a reply that arrives after the page switched projects still lands in its own.
const store=new ProjectStore();
/** Editing sessions: the project, draft bucket and origin each was opened for. */
const designSessions=new Map<string,{key:string;bucket:string;origin:string}>();
const designViews=new Map<string,any>();
/** The latest identity check of each project's address on this page. */
const checks=new Map<string,{url:string;app:LiveApp}>();
let status = ''; let resizing = false;
export const DISCOVERY_API = 'http://127.0.0.1:5175';
export const grants = `fs.read app:/data/projects.json\nfs.write app:/data/projects.json\nfs.read app:/data/projects\nfs.write app:/data/projects\nfs.read app:/data/design.json\nfs.read app:/data/design-drafts.json\nfs.read app:/data/design-history.json\nnet.fetch ${DISCOVERY_API}`;
let discoveryCache: {owner:string;revision:number;routes:DiscoveredScreen[];error:string}|undefined;
const previewBridges=new Map<string,string>();
// Frame ids reach the helper scoped to this page and project, so two studio pages showing view-1, or two projects
// in one page, never share a frame's readiness, size or editing state. The scope comes from the page's start time;
// the studio only ever sees plain view ids.
let pageScope='';
const setScope=(since:number)=>{if(!pageScope&&since>0)pageScope='p'+Math.round(since*1000).toString(36);};
const scoped=(key:string,id:string)=>pageScope?`${pageScope}~${key}~${id}`:`${key}~${id}`;
const scopeParts=(id:string)=>{
  const prefix=pageScope?pageScope+'~':'';
  if(typeof id!=='string'||!id.startsWith(prefix))return {key:'',id};
  const rest=id.slice(prefix.length),at=rest.indexOf('~');
  return at>0&&validKey(rest.slice(0,at))?{key:rest.slice(0,at),id:rest.slice(at+1)}:{key:'',id};
};
const unscoped=(id:string)=>scopeParts(id).id;
async function discoverProject(owner:string,revision:number) {
  if(discoveryCache?.owner===owner && discoveryCache.revision===revision) return discoveryCache;
  const response=await fetch(`${DISCOVERY_API}/discover`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({url:owner}),exactTimeout:6000});
  if(!response.ok) throw new Error('Discovery unavailable');
  const body=await response.json();
  if(typeof body.error!=='string' || !Array.isArray(body.routes)) throw new Error('Invalid discovery response');
  const routes=parseRoutes({routes:body.routes.map((r:{name:string;route:string})=>({name:r.name,pattern:r.route}))});
  return discoveryCache={owner,revision,routes,error:body.error};
}
/** Which app answers at `url`. The helper reads the app's folder from Exact's editing API; see tools/project-identity.ts. */
async function identify(url:string):Promise<LiveApp>{
  try{
    const response=await fetch(`${DISCOVERY_API}/identify`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({url}),exactTimeout:8000});
    const body=await response.json();
    const state=['verified','unverified','offline'].includes(body?.state)?body.state:'unverified';
    const identity=state==='verified'&&typeof body.identity==='string'&&/^app-[a-f\d]{24}$/.test(body.identity)?body.identity:'';
    return {state:identity||state!=='verified'?state:'unverified',identity,name:typeof body.name==='string'?body.name.slice(0,120):''};
  }catch(e){if((e as {code?:string}).code==='bake')throw e;return {state:'unverified',identity:'',name:''};}
}
function framePreview(key:string,source:string,id:string,height:number,auto:boolean,canvas:boolean){
  if(!source)return '';
  if(localPreview(source)&&!previewBridges.has(new URL(source).origin))return '';
  const url=new URL(source),bridge=previewBridges.get(url.origin);
  if(bridge&&bridge!==url.origin){
    url.host=new URL(bridge).host;url.searchParams.set('__ed_frame',scoped(key,id));url.searchParams.set('__ed_events','project-v2');url.searchParams.set('__ed_canvas',canvas?'1':'0');
    url.searchParams.set('__ed_height',String(height));url.searchParams.set('__ed_full',auto?'1':'0');
  }
  return url.href;
}
/** How the project's address answers now: `ok`, `offline`, `unverified` (neither side has an identity), `confirm` (an
 *  unverified project and a verified app: the person decides), `unconfirmed` (a verified project and an app that cannot
 *  say which it is) or `mismatch` (a different app). '' until checked. */
function connection(ws:ProjectWorkspace){
  const p=ws.editor.document.project,check=checks.get(ws.key);
  if(!p.url||!check||check.url!==p.url)return {state:'',liveName:''};
  const app=check.app,identity=p.identity??'';
  const state=app.state==='offline'?'offline':app.state==='unverified'?(identity?'unconfirmed':'unverified'):!identity?'confirm':identity===app.identity?'ok':'mismatch';
  return {state,liveName:app.name};
}
const snapshot = (ws:ProjectWorkspace) => {
  const editor=ws.editor,document = editor.document,frames=editor.frames,shown=editor.shownFrames,bounds=shown.length?shown:frames;
  const linked=connection(ws),blocked=linked.state==='mismatch';
  // A different app answers at this project's address: its screens show no preview rather than another app's pages.
  const screens = new Map(document.screens.map(screen => [screen.id, {...screen, source:blocked&&screen.route?'':screenSource(screen,document.project)}]));
  const targets = editor.selected === editor.active ? snapTargets(editor.frame, shown) : {x: [], y: []};
  const camera=ws.persistence.camera;
  return {
    frameX: editor.view.x, frameY: editor.view.y, snapX: targets.x, snapY: targets.y,
    drawing: JSON.stringify({...document,views:shown, screens:[...screens.values()], active: editor.active}),
    projectKey: ws.key, projectName: document.project.name, projectUrl: document.project.url, projectVerified: !!document.project.identity,
    connectionState: linked.state, liveName: linked.liveName,
    projects: store.records.filter(r=>r.key===ws.key||!store.pristine.has(r.key)).map(r=>({key:r.key,name:r.name,url:r.url,current:r.key===ws.key})),
    cameraX: camera?.x??0, cameraY: camera?.y??0, cameraZoom: camera?.zoom??0,
    route: editor.screen.route,
    groups: [...screens.values()].map(screen=>({id:screen.id,name:screen.name,route:screen.route,source:screen.source,
      hidden:!frames.some(v=>v.screenId===screen.id&&editor.isShown(v.id)),
      views:frames.filter(v=>v.screenId===screen.id).map(({id,name,x,y,width,height})=>({id,name,x,y,width,height,hidden:!editor.isShown(id)})),
      layers:editor.screen.id===screen.id && !screen.source && !screen.route ? editor.layers : []})),
    name: document.name,
    // Screens the native preview drawer can capture: each connected screen with a route, keyed by screen id.
    nativeScreens:document.project.url&&!blocked?JSON.stringify({project:document.project.url,screens:document.screens.filter(s=>s.route).map(s=>({id:s.id,route:s.route}))}):'',
    previewRequests:JSON.stringify(document.views.flatMap(v=>{const screen=screens.get(v.screenId)!;return screen.source&&editor.isShown(v.id)?[{id:scoped(ws.key,v.id),url:screen.source,width:v.width,height:v.height,auto:localPreview(screen.source)&&v.heightMode!=='fixed'}]:[];})),
    layers: editor.source||(blocked&&editor.screen.route) ? [] : editor.layers,
    views: frames.map(view => {
      const screen = screens.get(view.screenId)!;
      const previewSource=framePreview(ws.key,screen.source,view.id,document.views.find(v=>v.id===view.id)!.height,view.heightMode!=='fixed',true);
      const {heightMode,hidden:_,...geometry}=view;
      return {...geometry,canAutoHeight:localPreview(screen.source),autoHeight:localPreview(screen.source)&&view.heightMode!=='fixed', source: screen.source, route: screen.route, previewSource, layers: screen.source||screen.route ? [] : screen.layers, screenName: screen.name, hidden: !editor.isShown(view.id)};
    }),
    previewSource:framePreview(ws.key,screens.get(editor.screen.id)!.source,'preview-'+editor.active,editor.view.height,editor.view.heightMode!=='fixed',false),
    active: editor.active, screenId: editor.screen.id, source: screens.get(editor.screen.id)!.source,
    frameSelected: editor.selected === editor.active,
    width: editor.view.width, height: editor.frame.height, screenName: editor.screen.name,
    minX: Math.min(...bounds.map(view => view.x)),
    minY: Math.min(...bounds.map(view => view.y)),
    maxX: Math.max(...bounds.map(view => view.x + view.width)),
    maxY: Math.max(...bounds.map(view => view.y + view.height)),
    selected: editor.selected, canUndo: editor.past.length > 0, canRedo: editor.future.length > 0,
    code: editor.code(), status: ws.persistence.error || store.error || status, resizing, devices: catalog.devices, nativeDevices: catalog.native, deviceSets: catalog.sets,
  };
};
const reply = (ws:ProjectWorkspace,fit=false,error='',extra:{project?:string;choice?:string;options?:string;message?:string}={}) => {
  const d=snapshot(ws);
  return {ok:error==='',error,fit,minX:d.minX,minY:d.minY,maxX:d.maxX,maxY:d.maxY,project:extra.project??'',choice:extra.choice??'',options:extra.options??'',message:extra.message??''};
};
/** The project a request names. An empty or unknown key means the project this page shows by default. */
async function project(storage:any,key:string){return store.current(storage.fs,key);}
async function logWorkspace(ws:ProjectWorkspace,storage:any,before:string,kind:string,target:string,timestamp:number){
  const after=JSON.stringify(ws.editor.document),changes=workspaceChanges(JSON.parse(before),ws.editor.document);
  if(changes.length)await ws.history.append(storage.fs,{time:new Date(timestamp).toISOString(),kind:'workspace-'+kind,project:ws.editor.document.project.url,label:kind==='property'?'Edit '+changes.map(c=>c.property).join(', '):kind==='move'?'Move / resize':kind==='arrange'?'Tidy up':kind==='variants'?'Add device set':kind==='add-all'?'Add all screens':kind==='setup'?'Set up project':kind==='remove-missing'?'Remove missing screens':kind==='adopt'?'Confirm app':kind.charAt(0).toUpperCase()+kind.slice(1),target,changes,beforeState:before,afterState:after});
}
/** Opens, adopts or creates the workspace a connection request resolves to, without adding screens. `before` is the
 *  target's document before this request changed it, for its timeline. */
async function connectTarget(storage:any,ws:ProjectWorkspace,intent:Intent,name:string,value:string,decision:string,deferConnect=false){
  const url=projectUrl(value),live=await identify(url);
  await store.sync(storage.fs);
  let resolution=resolveConnection(store.records,ws.record,url,live,intent,decision==='adopt'||decision==='new'?decision:'',ws.editor.isPristine());
  // An untouched starter that another tab has since connected is no longer this request's to take.
  if(resolution.kind==='here'&&!ws.record.url&&await ws.persistence.changedElsewhere(storage.fs))resolution={kind:'new'};
  const identity=live.state==='verified'?live.identity:'';
  if(resolution.kind==='choose')return {choice:resolution.key,message:resolution.message,options:resolution.options.join(',')};
  if(resolution.kind==='new'){
    // Setup connects a new workspace itself, so the app's screens replace the starter screen.
    const target=await store.create(storage.fs,undefined,deferConnect?undefined:editor=>editor.connectProject(name.trim()||live.name||'Project',url,identity));
    return {target,live,url,created:true,before:JSON.stringify(target.editor.document)};
  }
  const target=resolution.kind==='here'?ws:await store.open(storage.fs,resolution.key);
  const record=target.record,before=JSON.stringify(target.editor.document);
  // A verified app keeps its workspace when it moves to another port; an adopted project takes the identity it was
  // confirmed as. Opening another project from this one's settings keeps that project's own name.
  // The project being edited takes the submitted name; another project opened from its settings keeps its own.
  const own=target===ws&&intent==='connect';
  const label=resolution.kind==='open'&&intent==='connect'&&!own?record.name:name.trim()||record.name||live.name||'Project';
  if(!(deferConnect&&resolution.kind==='here')&&(resolution.kind==='here'||record.url!==url||(identity&&record.identity!==identity)||(own&&label!==record.name))){
    target.editor.connectProject(label,url,identity);
  }
  // Drafts saved while unverified belong to the address the project had before this request.
  if(resolution.adopt&&identity)await target.drafts.adopt(storage.fs,draftBucket('',record.url||url),identity);
  return {target,live,url,created:false,before};
}
/** Whether the app answering at the project's address is the project's own, so its route list may change the screens. */
async function ownApp(ws:ProjectWorkspace){
  const p=ws.editor.document.project;if(!p.url)return false;
  const live=await identify(p.url);
  return p.identity?live.identity===p.identity:live.state!=='verified';
}
const sources: Sources = {
  // Draft changes saved for a project outlive the editing session; the native drawer counts them while not editing.
  savedDrafts: async ([key],_store,storage)=>{if(!key)return {count:0};try{const ws=await project(storage,key);await ws.drafts.load(storage.fs);const p=ws.editor.document.project;return {count:p.url?draftReview(ws.drafts.get(draftBucket(p.identity??'',p.url))).reduce((n,f)=>n+f.changes.length,0):0};}catch{return {count:0};}},
  history: async ([key],_store,storage)=>{try{const ws=await project(storage,key);await ws.history.load(storage.fs);return {entries:ws.history.view(),error:''};}catch(error){return {entries:[],error:error instanceof Error?error.message:'Could not load timeline.'};}},
  scene: async ([key,,,since],_store,storage) => {setScope(since);return snapshot(await project(storage,key));},
  // The native preview drawer asks for one frame per connected screen, on the chosen device and appearance; frame ids are
  // screen ids. `capture` is a comma-separated list of screen ids; empty asks the helper to refresh every frame that is not current.
  native: ([screens,device,appearance,run,capture]) => {
    let latest={state:'idle',phase:'',message:'',error:'',done:0,total:0,progress:-1,elapsed:0,estimate:0,steps:[] as {id:string;label:string;state:string;detail:string}[],frames:[] as {id:string;state:string;shot:string;width:number;height:number;capturedAt:number;error:string}[]};
    if(!screens)return latest;
    const unavailable=()=>({...latest,state:'unavailable',error:'Native previews need the studio helper. Run bun run dev.'});
    const {project,screens:list}=JSON.parse(screens) as {project:string;screens:{id:string;route:string}[]};
    const slug=nativeDevice(device)?device:DEFAULT_NATIVE_DEVICE,mode=appearance==='dark'?'dark':'light';
    const frames=list.map(s=>({id:s.id,device:slug,route:s.route,appearance:mode}));
    if(!frames.length)return latest;
    return fetch(`${DISCOVERY_API}/native`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({project,frames,run,capture:capture?capture.split(','):[]}),exactStream:event=>{
      if(event.type==='error')return unavailable();
      if(event.type!=='message'||typeof event.data!=='string')return latest;
      const value=JSON.parse(event.data);
      const steps=Array.isArray(value.steps)?value.steps.map((s:any)=>({id:String(s.id),label:String(s.label),state:String(s.state),detail:String(s.detail??'')})):[];
      return latest={state:value.state,phase:value.phase,message:value.message,error:value.error,done:value.done,total:value.total,progress:typeof value.progress==='number'?value.progress:-1,elapsed:Number(value.elapsed)||0,estimate:Number(value.estimate)||0,steps,frames:value.frames.map((f:any)=>({id:f.id,state:f.state,shot:f.shot,width:f.width,height:f.height,capturedAt:f.capturedAt,error:f.error}))};
    }}).catch(unavailable);
  },
  // Expo Simulators for the connected project: the helper builds the latest saved source, uploads it to the project's
  // cloud session and opens `route` on `device`. A new `run` token starts `action` (test or stop); the token stays in the helper.
  expo: ([project,device,route,run,action]) => {
    const idle={open:'',idleMinutes:15,maxMinutes:60,configured:false,account:'',state:'idle',message:'',error:'',steps:[] as {id:string;label:string;state:string;detail:string}[],elapsed:0,estimate:0,running:false,device:'',url:'',stale:false};
    if(!project)return idle;
    let latest=idle;
    const unavailable=()=>({...latest,state:'unavailable',error:'Expo Simulators need the studio helper. Run bun run dev.'});
    return fetch(`${DISCOVERY_API}/expo`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({project,device:nativeDevice(device)?device:DEFAULT_NATIVE_DEVICE,route,run,action}),exactStream:event=>{
      if(event.type==='error')return unavailable();
      if(event.type!=='message'||typeof event.data!=='string')return latest;
      const v=JSON.parse(event.data);
      return latest={idleMinutes:Number(v.idleMinutes)||15,maxMinutes:Number(v.maxMinutes)||60,open:typeof v.open==='string'&&v.open.startsWith('http://127.0.0.1:')?v.open:'',configured:!!v.configured,account:String(v.account??''),state:String(v.state??'idle'),message:String(v.message??''),error:String(v.error??''),
        steps:Array.isArray(v.steps)?v.steps.map((s:any)=>({id:String(s.id),label:String(s.label),state:String(s.state),detail:String(s.detail??'')})):[],
        elapsed:Number(v.elapsed)||0,estimate:Number(v.estimate)||0,running:!!v.running,device:String(v.device??''),url:typeof v.url==='string'&&v.url.startsWith('https://')?v.url:'',stale:!!v.stale};
    }}).catch(unavailable);
  },
  expoSetup: async ([project,token]) => {
    try{const r=await (await fetch(`${DISCOVERY_API}/expo/setup`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({project,token}),exactTimeout:120000})).json();return {ok:!!r.ok,error:String(r.error??''),account:String(r.account??'')};}
    catch(e){if((e as {code?:string}).code==='bake')throw e;return {ok:false,error:'Could not reach the studio helper. Run bun run dev.',account:''};}
  },
  previews: ([requests]) => {
    if(!requests||requests==='[]')return {ready:true,signature:'[]',requests,loaded:0,total:0};
    const total=JSON.parse(requests).length;
    let latest={ready:false,signature:'',requests,loaded:0,total};
    return fetch(`${DISCOVERY_API}/previews`,{method:'POST',headers:{'content-type':'application/json'},body:requests,exactStream:event=>{
      if(event.type==='error'){
        for(const frame of JSON.parse(requests)){const origin=new URL(frame.url).origin;if(!previewBridges.has(origin))previewBridges.set(origin,origin);}
        return latest={requests,ready:true,signature:'unavailable',loaded:total,total};
      }
      if(event.type!=='message'||typeof event.data!=='string')return latest;
      const result=JSON.parse(event.data);
      for(const frame of result.frames){
        if(frame.previewSource&&frame.source){const origin=new URL(frame.source).origin;const proxy=new URL(frame.previewSource).origin;if(proxy!==origin)previewBridges.set(origin,proxy);}
        // Each size belongs to the project the frame was requested for.
        const {key,id}=scopeParts(frame.id),owner=store.workspaces.get(key);
        if(frame.ready&&owner)owner.editor.contentSizes.set(id,{source:frame.source,width:frame.width,viewportHeight:frame.viewportHeight,height:frame.height});
      }
      return latest={requests,loaded:result.frames.filter((f:{ready:boolean})=>f.ready).length,total:result.frames.length,ready:!!result.frames.every((f:{ready:boolean})=>f.ready),signature:JSON.stringify(result.frames.map((f:{id:string;height:number;ready:boolean})=>[f.id,f.height,f.ready]))};
    }});
  },
  previewSignal: ([session]) => {
    if(!session)return {revision:0,updateRevision:0,measurement:emptySpacing()};
    return fetch(`${DISCOVERY_API}/design/events?session=${encodeURIComponent(session)}`,{exactStream:event=>{
      if(event.type!=='message'||typeof event.data!=='string')return null;
      const signal=JSON.parse(event.data);
      if(signal?.measurement)signal.measurement.frame=unscoped(signal.measurement.frame);
      return signal;
    }});
  },
  // `value` names the project on `open`: the session, its drafts and its timeline stay with that project even after the
  // page shows another one.
  design: async ([op,session,url,version,row,value,timestamp], _store, storage) => {
    const empty={operation:op,historyChanged:false,instances:1,draftCount:0,draftState:'',draftError:'',canApply:false,ok:false,error:'',session,origin:'',project:'',bridgeOrigin:'',tree:[],crumbs:[],selectedLabel:'',restoring:false,selecting:false,source:'',component:'',version:0,selectionRevision:0,message:'',rows:[],availableProperties:[],canUndo:false,applied:false,draftFiles:[],spacingId:'',spacingPlan:'',spacingFrame:'',spacingInputs:[],colors:[]};
    try {
      let bound=designSessions.get(session),identity='';
      if(op==='open'){
        const ws=await project(storage,value),origin=new URL(url).origin,p=ws.editor.document.project;
        const live=await identify(origin),own=!!p.url&&new URL(p.url).origin===origin;
        // Apply writes to the app that owns the screen. A project's own screens need its recorded app; a screen with its
        // own address edits whichever app verifiably answers there.
        if(own&&p.identity&&live.identity!==p.identity)throw new Error(live.state==='verified'?'A different app is running at this project’s address. Open its own project to edit it.':'Exact Design can’t confirm which app is running at this project’s address, so editing is paused.');
        if(own&&!p.identity&&live.identity)throw new Error('Confirm which app this project belongs to before editing it.');
        identity=own?p.identity??'':live.identity;
        bound={key:ws.key,bucket:draftBucket(identity,origin),origin};
      }
      if(!bound)throw new Error('The editing session ended. Connect again.');
      const ws=await store.open(storage.fs,bound.key);
      await ws.drafts.load(storage.fs);
      const origin=bound.origin,previous=ws.drafts.get(bound.bucket);
      const draftState=op==='open'?previous:'';
      if(['edit','field','align','spacing','override','add-property','undo','revert','discard','apply'].includes(op))await ws.history.load(storage.fs);
      const response=await fetch(`${DISCOVERY_API}/design`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({op,session,url:origin,version,row:op==='open'?scoped(bound.key,row):row,value:op==='open'?'':value,draftState,...(op==='open'?{identity}:{})})});
      let result=await response.json();
      if(typeof result.spacingFrame==='string')result.spacingFrame=unscoped(result.spacingFrame);
      if(!result.ok&&designViews.has(session))result={...designViews.get(session),...result,historyChanged:false};
      if(op==='open'&&result.ok){designSessions.set(result.session,bound);if(result.bridgeOrigin)previewBridges.set(origin,result.bridgeOrigin);}
      if(result.ok&&typeof result.draftState==='string'&&origin){
        const changes=draftChanges(previous,result.draftState,op==='apply');
        if(['edit','field','align','spacing','override','add-property','undo','revert','discard','apply'].includes(op)&&changes.length){
          await ws.history.append(storage.fs,{time:new Date(timestamp).toISOString(),kind:op==='apply'?'apply':op==='undo'?'undo':op==='revert'?'revert':op==='discard'?'discard':'draft',project:origin,label:op==='apply'?'Apply to code':op==='undo'?'Undo draft':op==='revert'?'Revert change':op==='discard'?'Discard draft':'Edit '+[...new Set(changes.map(c=>c.property))].join(', '),target:result.selectedLabel||result.source||'App design',changes,beforeState:previous,afterState:result.draftState});
          result.historyChanged=true;
        }
        await ws.drafts.save(storage.fs,bound.bucket,result.draftState);
      }
      if(result.ok&&op!=='close')designViews.set(result.session??session,result);
      if(op==='close'){designSessions.delete(session);designViews.delete(session);}
      return {...empty,...result,draftFiles:draftReview(result.draftState??''),operation:op,origin:op==='open'?origin:'',project:bound.key,session:op==='close'?'':result.session??session};
    } catch(e) {
      if((e as {code?:string}).code==='bake') throw e;
      const last=designViews.get(session);
      return {...empty,...last,draftFiles:draftReview(last?.draftState??''),operation:op,ok:false,historyChanged:false,project:designSessions.get(session)?.key??(op==='open'?value:''),error:e instanceof Error?e.message:'Could not reach the editing helper. Reconnect before making another change.'};
    }
  },
  discover: async ([owner,existing,revision]) => {
    if(!owner) return {owner,routes:[],missing:[],error:''};
    try {
      const result=await discoverProject(owner,revision), added=new Set(existing);
      // Screens whose route the app no longer lists are flagged instead of loading its not-found page.
      const missing=result.error?[]:[...new Set(existing)].filter(route=>route&&!result.routes.some(r=>routeServed(route,r.route)));
      return {owner,routes:result.routes.map(route=>({...route,added:added.has(route.route)})),missing,error:result.error};
    } catch(e) {
      if((e as {code?:string}).code==='bake') throw e;
      return {owner,routes:[],missing:[],error:'Discovery is unavailable. Run bun run dev, or enter a route below.'};
    }
  },
  // Checks which app answers at a project's address. Each project records the identity it was set up with.
  connection: async ([key,url,_revision],_store,storage) => {
    const none={key,url,state:'',liveName:''};
    if(!url)return none;
    try{
      const ws=await project(storage,key);
      if(ws.editor.document.project.url!==url)return none;
      checks.set(ws.key,{url,app:await identify(url)});
      return {key:ws.key,url,...connection(ws)};
    }catch(e){if((e as {code?:string}).code==='bake')throw e;return none;}
  },
  // Leaves `key`, keeping where its camera was, and records `next` as the project this browser opened last.
  camera: async ([key,x,y,zoom,next],_store,storage) => {
    const ws=await project(storage,key);
    try{
      if(validKey(key)&&ws.key===key&&validCamera({x,y,zoom})){ws.persistence.camera={x,y,zoom};await ws.persistence.save(storage.fs);}
      if(validKey(next)&&next!==key&&store.find(next))await store.register(storage.fs,await store.open(storage.fs,next),true);
      return reply(ws);
    }catch(e){if((e as {code?:string}).code==='bake')throw e;return reply(ws,false,(e as Error).message);}
  },
  library: async ([key,op,name,value,preset,show,decision,timestamp], _store, storage) => {
    const ws=await project(storage,key);
    if(validKey(key)&&ws.key!==key)return reply(ws,false,'That project is no longer saved in this browser.');
    try {
      await ws.history.load(storage.fs);
      let target=ws,before=JSON.stringify(ws.editor.document),opened=false,fit=op==='add'||op==='blank'||op==='add-all',message='';
      if(op==='connect'||op==='new'||op==='open'||op==='adopt'||op==='setup') {
        // `connect` edits this project's connection; `new` and `open` open the app's own workspace; `adopt` confirms
        // that the app now answering is this project's; `setup` opens the app's workspace and adds its screens.
        const url=op==='adopt'?ws.editor.document.project.url:value;
        if(!url)return reply(ws,false,'Connect a project first.');
        let found:Awaited<ReturnType<typeof discoverProject>>|undefined;
        if(op==='setup'||op==='open'){
          // A different app may now own the same dev-server URL.
          discoveryCache=undefined;
          try{found=await discoverProject(projectUrl(url),0);}catch(e){if(op==='setup')throw e;}
          if(op==='setup'&&found!.error&&!found!.routes.length) return reply(ws,false,found!.error);
          if(found&&!found.routes.some(r=>!r.dynamic))found=op==='setup'?found:undefined;
        }
        const intent:Intent=op==='new'?'new':op==='open'||op==='setup'?'setup':'connect';
        const result=await connectTarget(storage,ws,intent,op==='adopt'?ws.editor.document.project.name:name,url,op==='adopt'?'adopt':decision,op==='setup'||(op==='open'&&!!found));
        if(!result.target)return reply(ws,false,result.message,{choice:result.choice,options:result.options});
        target=result.target;before=result.before;opened=true;
        // The routes were read before the identity: the same app must still answer, or they may be another app's.
        if(found&&result.live.state==='verified'&&(await identify(url)).identity!==result.live.identity)return reply(ws,false,'The app at this address changed during setup. Try again.');
        await target.history.load(storage.fs);
        if(target!==ws)message=`Opened ${target.record.name} in its own workspace.`;
        // Setup adds the app's screens; opening an app adds them only to the workspace it just created.
        if(found&&(op==='setup'||result.created||target.editor.isPristine())){
          const start=JSON.stringify(target.editor.document);
          if(!target.editor.setupProject(name||result.live.name,url,found.routes.map(r=>({name:r.name,route:r.route})),preset||'Core',show.split(','),result.live.state==='verified'?result.live.identity:'')) return reply(target,false,'That project lists no screens to add.',{project:target.key});
          // A workspace that already holds the app's screens keeps its arrangement and camera.
          fit=JSON.stringify(target.editor.document)!==start;
        }
      }
      else if(op==='disconnect') ws.editor.disconnectProject();
      else if(op==='add' || op==='blank') ws.editor.addScreen(name,value,preset,op==='add');
      else if((op==='add-all'||op==='remove-missing')&&!await ownApp(ws)) return reply(ws,false,'The app at this address isn’t confirmed as this project’s, so its routes can’t change the screens.');
      else if(op==='add-all') {
        const found=await discoverProject(ws.editor.document.project.url,discoveryCache?.owner===ws.editor.document.project.url?discoveryCache.revision:0);
        const added=new Set(ws.editor.document.screens.map(s=>s.route));
        ws.editor.addScreens(found.routes.filter(r=>!r.dynamic&&!added.has(r.route)).map(r=>({name:r.name,route:r.route})),preset,true);
      }
      else if(op==='remove-missing') {
        // Screens whose routes the app no longer serves, in one undo step. A workspace keeps at least one screen.
        const routes=new Set(value.split(/\s+/).filter(Boolean));
        ws.editor.change(d=>{const gone=new Set(d.screens.filter(s=>s.route&&routes.has(s.route)).map(s=>s.id));if(!gone.size||gone.size===d.screens.length)return;d.screens=d.screens.filter(s=>!gone.has(s.id));d.views=d.views.filter(v=>!gone.has(v.screenId));});
      }
      else return reply(ws,false,'Unknown library action.');
      resizing=false;status='';
      if(!await target.persistence.save(storage.fs))return reply(target,false,target.persistence.error,{project:target.key});
      await store.register(storage.fs,target,opened);
      await logWorkspace(target,storage,before,op,name||target.record.name,timestamp);
      return reply(target,fit,'',{project:target.key,message});
    } catch(e) {if((e as {code?:string}).code==='bake')throw e;return reply(ws,false,(e as Error).message);}
  },
  document: async ([key,since], _store, storage) => {
    setScope(since);
    const ws=await project(storage,key);
    await store.sync(storage.fs);
    return snapshot(ws);
  },
  edit: async ([key, op, id, value, x, y,timestamp], _store, storage) => {
    const ws=await project(storage,key),editor=ws.editor;
    if(validKey(key)&&ws.key!==key)return reply(ws,false,'That project is no longer open.');
    await ws.history.load(storage.fs);
    const before=JSON.stringify(editor.document),visibilityTarget=op==='hide'||op==='show'?editor.document.screens.find(s=>s.id===id)?.name??editor.document.views.find(v=>v.id===id)?.name:undefined,target=visibilityTarget??editor.target?.name??editor.screen.name;
    status = '';
    if(op === 'select') { editor.select(id); resizing = false; }
    if(op === 'hit') resizing = editor.hit(x,y,9 / Math.max(0.01, Number(value) || 1));
    if(op === 'move') editor.move(x,y,resizing,id === 'snap' ? Number(value) || 1 : 0);
    if(op === 'screen') editor.addView('',true);
    if(op === 'duplicate') editor.addView('',true,true);
    if(op === 'variant') editor.addView(id);
    if(op === 'variants') { try { editor.addViews(id); } catch(e) { status=(e as Error).message; } }
    let merged=false;
    if(op === 'arrange') merged=editor.arrange(id.endsWith('settle'),id.startsWith('collage'));
    if(op === 'add') editor.add(id);
    if(op === 'property') { if(id === 'source' && !validSource(value.trim())) status = 'Use an http:// or https:// URL'; else { try { editor.property(id, value); } catch(e) {status=(e as Error).message;} } }
    if(op === 'undo') editor.undo();
    if(op === 'redo') editor.redo();
    if(op === 'delete') editor.remove();
    if(op === 'hide' || op === 'show') editor.setHidden(id, op === 'hide');
    const saved=await ws.persistence.save(storage.fs,op==='save');
    // Undo and redo can connect or disconnect the project, so the list follows.
    if(saved&&(op==='undo'||op==='redo'))await store.register(storage.fs,ws).catch(()=>{});
    if(saved&&!merged)try{await logWorkspace(ws,storage,before,op,target,timestamp);}catch{status='Could not save the timeline. Your workspace is saved.';}
    if(op==='save'&&saved&&!status)status='Saved';
    return reply(ws,['screen','duplicate','variant','variants'].includes(op)||(op==='arrange'&&!id.endsWith('settle'))||(op==='property'&&['source','route'].includes(id)),'',{project:ws.key});
  },
};
export const answer: Answer = (source, args, store, storage, native) => sources[source](args, store, storage, native);
export const surfaces = { design: 9 };
export function draw(_surface: string, args: unknown[], ctx: Ctx2D, frame: Frame): boolean { render(args, ctx, frame); return false; }
