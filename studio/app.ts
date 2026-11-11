import type { Answer, Sources, Ctx2D, Frame } from './app.contract.d.ts';
import { WorkspaceEditor, validSource } from './workspace';
import { WorkspacePersistence } from './persistence';
import { decodeSpacing } from './spacing';
import { screenSource } from './project';
import { parseRoutes, type DiscoveredScreen } from './discovery';
import { snapTargets } from './snapping';
import { render } from './render';
const editor = new WorkspaceEditor();
const persistence = new WorkspacePersistence(editor);
let status = ''; let resizing = false;
export const DISCOVERY_API = 'http://127.0.0.1:5175';
export const grants = `fs.read app:/data/design.json\nfs.write app:/data/design.json\nnet.fetch ${DISCOVERY_API}`;
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
  const document = editor.document;
  const screens = new Map(document.screens.map(screen => [screen.id, {...screen, source:screenSource(screen,document.project)}]));
  const targets = editor.selected === editor.active ? snapTargets(editor.view, document.views) : {x: [], y: []};
  return {
    frameX: editor.view.x, frameY: editor.view.y, snapX: targets.x, snapY: targets.y,
    drawing: JSON.stringify({...document, screens:[...screens.values()], active: editor.active}),
    projectName: document.project.name, projectUrl: document.project.url, route: editor.screen.route,
    groups: [...screens.values()].map(screen=>({id:screen.id,name:screen.name,route:screen.route,source:screen.source,
      views:document.views.filter(v=>v.screenId===screen.id).map(({id,name,x,y,width,height})=>({id,name,x,y,width,height})),
      layers:editor.screen.id===screen.id && !screen.source ? editor.layers : []})),
    name: document.name,
    layers: editor.layers,
    views: document.views.map(view => {
      const screen = screens.get(view.screenId)!;
      let previewSource=screen.source;
      if(previewSource){const u=new URL(previewSource),bridge=previewBridges.get(u.origin);if(bridge){u.host=new URL(bridge).host;u.searchParams.set('__ed_frame',view.id);previewSource=u.href;}}
      return {...view, source: screen.source, previewSource, layers: screen.source ? [] : screen.layers, screenName: screen.name};
    }),
    active: editor.active, screenId: editor.screen.id, source: editor.source,
    frameSelected: editor.selected === editor.active,
    width: editor.view.width, height: editor.view.height, screenName: editor.screen.name,
    minX: Math.min(...document.views.map(view => view.x)),
    minY: Math.min(...document.views.map(view => view.y)),
    maxX: Math.max(...document.views.map(view => view.x + view.width)),
    maxY: Math.max(...document.views.map(view => view.y + view.height)),
    selected: editor.selected, canUndo: editor.past.length > 0, canRedo: editor.future.length > 0,
    code: editor.code(), status: persistence.error || status, resizing,
  };
};
const reply = (fit=false,error='') => {
  const d=snapshot();
  return {ok:error==='',error,fit,minX:d.minX,minY:d.minY,maxX:d.maxX,maxY:d.maxY};
};
const sources: Sources = {
  spacingMeasure: ([frame,payload]) => decodeSpacing(frame,payload),
  design: async ([op,session,url,version,row,value]) => {
    const empty={ok:false,error:'',session,origin:'',bridgeOrigin:'',tree:[],crumbs:[],selectedLabel:'',restoring:false,selecting:false,source:'',component:'',version:0,message:'',rows:[],canUndo:false,applied:false,spacingId:'',spacingPlan:'',spacingFrame:'',spacingConfig:'',spacingInputs:[]};
    try {
      const origin=url?new URL(url).origin:'';
      const response=await fetch(`${DISCOVERY_API}/design`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({op,session,url:origin,version,row,value})});
      const result=await response.json();
      if(op==='open'&&result.ok&&result.bridgeOrigin)previewBridges.set(origin,result.bridgeOrigin);
      return {...empty,...result,origin:op==='open'?origin:'',session:op==='close'?'':result.session??session};
    } catch(e) {
      if((e as {code?:string}).code==='bake') throw e;
      return {...empty,error:'Could not reach the editing helper. Reconnect before making another change.'};
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
    if(op === 'hit') resizing = editor.hit(x,y,9 / Math.max(0.05, Number(value) || 1));
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
    return reply(['screen','duplicate','variant'].includes(op));
  },
};
export const answer: Answer = (source, args, store, storage, native) => sources[source](args, store, storage, native);
export const surfaces = { design: 9 };
export function draw(_surface: string, args: unknown[], ctx: Ctx2D, frame: Frame): boolean { render(args, ctx, frame); return false; }
