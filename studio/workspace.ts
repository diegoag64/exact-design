import { projectUrl, screenRoute, screenSource, type Project } from './project';
import { hasRouteParameters } from './discovery';
import { snapMove, FRAME_GAP } from './snapping';
import { Editor, initial, validate, exportContract, resolveLayer, type Layer } from './model';
export type Screen = { id: string; name: string; source: string; route: string; layers: Layer[] };
export type View = { id: string; screenId: string; name: string; x: number; y: number; width: number; height: number };
export type Workspace = { version: 2; name: string; project: Project; screens: Screen[]; views: View[] };
export const presets: Record<string, [number, number]> = { Phone: [390, 844], Tablet: [768, 1024], Desktop: [1440, 900] };
export const createWorkspace = (): Workspace => ({ version: 2, name: 'Untitled', project: {name: '', url: ''}, screens: [{ id: 'screen-1', name: 'Home', source: '', route: '', layers: initial().layers.map(n => n.kind === 'button' ? n : {...n, widthMode: 'fill', right: 720 - n.x - n.width, fontSize: n.id === 'title' ? 28 : n.id === 'card-title' ? 18 : n.fontSize, height: n.id === 'card-title' ? 44 : n.id === 'card-copy' ? 48 : n.height}) }], views: [{ id: 'view-1', screenId: 'screen-1', name: 'Custom', x: 0, y: 0, width: 720, height: 520 }] });
export function loadWorkspace(value: unknown): Workspace {
  if ((value as {version?: number})?.version === 1) {
    const old = validate(value), next = createWorkspace();
    next.name = old.name; next.screens[0].layers = old.layers; return next;
  }
  const d = structuredClone(value) as Workspace;
  if (!d || d.version !== 2 || typeof d.name !== 'string' || !Array.isArray(d.screens) || !Array.isArray(d.views) || !d.views.length || !d.screens.length || d.views.length > 200 || d.screens.length > 100) throw new Error('Invalid workspace');
  d.project ??= {name:'',url:''};
  if(typeof d.project.name !== 'string' || typeof d.project.url !== 'string' || (d.project.url && (!d.project.name.trim() || projectUrl(d.project.url)!==d.project.url))) throw new Error('Invalid project');
  const ids = new Set<string>();
  for (const s of d.screens) {
    if (!s || typeof s.id !== 'string' || !s.id || ids.has(s.id) || typeof s.name !== 'string') throw new Error('Invalid screen');
    s.source ??= ''; s.route ??= '';
    if(typeof s.route !== 'string' || (s.route && (!d.project.url || screenRoute(s.route)!==s.route))) throw new Error('Invalid screen route');
    if (!validSource(s.source)) throw new Error('Invalid preview URL');
    ids.add(s.id); s.layers = validate({version: 1, name: s.name, width:720, height:520, layers:s.layers}).layers;
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
  get target() { return this.selected === this.view.id ? this.view : this.layers.find(n => n.id === this.selected); }
  get source() { return screenSource(this.screen,this.document.project); }
  get layers() { return (this.source ? [] : this.screen.layers).map(n=>resolveLayer(n,this.view.width)); }
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
    const x=Math.max(...this.document.views.map(v=>v.x+v.width))+FRAME_GAP, y=this.view.y;
    const source=structuredClone(this.screen);
    this.change(d=>{
      if(independent) d.screens.push({id:screenId,name:duplicate?`${source.name} copy`:`Screen ${d.screens.length+1}`,source:duplicate?source.source:'',route:duplicate?source.route:'',layers:duplicate?source.layers:[]});
      d.views.push({id,screenId,name:presets[preset]?preset:this.view.name,x,y,width,height});
    });
    this.active=id; this.selected=id;
  }
  connectProject(name: string, value: string) {
    if(!name.trim()) throw new Error('Give your project a name.');
    const url=projectUrl(value);
    this.change(d=>{
      d.project={name:name.trim().slice(0,120),url};
      for(const screen of d.screens) {
        if(!screen.route && (screen.source===url || screen.source.startsWith(url+'/'))) {
          screen.route=screen.source.slice(url.length)||'/'; screen.source='';
        }
      }
    });
  }
  disconnectProject() {
    this.change(d=>{
      for(const screen of d.screens) if(screen.route) {screen.source=screenSource(screen,d.project);screen.route='';}
      d.project={name:'',url:''};
    });
  }
  addScreen(name: string, path: string, preset: string, linked: boolean) {
    if(!name.trim()) throw new Error('Give your screen a name.');
    if(this.document.screens.length>=100 || this.document.views.length>=200) throw new Error('This workspace is full.');
    if(linked && !this.document.project.url) throw new Error('Connect a project first.');
    const route=linked?screenRoute(path):'';
    if(route && hasRouteParameters(route)) throw new Error('Replace route parameters with a real path, such as /notes/7.');
    if(route && this.document.screens.some(s=>s.route===route)) throw new Error('That route is already in your screen library.');
    const id=this.id('view'),screenId=this.id('screen');
    const [width,height]=presets[preset]??[720,520];
    const y=Math.max(...this.document.views.map(v=>v.y+v.height))+FRAME_GAP;
    this.change(d=>{
      d.screens.push({id:screenId,name:name.trim().slice(0,120),route,source:'',layers:[]});
      d.views.push({id,screenId,name:presets[preset]?preset:'Custom',x:0,y,width,height});
    });
    this.active=id;this.selected=id;
  }
  layerEdit(work: (e: Editor)=>void) {
    const e=new Editor(); e.document={version:1,name:this.screen.name,width:this.view.width,height:this.view.height,layers:structuredClone(this.screen.layers)}; e.selected=this.selected;
    work(e); const screenId=this.screen.id;
    this.change(d=>{ d.screens.find(s=>s.id===screenId)!.layers=e.document.layers; }); this.selected=e.selected;
  }
  add(kind: string) { if(this.source)return; this.layerEdit(e=>e.add(kind)); }
  remove() {
    if(this.selected!==this.view.id) { this.layerEdit(e=>e.remove()); return; }
    if(this.document.views.length===1) return;
    const id=this.active; this.change(d=>{d.views=d.views.filter(v=>v.id!==id); d.screens=d.screens.filter(s=>d.views.some(v=>v.screenId===s.id));}); this.selected='';
  }
  property(key: string,value: string) {
    if(this.selected!==this.view.id) {
      const id=this.selected, screenId=this.screen.id, width=this.view.width;
      if(key==='widthMode' && ['fixed','fill'].includes(value)) {
        this.change(d=>{ const n=d.screens.find(s=>s.id===screenId)!.layers.find(n=>n.id===id); if(!n)return;
          const current=resolveLayer(n,width).width; n.width=current; n.right=width-n.x-current; n.widthMode=value;
        });
      } else if(key==='width' && this.target && this.screen.layers.find(n=>n.id===id)?.widthMode==='fill') {
        if(value.trim() && Number.isFinite(Number(value))) this.change(d=>{const n=d.screens.find(s=>s.id===screenId)!.layers.find(n=>n.id===id)!; n.width=Math.max(1,Math.min(10000,Math.round(Number(value))));n.right=width-n.x-n.width;});
      } else this.layerEdit(e=>e.property(key,value));
      return;
    }
    const id=this.active;
    this.change(d=>{ const v=d.views.find(v=>v.id===id)!;
      if(key==='source' && validSource(value.trim())) { const s=d.screens.find(s=>s.id===v.screenId)!; s.source=value.trim();s.route=''; }
      if(key==='route' && d.project.url) d.screens.find(s=>s.id===v.screenId)!.route=screenRoute(value);
      if(key==='name' && value.trim()) d.screens.find(s=>s.id===v.screenId)!.name=value.trim().slice(0,120);
      if(key==='preset' && presets[value]) { [v.width,v.height]=presets[value]; v.name=value; }
      if(['x','y','width','height'].includes(key) && value.trim() && Number.isFinite(Number(value))) { const k=key as 'x'|'y'|'width'|'height'; v[k]=Math.round(Math.max(k==='x'||k==='y'?-10000:100,Math.min(10000,Number(value)))); if(k==='width'||k==='height') v.name='Custom'; }
    });
  }
  move(x: number,y: number,resize=false,snapZoom=0) {
    if(!Number.isFinite(x+y)) return;
    if (!resize && snapZoom > 0 && this.selected === this.active) { const snapped=snapMove(this.view,this.document.views,x,y,snapZoom); x=snapped.dx; y=snapped.dy; }
    const id=this.selected, active=this.active;
    this.change(d=>{ const v=d.views.find(v=>v.id===active)!; const n=id===active?v:d.screens.find(s=>s.id===v.screenId)!.layers.find(n=>n.id===id); if(!n)return;
      if(resize) { if(id!==active && 'widthMode' in n && n.widthMode==='fill') { const current=resolveLayer(n,v.width).width; n.right=v.width-n.x-Math.min(10000,Math.max(1,Math.round(current+x))); } n.width=Math.min(10000,Math.max(id===active?100:1,Math.round(n.width+x))); n.height=Math.min(10000,Math.max(id===active?100:1,Math.round(n.height+y))); if(id===active)v.name='Custom'; }
      else {n.x=Math.round(n.x+x);n.y=Math.round(n.y+y);}
    });
  }
  hit(x: number,y: number, tolerance=9): boolean {
    const n=this.target, v=this.view;
    const ox=this.selected===v.id?0:v.x, oy=this.selected===v.id?0:v.y;
    if(n && Math.abs(x-ox-n.x-n.width)<tolerance && Math.abs(y-oy-n.y-n.height)<tolerance) return true;
    for(const f of [...this.document.views].reverse()) {
      if(x<f.x || x>f.x+f.width || y<f.y-tolerance*3 || y>f.y+f.height) continue;
      this.active=f.id;
      const layer=y>=f.y?[...this.layers].reverse().find(n=>x-f.x>=n.x && y-f.y>=n.y && x-f.x<=n.x+n.width && y-f.y<=n.y+n.height):undefined;
      this.selected=layer?.id??f.id; return false;
    }
    this.selected='';return false;
  }
  code() { if(this.source)return ''; return exportContract({version:1,name:this.screen.name,width:this.view.width,height:this.view.height,layers:this.screen.layers}); }
}

export function validSource(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 2048 && (value === '' || /^https?:\/\/[^\s/?#]+(?:[/?#][^\s]*)?$/.test(value));
}
