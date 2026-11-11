import type { Answer, Sources, Ctx2D, Frame } from './app.contract.d.ts';
import { WorkspaceEditor, loadWorkspace, validSource } from './workspace';
import { screenSource } from './project';
import { snapTargets } from './snapping';
import { render } from './render';
const editor = new WorkspaceEditor();
let status = ''; let loaded = false; let resizing = false;
export const grants = 'fs.read app:/data/design.json\nfs.write app:/data/design.json';
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
      return {...view, source: screen.source, layers: screen.source ? [] : screen.layers, screenName: screen.name};
    }),
    active: editor.active, screenId: editor.screen.id, source: editor.source,
    frameSelected: editor.selected === editor.active,
    width: editor.view.width, height: editor.view.height, screenName: editor.screen.name,
    minX: Math.min(...document.views.map(view => view.x)),
    minY: Math.min(...document.views.map(view => view.y)),
    maxX: Math.max(...document.views.map(view => view.x + view.width)),
    maxY: Math.max(...document.views.map(view => view.y + view.height)),
    selected: editor.selected, canUndo: editor.past.length > 0, canRedo: editor.future.length > 0,
    code: editor.code(), status, resizing,
  };
};
const reply = (fit=false,error='') => {
  const d=snapshot();
  return {ok:error==='',error,fit,minX:d.minX,minY:d.minY,maxX:d.maxX,maxY:d.maxY};
};
const sources: Sources = {
  library: async ([op,name,value,preset]) => {
    try {
      if(op==='connect') editor.connectProject(name,value);
      else if(op==='disconnect') editor.disconnectProject();
      else if(op==='add' || op==='blank') editor.addScreen(name,value,preset,op==='add');
      else return reply(false,'Unknown library action.');
      resizing=false;status='';return reply(op==='add'||op==='blank');
    } catch(e) {return reply(false,(e as Error).message);}
  },
  document: async (_args, _store, storage) => {
    if (!loaded) {
      try { editor.document = loadWorkspace(JSON.parse(new TextDecoder().decode(await storage.fs.readFile('app:/data/design.json')))); loaded = true; editor.reconcile(); }
      catch (e) { const code = (e as {code?: string}).code; if(code === 'ENOENT') loaded = true; else if(code !== 'bake') { loaded = true; status = 'Could not open saved document'; } }
    }
    return snapshot();
  },
  edit: async ([op, key, value, x, y], _store, storage) => {
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
    if(op === 'save') {
      try { await storage.fs.atomicWriteFile('app:/data/design.json', new TextEncoder().encode(JSON.stringify(editor.document))); status = 'Saved'; }
      catch { status = 'Could not save document'; }
    }
    return reply(['screen','duplicate','variant'].includes(op));
  },
};
export const answer: Answer = (source, args, store, storage, native) => sources[source](args, store, storage, native);
export const surfaces = { design: 9 };
export function draw(_surface: string, args: unknown[], ctx: Ctx2D, frame: Frame): boolean { render(args, ctx, frame); return false; }
