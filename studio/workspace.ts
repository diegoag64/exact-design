import { projectUrl, screenRoute, screenSource, type Project } from './project';
import { hasRouteParameters } from './discovery';
import { snapMove, FRAME_GAP } from './snapping';
import { Editor, initial, validate, exportContract, resolveLayer, type Layer } from './model';
export type Screen = { id: string; name: string; source: string; route: string; layers: Layer[]; hidden?: boolean };
export type View = { id: string; screenId: string; name: string; x: number; y: number; width: number; height: number; heightMode?: 'content'|'fixed'; hidden?: boolean };
export type Workspace = { version: 2; name: string; project: Project; screens: Screen[]; views: View[] };
import { presets, deviceSets, resolveDevices } from './devices';
export { presets } from './devices';
export type NewScreen = { name: string; route: string };
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
    if(s.hidden!==undefined&&typeof s.hidden!=='boolean') throw new Error('Invalid screen visibility');
    if(typeof s.route !== 'string' || (s.route && (!d.project.url || screenRoute(s.route)!==s.route))) throw new Error('Invalid screen route');
    if (!validSource(s.source)) throw new Error('Invalid preview URL');
    ids.add(s.id); s.layers = validate({version: 1, name: s.name, width:720, height:520, layers:s.layers}).layers;
  }
  for (const v of d.views) {
    if (!v || typeof v.id !== 'string' || !v.id || ids.has(v.id) || typeof v.name !== 'string' || !d.screens.some(s => s.id === v.screenId)) throw new Error('Invalid viewport');
    ids.add(v.id);
    if(v.hidden!==undefined&&typeof v.hidden!=='boolean')throw new Error('Invalid viewport visibility');
    if(v.heightMode!==undefined&&!['content','fixed'].includes(v.heightMode))throw new Error('Invalid viewport height mode');
    if (![v.x,v.y,v.width,v.height].every(Number.isFinite) || v.width < 100 || v.height < 100 || v.width > 10000 || v.height > 10000) throw new Error('Invalid viewport geometry');
  }
  if (d.screens.some(s => !d.views.some(v => v.screenId === s.id))) throw new Error('Screen has no viewport');
  return structuredClone(d);
}
export class WorkspaceEditor {
  document = createWorkspace(); active = 'view-1'; selected = ''; past: Workspace[] = []; future: Workspace[] = []; private settling = false;
  contentSizes=new Map<string,{source:string;width:number;viewportHeight:number;height:number}>();
  get frames(){return this.document.views.map(v=>{const screen=this.document.screens.find(s=>s.id===v.screenId)!,source=screenSource(screen,this.document.project),size=this.contentSizes.get(v.id);return source&&v.heightMode!=='fixed'&&size?.source===source&&size.width===v.width&&size.viewportHeight===v.height?{...v,height:size.height}:v;});}
  /** Frames drawn on the canvas: a viewport is shown when neither it nor its screen is hidden. */
  get shownFrames(){return this.frames.filter(v=>this.isShown(v.id));}
  isShown(viewId: string){const v=this.document.views.find(v=>v.id===viewId);return !!v&&!v.hidden&&!this.document.screens.find(s=>s.id===v.screenId)?.hidden;}
  /** Show or hide a screen (with all its viewports) or a single viewport, as one undo step. */
  setHidden(id: string, hidden: boolean): boolean {
    return this.change(d=>{
      const target=d.screens.find(s=>s.id===id)??d.views.find(v=>v.id===id); if(!target)return;
      if(hidden) target.hidden=true; else delete target.hidden;
      // Showing a viewport inside a hidden screen reveals the screen too, keeping its other viewports' own state.
      // Showing a screen whose viewports are all hidden shows them all, so the screen appears.
      if(!hidden&&!('screenId' in target)&&d.views.every(v=>v.screenId!==id||v.hidden))for(const v of d.views)if(v.screenId===id)delete v.hidden;
      if(!hidden&&'screenId' in target){const s=d.screens.find(s=>s.id===target.screenId);if(s?.hidden){delete s.hidden;for(const v of d.views)if(v.screenId===s.id&&v.id!==id)v.hidden=true;}}
    });
  }
  get frame(){return this.frames.find(v=>v.id===this.active)??this.frames[0];}
  get view() { return this.document.views.find(v => v.id === this.active) ?? this.document.views[0]; }
  get screen() { return this.document.screens.find(s => s.id === this.view.screenId)!; }
  get target() { return this.selected === this.view.id ? this.view : this.layers.find(n => n.id === this.selected); }
  get source() { return screenSource(this.screen,this.document.project); }
  get layers() { return (this.source ? [] : this.screen.layers).map(n=>resolveLayer(n,this.view.width)); }
  /** Apply one undoable edit; returns false when it changed nothing and left no undo step. */
  change(work: (d: Workspace) => void): boolean {
    this.settling = false;
    const next = structuredClone(this.document); work(next);
    if (JSON.stringify(next) === JSON.stringify(this.document)) return false;
    this.past.push(this.document); if (this.past.length > 100) this.past.shift(); this.document = next; this.future = []; this.reconcile();
    return true;
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
    const x=Math.max(...this.frames.map(v=>v.x+v.width))+FRAME_GAP, y=this.view.y;
    const source=structuredClone(this.screen);
    this.change(d=>{
      if(independent) d.screens.push({id:screenId,name:duplicate?`${source.name} copy`:`Screen ${d.screens.length+1}`,source:duplicate?source.source:'',route:duplicate?source.route:'',layers:duplicate?source.layers:[]});
      d.views.push({id,screenId,name:presets[preset]?preset:this.view.name,x,y,width,height,heightMode:presets[preset]?'content':this.view.heightMode});
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
  addScreen(name: string, path: string, preset: string, linked: boolean) { this.addScreens([{name, route: path}], preset, linked); }
  /** Add screens in one undo step: one row each, with a viewport per device in the chosen device or set. */
  addScreens(items: NewScreen[], choice: string, linked: boolean) {
    const sizes = resolveDevices(choice), list = sizes.length ? sizes : [{name: 'Custom', width: 720, height: 520}];
    if(!items.length) throw new Error('There are no screens to add.');
    if(linked && !this.document.project.url) throw new Error('Connect a project first.');
    if(this.document.screens.length+items.length>100 || this.document.views.length+items.length*list.length>200) throw new Error(items.length*list.length>1?`That adds ${items.length*list.length} viewports; a workspace holds 200. Choose fewer sizes or screens.`:'This workspace is full.');
    const seen=new Set(this.document.screens.map(s=>s.route).filter(Boolean)),rows:{name:string;route:string}[]=[];
    for(const item of items) {
      if(!item.name.trim()) throw new Error('Give your screen a name.');
      const route=linked?screenRoute(item.route):'';
      if(route && hasRouteParameters(route)) throw new Error('Replace route parameters with a real path, such as /notes/7.');
      if(route && seen.has(route)) throw new Error('That route is already in your screen library.');
      if(route)seen.add(route); rows.push({name:item.name.trim().slice(0,120),route});
    }
    let y=Math.max(...this.frames.map(v=>v.y+v.height))+FRAME_GAP; let first='';
    this.change(d=>{
      for(const row of rows) {
        const screenId=this.nextId(d,'screen'); d.screens.push({id:screenId,name:row.name,route:row.route,source:'',layers:[]});
        let x=0;
        for(const size of list) {
          const id=this.nextId(d,'view'); first||=id;
          d.views.push({id,screenId,name:size.name,x,y,width:size.width,height:size.height}); x+=size.width+FRAME_GAP;
        }
        y+=Math.max(...list.map(size=>size.height))+FRAME_GAP;
      }
    });
    this.active=first;this.selected=first;
  }
  /** Add each device of a set to the active screen that it does not already show, in one undo step. */
  addViews(choice: string) {
    if(!deviceSets[choice]) return this.addView(choice);
    const screenId=this.view.screenId,shown=this.document.views.filter(v=>v.screenId===screenId);
    const fresh=resolveDevices(choice).filter(size=>!shown.some(v=>v.width===size.width&&v.height===size.height));
    if(!fresh.length) return;
    if(this.document.views.length+fresh.length>200) throw new Error('This workspace is full.');
    let x=Math.max(...this.frames.map(v=>v.x+v.width))+FRAME_GAP; const y=this.view.y; let first='';
    this.change(d=>{for(const size of fresh){const id=this.nextId(d,'view');first||=id;d.views.push({id,screenId,name:size.name,x,y,width:size.width,height:size.height,heightMode:'content'});x+=size.width+FRAME_GAP;}});
    this.active=first;this.selected=first;
  }
  /** Tidy up: one row per screen in library order, using each frame's displayed height so loaded content never overlaps.
   *  Settling passes, repeated while new frames report their heights, merge into the first pass's undo step; returns whether this one merged. */
  arrange(settle=false): boolean {
    const frames=this.frames; if(!frames.length) return false;
    const x0=Math.min(...frames.map(v=>v.x)); let y=Math.min(...frames.map(v=>v.y));
    const at=new Map<string,{x:number;y:number}>();
    for(const screen of this.document.screens) {
      const row=frames.filter(v=>v.screenId===screen.id).sort((a,b)=>a.x-b.x||a.y-b.y); if(!row.length) continue;
      let x=x0; for(const v of row){at.set(v.id,{x,y});x+=v.width+FRAME_GAP;}
      y+=Math.max(...row.map(v=>v.height))+FRAME_GAP;
    }
    const place=(d:Workspace)=>{for(const v of d.views){const p=at.get(v.id);if(p){v.x=Math.round(p.x);v.y=Math.round(p.y);}}};
    if(settle&&this.settling){const next=structuredClone(this.document);place(next);this.document=next;this.future=[];return true;}
    this.settling=this.change(place)&&settle;return false;
  }
  /** True for the untouched starter workspace, which a project setup may replace. */
  isPristine() {
    const fresh=createWorkspace(),d=this.document;
    return !d.project.url&&d.views.length===1&&d.views[0].width===fresh.views[0].width&&d.views[0].height===fresh.views[0].height&&JSON.stringify(d.screens)===JSON.stringify(fresh.screens);
  }
  /** Run several edits as one undo step. */
  batch(work: () => void) {
    const before=this.document,depth=this.past.length;
    try { work(); } finally { if(this.document!==before&&this.past.length>depth){ this.past.length=depth; this.past.push(before); } }
  }
  /** Connect a project and add each of its routes the library lacks, replacing an untouched starter screen; one undo step.
   *  A non-empty `show` (screen names or routes) leaves only the matching project screens visible; with no match, visibility is unchanged. */
  setupProject(name: string, url: string, routes: NewScreen[], choice: string, show: string[] = []) {
    const pristine=this.isPristine(),starter=this.document.screens[0]?.id;
    this.batch(()=>{
      if(this.document.project.url!==projectUrl(url)) this.connectProject(name||'Project',url);
      const have=new Set(this.document.screens.map(s=>s.route)),missing=routes.filter(r=>!hasRouteParameters(r.route)&&!have.has(screenRoute(r.route)));
      if(missing.length) this.addScreens(missing,choice,true);
      if(pristine&&missing.length) this.change(d=>{d.views=d.views.filter(v=>v.screenId!==starter);d.screens=d.screens.filter(s=>s.id!==starter);});
      const wanted=new Set(show.map(entry=>entry.trim().toLowerCase()).filter(Boolean)),listed=(s:Screen)=>wanted.has(s.name.toLowerCase())||wanted.has(s.route);
      if(wanted.size&&this.document.screens.some(s=>s.route&&listed(s))) this.change(d=>{
        for(const s of d.screens) {
          if(!s.route) continue;
          if(!listed(s)) {s.hidden=true;continue;}
          delete s.hidden;
          if(d.views.every(v=>v.screenId!==s.id||v.hidden)) for(const v of d.views) if(v.screenId===s.id) delete v.hidden;
        }
      });
      if(!this.isShown(this.active)){const first=this.shownFrames[0]?.id;if(first){this.active=first;this.selected=first;}}
    });
    this.reconcile();
    return this.document.screens.filter(s=>s.route).length;
  }
  private nextId(d: Workspace, prefix: string) { let i=1; const ids=[...d.views,...d.screens].map(n=>n.id); while(ids.includes(`${prefix}-${i}`)) i++; return `${prefix}-${i}`; }
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
      if(key==='preset' && presets[value]) { [v.width,v.height]=presets[value]; v.name=value;v.heightMode='content'; }
      if(key==='heightMode'&&['content','fixed'].includes(value))v.heightMode=value as 'content'|'fixed';
      if(['x','y','width','height'].includes(key) && value.trim() && Number.isFinite(Number(value))) { const k=key as 'x'|'y'|'width'|'height'; v[k]=Math.round(Math.max(k==='x'||k==='y'?-10000:100,Math.min(10000,Number(value)))); if(k==='width'||k==='height') v.name='Custom';if(k==='height')v.heightMode='fixed'; }
    });
  }
  move(x: number,y: number,resize=false,snapZoom=0) {
    if(!Number.isFinite(x+y)) return;
    if (!resize && snapZoom > 0 && this.selected === this.active) { const snapped=snapMove(this.frame,this.shownFrames,x,y,snapZoom); x=snapped.dx; y=snapped.dy; }
    const id=this.selected, active=this.active,frameHeight=this.frame.height;
    this.change(d=>{ const v=d.views.find(v=>v.id===active)!; const n=id===active?v:d.screens.find(s=>s.id===v.screenId)!.layers.find(n=>n.id===id); if(!n)return;
      if(resize) { if(id!==active && 'widthMode' in n && n.widthMode==='fill') { const current=resolveLayer(n,v.width).width; n.right=v.width-n.x-Math.min(10000,Math.max(1,Math.round(current+x))); } n.width=Math.min(10000,Math.max(id===active?100:1,Math.round(n.width+x))); n.height=Math.min(10000,Math.max(id===active?100:1,Math.round((id===active?frameHeight:n.height)+y))); if(id===active){v.name='Custom';v.heightMode='fixed';} }
      else {n.x=Math.round(n.x+x);n.y=Math.round(n.y+y);}
    });
  }
  hit(x: number,y: number, tolerance=9): boolean {
    const v=this.frame,n=this.isShown(v.id)?(this.selected===v.id?v:this.target):undefined;
    const ox=this.selected===v.id?0:v.x, oy=this.selected===v.id?0:v.y;
    if(n && Math.abs(x-ox-n.x-n.width)<tolerance && Math.abs(y-oy-n.y-n.height)<tolerance) return true;
    for(const f of [...this.shownFrames].reverse()) {
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
