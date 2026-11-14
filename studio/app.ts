import {DesignHistory,draftChanges,workspaceChanges} from './design-history';
import type { Answer, Sources, Ctx2D, Frame } from './app.contract.d.ts';
import { WorkspaceEditor, validSource } from './workspace';
import { WorkspacePersistence } from './persistence';
import {DraftStorage} from './draft-storage';
import {draftReview} from './draft-review';
import { emptySpacing } from './spacing';
import { screenSource,localPreview,projectUrl } from './project';
import { parseRoutes, type DiscoveredScreen } from './discovery';
import { snapTargets } from './snapping';
import { render } from './render';
import { deviceOptions, nativeDevice, DEFAULT_NATIVE_DEVICE } from './devices';
const catalog=deviceOptions();
const editor = new WorkspaceEditor();
const persistence = new WorkspacePersistence(editor);
const drafts=new DraftStorage();
const history=new DesignHistory();
const designOrigins=new Map<string,string>();
const designViews=new Map<string,any>();
let status = ''; let resizing = false;
export const DISCOVERY_API = 'http://127.0.0.1:5175';
export const grants = `fs.read app:/data/design.json\nfs.write app:/data/design.json\nfs.read app:/data/design-drafts.json\nfs.write app:/data/design-drafts.json\nfs.read app:/data/design-history.json\nfs.write app:/data/design-history.json\nnet.fetch ${DISCOVERY_API}`;
let discoveryCache: {owner:string;revision:number;routes:DiscoveredScreen[];error:string}|undefined;
const previewBridges=new Map<string,string>();
// Frame ids reach the helper scoped to this page, so two studio pages showing view-1 never share its readiness,
// sizes or editing state. The scope comes from the page's start time; the studio only ever sees plain view ids.
let pageScope='';
const setScope=(since:number)=>{if(!pageScope&&since>0)pageScope='p'+Math.round(since*1000).toString(36);};
const scoped=(id:string)=>pageScope?`${pageScope}~${id}`:id;
const unscoped=(id:string)=>typeof id==='string'&&pageScope&&id.startsWith(pageScope+'~')?id.slice(pageScope.length+1):id;
async function discoverProject(owner:string,revision:number) {
  if(discoveryCache?.owner===owner && discoveryCache.revision===revision) return discoveryCache;
  const response=await fetch(`${DISCOVERY_API}/discover`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({url:owner}),exactTimeout:6000});
  if(!response.ok) throw new Error('Discovery unavailable');
  const body=await response.json();
  if(typeof body.error!=='string' || !Array.isArray(body.routes)) throw new Error('Invalid discovery response');
  const routes=parseRoutes({routes:body.routes.map((r:{name:string;route:string})=>({name:r.name,pattern:r.route}))});
  return discoveryCache={owner,revision,routes,error:body.error};
}
function framePreview(source:string,id:string,height:number,auto:boolean,canvas:boolean){
  if(!source)return '';
  if(localPreview(source)&&!previewBridges.has(new URL(source).origin))return '';
  const url=new URL(source),bridge=previewBridges.get(url.origin);
  if(bridge&&bridge!==url.origin){
    url.host=new URL(bridge).host;url.searchParams.set('__ed_frame',scoped(id));url.searchParams.set('__ed_events','project-v2');url.searchParams.set('__ed_canvas',canvas?'1':'0');
    url.searchParams.set('__ed_height',String(height));url.searchParams.set('__ed_full',auto?'1':'0');
  }
  return url.href;
}
const snapshot = () => {
  const document = editor.document,frames=editor.frames,shown=editor.shownFrames,bounds=shown.length?shown:frames;
  const screens = new Map(document.screens.map(screen => [screen.id, {...screen, source:screenSource(screen,document.project)}]));
  const targets = editor.selected === editor.active ? snapTargets(editor.frame, shown) : {x: [], y: []};
  return {
    frameX: editor.view.x, frameY: editor.view.y, snapX: targets.x, snapY: targets.y,
    drawing: JSON.stringify({...document,views:shown, screens:[...screens.values()], active: editor.active}),
    projectName: document.project.name, projectUrl: document.project.url, route: editor.screen.route,
    groups: [...screens.values()].map(screen=>({id:screen.id,name:screen.name,route:screen.route,source:screen.source,
      hidden:!frames.some(v=>v.screenId===screen.id&&editor.isShown(v.id)),
      views:frames.filter(v=>v.screenId===screen.id).map(({id,name,x,y,width,height})=>({id,name,x,y,width,height,hidden:!editor.isShown(id)})),
      layers:editor.screen.id===screen.id && !screen.source ? editor.layers : []})),
    name: document.name,
    // Screens the native preview drawer can capture: each connected screen with a route, keyed by screen id.
    nativeScreens:document.project.url?JSON.stringify({project:document.project.url,screens:document.screens.filter(s=>s.route).map(s=>({id:s.id,route:s.route}))}):'',
    previewRequests:JSON.stringify(document.views.flatMap(v=>{const screen=screens.get(v.screenId)!;return screen.source&&editor.isShown(v.id)?[{id:scoped(v.id),url:screen.source,width:v.width,height:v.height,auto:localPreview(screen.source)&&v.heightMode!=='fixed'}]:[];})),
    layers: editor.layers,
    views: frames.map(view => {
      const screen = screens.get(view.screenId)!;
      const previewSource=framePreview(screen.source,view.id,document.views.find(v=>v.id===view.id)!.height,view.heightMode!=='fixed',true);
      const {heightMode,hidden:_,...geometry}=view;
      return {...geometry,canAutoHeight:localPreview(screen.source),autoHeight:localPreview(screen.source)&&view.heightMode!=='fixed', source: screen.source, previewSource, layers: screen.source ? [] : screen.layers, screenName: screen.name, hidden: !editor.isShown(view.id)};
    }),
    previewSource:framePreview(editor.source,'preview-'+editor.active,editor.view.height,editor.view.heightMode!=='fixed',false),
    active: editor.active, screenId: editor.screen.id, source: editor.source,
    frameSelected: editor.selected === editor.active,
    width: editor.view.width, height: editor.frame.height, screenName: editor.screen.name,
    minX: Math.min(...bounds.map(view => view.x)),
    minY: Math.min(...bounds.map(view => view.y)),
    maxX: Math.max(...bounds.map(view => view.x + view.width)),
    maxY: Math.max(...bounds.map(view => view.y + view.height)),
    selected: editor.selected, canUndo: editor.past.length > 0, canRedo: editor.future.length > 0,
    code: editor.code(), status: persistence.error || status, resizing, devices: catalog.devices, nativeDevices: catalog.native, deviceSets: catalog.sets,
  };
};
const reply = (fit=false,error='') => {
  const d=snapshot();
  return {ok:error==='',error,fit,minX:d.minX,minY:d.minY,maxX:d.maxX,maxY:d.maxY};
};
async function logWorkspace(storage:any,before:string,kind:string,target:string,timestamp:number){
  const after=JSON.stringify(editor.document),changes=workspaceChanges(JSON.parse(before),editor.document);
  if(changes.length)await history.append(storage.fs,{time:new Date(timestamp).toISOString(),kind:'workspace-'+kind,project:editor.document.project.url,label:kind==='property'?'Edit '+changes.map(c=>c.property).join(', '):kind==='move'?'Move / resize':kind==='arrange'?'Tidy up':kind==='variants'?'Add device set':kind==='add-all'?'Add all screens':kind==='setup'?'Set up project':kind.charAt(0).toUpperCase()+kind.slice(1),target,changes,beforeState:before,afterState:after});
}
const sources: Sources = {
  // Draft changes saved for a project outlive the editing session; the native drawer counts them while not editing.
  savedDrafts: async ([project],_store,storage)=>{if(!project)return {count:0};try{await drafts.load(storage.fs);return {count:draftReview(drafts.get(new URL(project).origin)).reduce((n,f)=>n+f.changes.length,0)};}catch{return {count:0};}},
  history: async ([project],_store,storage)=>{try{await history.load(storage.fs);return {entries:history.view(project),error:''};}catch(error){return {entries:[],error:error instanceof Error?error.message:'Could not load timeline.'};}},
  scene: ([,,since]) => {setScope(since);return snapshot();},
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
    const idle={configured:false,account:'',state:'idle',message:'',error:'',steps:[] as {id:string;label:string;state:string;detail:string}[],elapsed:0,estimate:0,running:false,device:'',url:'',stale:false};
    if(!project)return idle;
    let latest=idle;
    const unavailable=()=>({...latest,state:'unavailable',error:'Expo Simulators need the studio helper. Run bun run dev.'});
    return fetch(`${DISCOVERY_API}/expo`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({project,device:nativeDevice(device)?device:DEFAULT_NATIVE_DEVICE,route,run,action}),exactStream:event=>{
      if(event.type==='error')return unavailable();
      if(event.type!=='message'||typeof event.data!=='string')return latest;
      const v=JSON.parse(event.data);
      return latest={configured:!!v.configured,account:String(v.account??''),state:String(v.state??'idle'),message:String(v.message??''),error:String(v.error??''),
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
        if(frame.ready)editor.contentSizes.set(unscoped(frame.id),{source:frame.source,width:frame.width,viewportHeight:frame.viewportHeight,height:frame.height});
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
  design: async ([op,session,url,version,row,value,timestamp], _store, storage) => {
    const empty={operation:op,historyChanged:false,instances:1,draftCount:0,draftState:'',draftError:'',canApply:false,ok:false,error:'',session,origin:'',bridgeOrigin:'',tree:[],crumbs:[],selectedLabel:'',restoring:false,selecting:false,source:'',component:'',version:0,selectionRevision:0,message:'',rows:[],availableProperties:[],canUndo:false,applied:false,draftFiles:[],spacingId:'',spacingPlan:'',spacingFrame:'',spacingInputs:[]};
    try {
      await drafts.load(storage.fs);
      const origin=url?new URL(url).origin:designOrigins.get(session)??'';
      const previous=drafts.get(origin);
      const draftState=op==='open'?previous:'';
      if(['edit','field','spacing','override','add-property','undo','revert','discard','apply'].includes(op))await history.load(storage.fs);
      const response=await fetch(`${DISCOVERY_API}/design`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({op,session,url:origin,version,row:op==='open'?scoped(row):row,value,draftState})});
      let result=await response.json();
      if(typeof result.spacingFrame==='string')result.spacingFrame=unscoped(result.spacingFrame);
      if(!result.ok&&designViews.has(session))result={...designViews.get(session),...result,historyChanged:false};
      if(op==='open'&&result.ok){designOrigins.set(result.session,origin);if(result.bridgeOrigin)previewBridges.set(origin,result.bridgeOrigin);}
      if(result.ok&&typeof result.draftState==='string'&&origin){
        const changes=draftChanges(previous,result.draftState,op==='apply');
        if(['edit','field','spacing','override','add-property','undo','revert','discard','apply'].includes(op)&&changes.length){
          await history.append(storage.fs,{time:new Date(timestamp).toISOString(),kind:op==='apply'?'apply':op==='undo'?'undo':op==='revert'?'revert':op==='discard'?'discard':'draft',project:origin,label:op==='apply'?'Apply to code':op==='undo'?'Undo draft':op==='revert'?'Revert change':op==='discard'?'Discard draft':'Edit '+[...new Set(changes.map(c=>c.property))].join(', '),target:result.selectedLabel||result.source||'App design',changes,beforeState:previous,afterState:result.draftState});
          result.historyChanged=true;
        }
        await drafts.save(storage.fs,origin,result.draftState);
      }
      if(result.ok&&op!=='close')designViews.set(result.session??session,result);
      if(op==='close'){designOrigins.delete(session);designViews.delete(session);}
      return {...empty,...result,draftFiles:draftReview(result.draftState??''),operation:op,origin:op==='open'?origin:'',session:op==='close'?'':result.session??session};
    } catch(e) {
      if((e as {code?:string}).code==='bake') throw e;
      const last=designViews.get(session);
      return {...empty,...last,draftFiles:draftReview(last?.draftState??''),operation:op,ok:false,historyChanged:false,error:e instanceof Error?e.message:'Could not reach the editing helper. Reconnect before making another change.'};
    }
  },
  discover: async ([owner,existing,revision]) => {
    if(!owner) return {owner,routes:[],error:''};
    try {
      const result=await discoverProject(owner,revision), added=new Set(existing);
      return {owner,routes:result.routes.map(route=>({...route,added:added.has(route.route)})),error:result.error};
    } catch(e) {
      if((e as {code?:string}).code==='bake') throw e;
      return {owner,routes:[],error:'Discovery is unavailable. Run bun run dev, or enter a route below.'};
    }
  },
  library: async ([op,name,value,preset,show,timestamp], _store, storage) => {
    await persistence.load(storage.fs);
    await history.load(storage.fs);
    const before=JSON.stringify(editor.document);
    try {
      if(op==='connect') editor.connectProject(name,value);
      else if(op==='disconnect') editor.disconnectProject();
      else if(op==='add' || op==='blank') editor.addScreen(name,value,preset,op==='add');
      else if(op==='setup') {
        const url=projectUrl(value),found=await discoverProject(url,discoveryCache?.owner===url?discoveryCache.revision:0);
        if(found.error&&!found.routes.length) return reply(false,found.error);
        if(!editor.setupProject(name,url,found.routes.map(r=>({name:r.name,route:r.route})),preset||'Core',show.split(','))) return reply(false,'That project lists no screens to add.');
      }
      else if(op==='add-all') {
        const found=await discoverProject(editor.document.project.url,discoveryCache?.owner===editor.document.project.url?discoveryCache.revision:0);
        const added=new Set(editor.document.screens.map(s=>s.route));
        editor.addScreens(found.routes.filter(r=>!r.dynamic&&!added.has(r.route)).map(r=>({name:r.name,route:r.route})),preset,true);
      }
      else return reply(false,'Unknown library action.');
      resizing=false;status='';await persistence.save(storage.fs);await logWorkspace(storage,before,op,name,timestamp);return reply(op==='add'||op==='blank'||op==='add-all'||op==='setup');
    } catch(e) {if((e as {code?:string}).code==='bake')throw e;return reply(false,(e as Error).message);}
  },
  document: async ([since], _store, storage) => {
    setScope(since);
    await persistence.load(storage.fs);
    return snapshot();
  },
  edit: async ([op, key, value, x, y,timestamp], _store, storage) => {
    await persistence.load(storage.fs);
    await history.load(storage.fs);
    const before=JSON.stringify(editor.document),visibilityTarget=op==='hide'||op==='show'?editor.document.screens.find(s=>s.id===key)?.name??editor.document.views.find(v=>v.id===key)?.name:undefined,target=visibilityTarget??editor.target?.name??editor.screen.name;
    status = '';
    if(op === 'select') { editor.select(key); resizing = false; }
    if(op === 'hit') resizing = editor.hit(x,y,9 / Math.max(0.01, Number(value) || 1));
    if(op === 'move') editor.move(x,y,resizing,key === 'snap' ? Number(value) || 1 : 0);
    if(op === 'screen') editor.addView('',true);
    if(op === 'duplicate') editor.addView('',true,true);
    if(op === 'variant') editor.addView(key);
    if(op === 'variants') { try { editor.addViews(key); } catch(e) { status=(e as Error).message; } }
    let merged=false;
    if(op === 'arrange') merged=editor.arrange(key==='settle');
    if(op === 'add') editor.add(key);
    if(op === 'property') { if(key === 'source' && !validSource(value.trim())) status = 'Use an http:// or https:// URL'; else { try { editor.property(key, value); } catch(e) {status=(e as Error).message;} } }
    if(op === 'undo') editor.undo();
    if(op === 'redo') editor.redo();
    if(op === 'delete') editor.remove();
    if(op === 'hide' || op === 'show') editor.setHidden(key, op === 'hide');
    const saved=await persistence.save(storage.fs,op==='save');
    if(saved&&!merged)try{await logWorkspace(storage,before,op,target,timestamp);}catch{status='Could not save the timeline. Your workspace is saved.';}
    if(op==='save'&&saved&&!status)status='Saved';
    return reply(['screen','duplicate','variant','variants'].includes(op)||(op==='arrange'&&key!=='settle')||(op==='property'&&['source','route'].includes(key)));
  },
};
export const answer: Answer = (source, args, store, storage, native) => sources[source](args, store, storage, native);
export const surfaces = { design: 9 };
export function draw(_surface: string, args: unknown[], ctx: Ctx2D, frame: Frame): boolean { render(args, ctx, frame); return false; }
