import { Editor, initial, validate, exportContract, type Layer } from './model';
export type Screen = { id: string; name: string; layers: Layer[] };
export type View = { id: string; screenId: string; name: string; x: number; y: number; width: number; height: number };
export type Workspace = { version: 2; name: string; screens: Screen[]; views: View[] };
export const presets: Record<string, [number, number]> = { Phone: [390, 844], Tablet: [768, 1024], Desktop: [1440, 900] };
export const createWorkspace = (): Workspace => ({ version: 2, name: 'Untitled', screens: [{ id: 'screen-1', name: 'Home', layers: initial().layers }], views: [{ id: 'view-1', screenId: 'screen-1', name: 'Custom', x: 0, y: 0, width: 720, height: 520 }] });
export function loadWorkspace(value: unknown): Workspace {
  if ((value as {version?: number})?.version === 1) {
    const old = validate(value), next = createWorkspace();
    next.name = old.name; next.screens[0].layers = old.layers; return next;
  }
  const d = value as Workspace;
  if (!d || d.version !== 2 || typeof d.name !== 'string' || !Array.isArray(d.screens) || !Array.isArray(d.views) || !d.views.length || !d.screens.length || d.views.length > 200 || d.screens.length > 100) throw new Error('Invalid workspace');
  const ids = new Set<string>();
  for (const s of d.screens) {
    if (!s || typeof s.id !== 'string' || !s.id || ids.has(s.id) || typeof s.name !== 'string') throw new Error('Invalid screen');
    ids.add(s.id); validate({version: 1, name: s.name, width:720, height:520, layers:s.layers});
  }
  for (const v of d.views) {
    if (!v || typeof v.id !== 'string' || !v.id || ids.has(v.id) || typeof v.name !== 'string' || !d.screens.some(s => s.id === v.screenId)) throw new Error('Invalid viewport');
    ids.add(v.id);
    if (![v.x,v.y,v.width,v.height].every(Number.isFinite) || v.width < 100 || v.height < 100 || v.width > 10000 || v.height > 10000) throw new Error('Invalid viewport geometry');
  }
  if (d.screens.some(s => !d.views.some(v => v.screenId === s.id))) throw new Error('Screen has no viewport');
  return structuredClone(d);
}
export class WorkspaceEditor {
  document = createWorkspace(); active = 'view-1'; selected = ''; past: Workspace[] = []; future: Workspace[] = [];
  get view() { return this.document.views.find(v => v.id === this.active) ?? this.document.views[0]; }
  get screen() { return this.document.screens.find(s => s.id === this.view.screenId)!; }
  get target() { return this.selected === this.view.id ? this.view : this.screen.layers.find(n => n.id === this.selected); }
  change(work: (d: Workspace) => void) {
    const next = structuredClone(this.document); work(next);
    if (JSON.stringify(next) === JSON.stringify(this.document)) return;
    this.past.push(this.document); if (this.past.length > 100) this.past.shift(); this.document = next; this.future = []; this.reconcile();
  }
  reconcile() { if (!this.document.views.some(v => v.id === this.active)) this.active = this.document.views[0].id; if (!this.target) this.selected = ''; }
  undo() { const d=this.past.pop(); if(d) { this.future.push(this.document); this.document=d; this.reconcile(); } }
  redo() { const d=this.future.pop(); if(d) { this.past.push(this.document); this.document=d; this.reconcile(); } }
  select(id: string) { if(this.document.views.some(v=>v.id===id)) this.active=id; this.selected=id; }
  private id(prefix: string) { let i=1; const ids=[...this.document.views,...this.document.screens].map(n=>n.id); while(ids.includes(`${prefix}-${i}`)) i++; return `${prefix}-${i}`; }
  addView(preset: string, independent = false, duplicate = false) {
    if(this.document.views.length >= 200 || (independent && this.document.screens.length >= 100)) return;
    const id=this.id('view'), screenId=independent?this.id('screen'):this.view.screenId;
    const [width,height]=presets[preset] ?? [this.view.width,this.view.height];
    const x=Math.max(...this.document.views.map(v=>v.x+v.width))+80, y=this.view.y;
    const source=structuredClone(this.screen);
    this.change(d=>{
      if(independent) d.screens.push({id:screenId,name:duplicate?`${source.name} copy`:`Screen ${d.screens.length+1}`,layers:duplicate?source.layers:[]});
      d.views.push({id,screenId,name:presets[preset]?preset:this.view.name,x,y,width,height});
    });
    this.active=id; this.selected=id;
  }
  layerEdit(work: (e: Editor)=>void) {
    const e=new Editor(); e.document={version:1,name:this.screen.name,width:this.view.width,height:this.view.height,layers:structuredClone(this.screen.layers)}; e.selected=this.selected;
    work(e); const screenId=this.screen.id;
    this.change(d=>{ d.screens.find(s=>s.id===screenId)!.layers=e.document.layers; }); this.selected=e.selected;
  }
  add(kind: string) { this.layerEdit(e=>e.add(kind)); }
  remove() {
    if(this.selected!==this.view.id) { this.layerEdit(e=>e.remove()); return; }
    if(this.document.views.length===1) return;
    const id=this.active; this.change(d=>{d.views=d.views.filter(v=>v.id!==id); d.screens=d.screens.filter(s=>d.views.some(v=>v.screenId===s.id));}); this.selected='';
  }
  property(key: string,value: string) {
    if(this.selected!==this.view.id) {this.layerEdit(e=>e.property(key,value)); return;}
    const id=this.active;
    this.change(d=>{ const v=d.views.find(v=>v.id===id)!;
      if(key==='name' && value.trim()) d.screens.find(s=>s.id===v.screenId)!.name=value.trim().slice(0,120);
      if(key==='preset' && presets[value]) { [v.width,v.height]=presets[value]; v.name=value; }
      if(['x','y','width','height'].includes(key) && value.trim() && Number.isFinite(Number(value))) { const k=key as 'x'|'y'|'width'|'height'; v[k]=Math.round(Math.max(k==='x'||k==='y'?-10000:100,Math.min(10000,Number(value)))); if(k==='width'||k==='height') v.name='Custom'; }
    });
  }
  move(x: number,y: number,resize=false) {
    if(!Number.isFinite(x+y)) return;
    const id=this.selected, active=this.active;
    this.change(d=>{ const v=d.views.find(v=>v.id===active)!; const n=id===active?v:d.screens.find(s=>s.id===v.screenId)!.layers.find(n=>n.id===id); if(!n)return;
      if(resize) { n.width=Math.min(10000,Math.max(id===active?100:1,Math.round(n.width+x))); n.height=Math.min(10000,Math.max(id===active?100:1,Math.round(n.height+y))); if(id===active)v.name='Custom'; }
      else {n.x=Math.round(n.x+x);n.y=Math.round(n.y+y);}
    });
  }
  hit(x: number,y: number, tolerance=9): boolean {
    const n=this.target, v=this.view;
    const ox=this.selected===v.id?0:v.x, oy=this.selected===v.id?0:v.y;
    if(n && Math.abs(x-ox-n.x-n.width)<tolerance && Math.abs(y-oy-n.y-n.height)<tolerance) return true;
    for(const f of [...this.document.views].reverse()) {
      if(x<f.x || x>f.x+f.width || y<f.y-26 || y>f.y+f.height) continue;
      this.active=f.id;
      const layer=y>=f.y?[...this.screen.layers].reverse().find(n=>x-f.x>=n.x && y-f.y>=n.y && x-f.x<=n.x+n.width && y-f.y<=n.y+n.height):undefined;
      this.selected=layer?.id??f.id; return false;
    }
    this.selected='';return false;
  }
  code() { return exportContract({version:1,name:this.screen.name,width:this.view.width,height:this.view.height,layers:this.screen.layers}); }
}
