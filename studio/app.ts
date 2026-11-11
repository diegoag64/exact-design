import type { Answer, Sources, Ctx2D, Frame } from './app.contract.d.ts';
import { Editor, validate, exportContract, hitTest } from './model';
import { render } from './render';
const editor = new Editor();
let status = ''; let loaded = false; let resizing = false;
export const grants = 'fs.read app:/data/design.json\nfs.write app:/data/design.json';
const snapshot = () => ({ drawing: JSON.stringify(editor.document.layers), name: editor.document.name, layers: editor.document.layers, selected: editor.selected, canUndo: editor.past.length > 0, canRedo: editor.future.length > 0, code: exportContract(editor.document), status, resizing });
const sources: Sources = {
  document: async (_args, _store, storage) => {
    if (!loaded) {
      try { editor.document = validate(JSON.parse(new TextDecoder().decode(await storage.fs.readFile('app:/data/design.json')))); loaded = true; }
      catch (e) { const code = (e as {code?: string}).code; if(code === 'ENOENT') loaded = true; else if(code !== 'bake') { loaded = true; status = 'Could not open saved document'; } }
    }
    return snapshot();
  },
  edit: async ([op, key, value, x, y], _store, storage) => {
    status = '';
    if(op === 'select') { editor.selected = key; resizing = false; }
    if(op === 'hit') { const n = editor.document.layers.find(n => n.id === editor.selected); resizing = !!n && Math.abs(x - n.x - n.width) < 9 && Math.abs(y - n.y - n.height) < 9; if (!resizing) editor.selected = hitTest(editor.document, x, y); }
    if(op === 'move') { if(resizing) editor.change(d => { const n=d.layers.find(n=>n.id===editor.selected); if(n) { n.width=Math.max(1,Math.round(n.width+x)); n.height=Math.max(1,Math.round(n.height+y)); } }); else editor.move(x,y); }
    if(op === 'add') editor.add(key);
    if(op === 'property') editor.property(key, value);
    if(op === 'undo') editor.undo();
    if(op === 'redo') editor.redo();
    if(op === 'delete') editor.remove();
    if(op === 'save') {
      try { await storage.fs.atomicWriteFile('app:/data/design.json', new TextEncoder().encode(JSON.stringify(editor.document))); status = 'Saved'; }
      catch { status = 'Could not save document'; }
    }
    return { ok: true };
  },
};
export const answer: Answer = (source, args, store, storage, native) => sources[source](args, store, storage, native);
export const surfaces = { design: 8 };
export function draw(_surface: string, args: unknown[], ctx: Ctx2D, frame: Frame): boolean { render(args, ctx, frame); return false; }
