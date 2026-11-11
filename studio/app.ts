import type { Answer, Sources, Ctx2D, Frame } from './app.contract.d.ts';
import { WorkspaceEditor, validSource } from './workspace';
import { WorkspacePersistence } from './persistence';
import {DraftStorage} from './draft-storage';
import { emptySpacing } from './spacing';
import { screenSource,localPreview } from './project';
import { parseRoutes, type DiscoveredScreen } from './discovery';
import { snapTargets } from './snapping';
import { render } from './render';
const editor = new WorkspaceEditor();
const persistence = new WorkspacePersistence(editor);
const drafts=new DraftStorage();
const designOrigins=new Map<string,string>();
let status = ''; let resizing = false;
export const DISCOVERY_API = 'http://127.0.0.1:5175';
export const grants = `fs.read app:/data/design.json\nfs.write app:/data/design.json\nfs.read app:/data/design-drafts.json\nfs.write app:/data/design-drafts.json\nnet.fetch ${DISCOVERY_API}`;
let discoveryCache: {owner:string;revision:number;routes:DiscoveredScreen[];error:string}|undefined;
const previewBridges=new Map<string,string>();
async function discoverProject(owner:string,revision:number) {
  if(discoveryCache?.owner===owner && discoveryCache.revision===revision) return discoveryCache;
  const response=await fetch(`${DISCOVERY_API}/discover`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({url:owner}),exactTimeout:6000});
  if(!response.ok) throw new Error('Discovery unavailable');
  const body=await response.json();
  if(typeof body.error!=='string' || !Array.isArray(body.routes)) throw new Error('Invalid discovery response');
  const routes=parseRoutes({routes:body.routes.map((r:{name:string;route:string})=>({name:r.name,pattern:r.route}))});
  return discoveryCache={owner,revision,routes,error:body.error};
}
const snapshot = () => {
  const document = editor.document,frames=editor.frames;
  const screens = new Map(document.screens.map(screen => [screen.id, {...screen, source:screenSource(screen,document.project)}]));
  const targets = editor.selected === editor.active ? snapTargets(editor.frame, frames) : {x: [], y: []};
  return {
    frameX: editor.view.x, frameY: editor.view.y, snapX: targets.x, snapY: targets.y,
    drawing: JSON.stringify({...document,views:frames, screens:[...screens.values()], active: editor.active}),
    projectName: document.project.name, projectUrl: document.project.url, route: editor.screen.route,
    groups: [...screens.values()].map(screen=>({id:screen.id,name:screen.name,route:screen.route,source:screen.source,
      views:frames.filter(v=>v.screenId===screen.id).map(({id,name,x,y,width,height})=>({id,name,x,y,width,height})),
      layers:editor.screen.id===screen.id && !screen.source ? editor.layers : []})),
    name: document.name,
    previewRequests:JSON.stringify(document.views.flatMap(v=>{const screen=screens.get(v.screenId)!;return screen.source?[{id:v.id,url:screen.source,width:v.width,height:v.height,auto:localPreview(screen.source)&&v.heightMode!=='fixed'}]:[];})),
    layers: editor.layers,
    views: frames.map(view => {
      const screen = screens.get(view.screenId)!;
      let previewSource=localPreview(screen.source)&&!previewBridges.has(new URL(screen.source).origin)?'':screen.source;
      if(previewSource){const u=new URL(previewSource),bridge=previewBridges.get(u.origin);if(bridge&&bridge!==u.origin){u.host=new URL(bridge).host;u.searchParams.set('__ed_frame',view.id);u.searchParams.set('__ed_height',String(document.views.find(v=>v.id===view.id)!.height));u.searchParams.set('__ed_full',view.heightMode==='fixed'?'0':'1');previewSource=u.href;}}
      const {heightMode,...geometry}=view;
      return {...geometry,canAutoHeight:localPreview(screen.source),autoHeight:localPreview(screen.source)&&view.heightMode!=='fixed', source: screen.source, previewSource, layers: screen.source ? [] : screen.layers, screenName: screen.name};
    }),
    active: editor.active, screenId: editor.screen.id, source: editor.source,
    frameSelected: editor.selected === editor.active,
    width: editor.view.width, height: editor.frame.height, screenName: editor.screen.name,
    minX: Math.min(...frames.map(view => view.x)),
    minY: Math.min(...frames.map(view => view.y)),
    maxX: Math.max(...frames.map(view => view.x + view.width)),
    maxY: Math.max(...frames.map(view => view.y + view.height)),
    selected: editor.selected, canUndo: editor.past.length > 0, canRedo: editor.future.length > 0,
    code: editor.code(), status: persistence.error || status, resizing,
  };
};
const reply = (fit=false,error='') => {
  const d=snapshot();
  return {ok:error==='',error,fit,minX:d.minX,minY:d.minY,maxX:d.maxX,maxY:d.maxY};
};
const sources: Sources = {
  scene: () => snapshot(),
  previews: ([requests]) => {
    if(!requests||requests==='[]')return {ready:true,signature:'[]',requests};
    let latest={ready:false,signature:'',requests};
    return fetch(`${DISCOVERY_API}/previews`,{method:'POST',headers:{'content-type':'application/json'},body:requests,exactStream:event=>{
      if(event.type==='error'){
        for(const frame of JSON.parse(requests)){const origin=new URL(frame.url).origin;if(!previewBridges.has(origin))previewBridges.set(origin,origin);}
        return latest={requests,ready:true,signature:'unavailable'};
      }
      if(event.type!=='message'||typeof event.data!=='string')return latest;
      const result=JSON.parse(event.data);
      for(const frame of result.frames){
        if(frame.previewSource&&frame.source){const origin=new URL(frame.source).origin;const proxy=new URL(frame.previewSource).origin;if(proxy!==origin)previewBridges.set(origin,proxy);}
        if(frame.ready)editor.contentSizes.set(frame.id,{source:frame.source,width:frame.width,viewportHeight:frame.viewportHeight,height:frame.height});
      }
      return latest={requests,ready:!!result.frames.every((f:{ready:boolean})=>f.ready),signature:JSON.stringify(result.frames.map((f:{id:string;height:number;ready:boolean})=>[f.id,f.height,f.ready]))};
    }});
  },
  previewSignal: ([session]) => {
    if(!session)return {revision:0,updateRevision:0,measurement:emptySpacing()};
    return fetch(`${DISCOVERY_API}/design/events?session=${encodeURIComponent(session)}`,{exactStream:event=>{
      if(event.type!=='message'||typeof event.data!=='string')return null;
      return JSON.parse(event.data);
    }});
  },
  design: async ([op,session,url,version,row,value], _store, storage) => {
    const empty={draftCount:0,draftState:'',draftError:'',canApply:false,ok:false,error:'',session,origin:'',bridgeOrigin:'',tree:[],crumbs:[],selectedLabel:'',restoring:false,selecting:false,source:'',component:'',version:0,selectionRevision:0,message:'',rows:[],canUndo:false,applied:false,spacingId:'',spacingPlan:'',spacingFrame:'',spacingInputs:[]};
    try {
      await drafts.load(storage.fs);
      const origin=url?new URL(url).origin:designOrigins.get(session)??'';
      const draftState=op==='open'?drafts.get(origin):'';
      const response=await fetch(`${DISCOVERY_API}/design`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({op,session,url:origin,version,row,value,draftState})});
      const result=await response.json();
      if(op==='open'&&result.ok){designOrigins.set(result.session,origin);if(result.bridgeOrigin)previewBridges.set(origin,result.bridgeOrigin);}
      if(result.ok&&typeof result.draftState==='string'&&origin)await drafts.save(storage.fs,origin,result.draftState);
      if(op==='close')designOrigins.delete(session);
      return {...empty,...result,origin:op==='open'?origin:'',session:op==='close'?'':result.session??session};
    } catch(e) {
      if((e as {code?:string}).code==='bake') throw e;
      return {...empty,error:e instanceof Error?e.message:'Could not reach the editing helper. Reconnect before making another change.'};
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
  library: async ([op,name,value,preset], _store, storage) => {
    await persistence.load(storage.fs);
    try {
      if(op==='connect') editor.connectProject(name,value);
      else if(op==='disconnect') editor.disconnectProject();
      else if(op==='add' || op==='blank') editor.addScreen(name,value,preset,op==='add');
      else return reply(false,'Unknown library action.');
      resizing=false;status='';await persistence.save(storage.fs);return reply(op==='add'||op==='blank');
    } catch(e) {if((e as {code?:string}).code==='bake')throw e;return reply(false,(e as Error).message);}
  },
  document: async (_args, _store, storage) => {
    await persistence.load(storage.fs);
    return snapshot();
  },
  edit: async ([op, key, value, x, y], _store, storage) => {
    await persistence.load(storage.fs);
    status = '';
    if(op === 'select') { editor.select(key); resizing = false; }
    if(op === 'hit') resizing = editor.hit(x,y,9 / Math.max(0.01, Number(value) || 1));
    if(op === 'move') editor.move(x,y,resizing,key === 'snap' ? Number(value) || 1 : 0);
    if(op === 'screen') editor.addView('',true);
    if(op === 'duplicate') editor.addView('',true,true);
    if(op === 'variant') editor.addView(key);
    if(op === 'add') editor.add(key);
    if(op === 'property') { if(key === 'source' && !validSource(value.trim())) status = 'Use an http:// or https:// URL'; else { try { editor.property(key, value); } catch(e) {status=(e as Error).message;} } }
    if(op === 'undo') editor.undo();
    if(op === 'redo') editor.redo();
    if(op === 'delete') editor.remove();
    const saved=await persistence.save(storage.fs,op==='save');
    if(op==='save'&&saved)status='Saved';
    return reply(['screen','duplicate','variant'].includes(op)||(op==='property'&&['source','route'].includes(key)));
  },
};
export const answer: Answer = (source, args, store, storage, native) => sources[source](args, store, storage, native);
export const surfaces = { design: 9 };
export function draw(_surface: string, args: unknown[], ctx: Ctx2D, frame: Frame): boolean { render(args, ctx, frame); return false; }
