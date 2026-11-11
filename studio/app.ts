import type { Answer, Sources, Ctx2D, Frame } from './app.contract.d.ts';
import { WorkspaceEditor, loadWorkspace } from './workspace';
import { render } from './render';
const editor = new WorkspaceEditor();
let status = ''; let loaded = false; let resizing = false;
export const grants = 'fs.read app:/data/design.json\nfs.write app:/data/design.json';
const snapshot = () => ({ drawing: JSON.stringify({ ...editor.document, active: editor.active }), name: editor.document.name, layers: editor.layers, views: editor.document.views.map(v => ({...v, layers: editor.document.screens.find(s=>s.id===v.screenId)!.layers, screenName: editor.document.screens.find(s=>s.id===v.screenId)!.name})), active: editor.active, screenId: editor.screen.id, frameSelected: editor.selected === editor.active, width: editor.view.width, height: editor.view.height, screenName: editor.screen.name, minX: Math.min(...editor.document.views.map(v=>v.x)), minY: Math.min(...editor.document.views.map(v=>v.y)), maxX: Math.max(...editor.document.views.map(v=>v.x+v.width)), maxY: Math.max(...editor.document.views.map(v=>v.y+v.height)), selected: editor.selected, canUndo: editor.past.length > 0, canRedo: editor.future.length > 0, code: editor.code(), status, resizing });
const sources: Sources = {
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
    if(op === 'move') editor.move(x,y,resizing);
    if(op === 'screen') editor.addView('',true);
    if(op === 'duplicate') editor.addView('',true,true);
    if(op === 'variant') editor.addView(key);
    if(op === 'add') editor.add(key);
    if(op === 'property') editor.property(key, value);
    if(op === 'undo') editor.undo();
    if(op === 'redo') editor.redo();
    if(op === 'delete') editor.remove();
    if(op === 'save') {
      try { await storage.fs.atomicWriteFile('app:/data/design.json', new TextEncoder().encode(JSON.stringify(editor.document))); status = 'Saved'; }
      catch { status = 'Could not save document'; }
    }
    const d=snapshot();
    return { ok: true, fit: ['screen','duplicate','variant'].includes(op), minX:d.minX, minY:d.minY, maxX:d.maxX, maxY:d.maxY };
  },
};
export const answer: Answer = (source, args, store, storage, native) => sources[source](args, store, storage, native);
export const surfaces = { design: 8 };
export function draw(_surface: string, args: unknown[], ctx: Ctx2D, frame: Frame): boolean { render(args, ctx, frame); return false; }
