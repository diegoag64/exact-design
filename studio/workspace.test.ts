import { test, expect } from 'bun:test';
import { WorkspaceEditor, loadWorkspace } from './workspace';
import { resolveDevices } from './devices';
import { initial } from './model';
test('old documents migrate without losing edits',()=>{ const d=initial();d.layers[0].text='Saved';const w=loadWorkspace(d);expect(w.screens[0].layers[0].text).toBe('Saved');expect(loadWorkspace(w)).toEqual(w); });
test('variants share content but retain independent geometry',()=>{const e=new WorkspaceEditor();e.addView('Phone');expect(e.document.screens.length).toBe(1);expect(e.view.width).toBe(390);e.selected='title';e.property('text','Shared');e.select('view-1');expect(e.screen.layers[0].text).toBe('Shared');expect(e.view.width).toBe(720);});
test('duplicated screens are independent and undo restores deleted frames',()=>{const e=new WorkspaceEditor();e.addView('',true,true);e.selected='title';e.property('text','Copy');expect(e.document.screens[0].layers[0].text).not.toBe('Copy');e.select(e.active);e.remove();expect(e.document.views.length).toBe(1);e.undo();expect(e.document.views.length).toBe(2);expect(loadWorkspace(e.document)).toEqual(e.document);});
test('hit testing converts canvas coordinates and respects frame clipping',()=>{const e=new WorkspaceEditor();e.addView('Phone');const v=e.view;e.hit(v.x+90,230);expect(e.selected).toBe('card-title');e.hit(v.x+400,230);expect(e.selected).toBe('');e.hit(v.x+10,-10);expect(e.selected).toBe(v.id);e.move(30,40);expect(e.view.x).toBe(830);expect(e.screen.layers[0].x).toBe(56);});
test('frame resize is one undo step and cannot delete final frame',()=>{const e=new WorkspaceEditor();e.select(e.active);e.move(-900,-900,true);expect(e.view.width).toBe(100);e.undo();expect(e.view.width).toBe(720);e.remove();expect(e.document.views.length).toBe(1);});
test('invalid references and viewport geometry are rejected',()=>{const e=new WorkspaceEditor();e.document.views[0].screenId='missing';expect(()=>loadWorkspace(e.document)).toThrow();e.document.views[0].screenId='screen-1';e.document.views[0].width=Infinity;expect(()=>loadWorkspace(e.document)).toThrow();});

test('fill widths resolve independently and resizing updates the shared right inset',()=>{
  const e=new WorkspaceEditor(); e.addView('Phone'); e.selected='card';
  expect(e.target?.width).toBe(278);
  e.move(20,0,true); expect(e.target?.width).toBe(298);
  e.select('view-1'); e.selected='card'; expect(e.target?.width).toBe(628);
  e.undo(); expect(e.target?.width).toBe(608);
});
test('switching width mode preserves visible geometry and undo restores the constraint',()=>{
  const e=new WorkspaceEditor(); e.addView('Phone'); e.selected='card';
  e.property('widthMode','fixed'); expect(e.target?.width).toBe(278);
  e.select('view-1'); e.selected='card'; expect(e.target?.width).toBe(278);
  e.undo(); expect(e.target?.width).toBe(608);
  e.property('width','500'); expect(e.target?.width).toBe(500);
  e.select('view-2'); e.selected='card'; expect(e.target?.width).toBe(170);
});
test('old layers stay fixed and invalid constraints are rejected without mutating input',()=>{
  const d=initial(); const old=JSON.parse(JSON.stringify(d)); delete old.layers[0].widthMode; delete old.layers[0].right;
  expect(loadWorkspace(old).screens[0].layers[0].widthMode).toBe('fixed'); expect(old.layers[0].widthMode).toBeUndefined();
  d.layers[0].right=NaN; expect(()=>loadWorkspace(d)).toThrow();
});
test('responsive export retains width rules instead of baking the active viewport',()=>{
  const e=new WorkspaceEditor(); const code=e.code(); expect(code).toContain('calc(100% - 112px)');
  e.addView('Phone'); expect(e.code()).toContain('calc(100% - 112px)'); expect(e.code()).toContain('white-space="pre-wrap"');
});

test('live sources are shared across variants and copied with independent screens',()=>{
  const e=new WorkspaceEditor(); e.select(e.active); e.property('source','http://localhost:5174/settings');
  e.addView('Phone'); expect(e.screen.source).toBe('http://localhost:5174/settings'); expect(e.layers).toEqual([]);
  e.addView('',true,true); e.property('source','http://localhost:5174/profile');
  expect(e.document.screens[0].source).toBe('http://localhost:5174/settings');
  expect(loadWorkspace(e.document).screens[1].source).toBe('http://localhost:5174/profile');
  e.undo(); expect(e.screen.source).toBe('http://localhost:5174/settings');
  e.property('source',''); expect(e.layers.length).toBe(6);
});
test('invalid preview URL schemes are rejected',()=>{
  const e=new WorkspaceEditor(); e.select(e.active); e.property('source','javascript:alert(1)'); expect(e.screen.source).toBe('');
  e.document.screens[0].source='data:text/html,bad'; expect(()=>loadWorkspace(e.document)).toThrow();
});
test('device sets add every missing size to a screen in one undo step',()=>{
  const e=new WorkspaceEditor();e.connectProject('Ember','http://127.0.0.1:5174');e.addScreen('Today','/','Phone',true);
  e.addViews('Core');const today=e.document.views.filter(v=>v.screenId===e.screen.id);
  expect(today.map(v=>v.name)).toEqual(['Phone','Tablet','Desktop']);
  e.addViews('Core');expect(e.document.views.filter(v=>v.screenId===e.screen.id).length).toBe(3);
  e.undo();expect(e.document.views.filter(v=>v.screenId===e.screen.id).length).toBe(1);
  e.addView('iPad mini');expect([e.view.width,e.view.height]).toEqual([744,1133]);
  expect(loadWorkspace(e.document)).toEqual(e.document);
});
test('adding many screens lays out one row each and rejects duplicates, parameters and overflow',()=>{
  const e=new WorkspaceEditor();expect(()=>e.addScreens([{name:'Today',route:'/'}],'Core',true)).toThrow('Connect a project');
  e.connectProject('Ember','http://127.0.0.1:5174');
  e.addScreens([{name:'Today',route:'/'},{name:'Diary',route:'/diary'}],'Every size',true);
  expect(e.document.screens.length).toBe(3);expect(e.document.views.length).toBe(27);
  const diary=e.document.screens.find(s=>s.route==='/diary')!,row=e.document.views.filter(v=>v.screenId===diary.id);
  expect(row.map(v=>v.width)).toEqual([...row.map(v=>v.width)].sort((a,b)=>a-b));expect(new Set(row.map(v=>v.y)).size).toBe(1);
  expect(row[1].x).toBe(row[0].width+80);
  e.undo();expect(e.document.screens.length).toBe(1);
  expect(()=>e.addScreens([{name:'A',route:'/a'},{name:'B',route:'/a'}],'Core',true)).toThrow('already');
  expect(()=>e.addScreens([{name:'Note',route:'/note/:id'}],'Core',true)).toThrow('route parameters');
  expect(()=>e.addScreens(Array.from({length:20},(_,i)=>({name:`S${i}`,route:`/s${i}`})),'Every size',true)).toThrow('holds 200');
  expect(e.document.screens.length).toBe(1);
});
test('tidy up stacks one row per screen using displayed content heights',()=>{
  const e=new WorkspaceEditor();e.connectProject('Ember','http://127.0.0.1:5174');
  e.addScreens([{name:'Today',route:'/'},{name:'Diary',route:'/diary'}],'Core',true);
  const today=e.document.views.find(v=>v.name==='Phone'&&e.document.screens.find(s=>s.id===v.screenId)?.route==='/')!;
  e.contentSizes.set(today.id,{source:'http://127.0.0.1:5174/',width:today.width,viewportHeight:today.height,height:2400});
  e.arrange();
  const rows=e.document.screens.map(s=>e.document.views.filter(v=>v.screenId===s.id));
  const todayRow=rows[1],diaryRow=rows[2];
  expect(diaryRow[0].y).toBe(todayRow[0].y+2400+80);expect(todayRow.map(v=>v.x)).toEqual([0,470,1318]);
  e.undo();expect(e.document.screens.length).toBe(3);
});
test('a collage tidy packs screens into columns and keeps the frames of a screen side by side',()=>{
  const e=new WorkspaceEditor();e.connectProject('Ember','http://127.0.0.1:5174');
  e.addScreens(Array.from({length:8},(_,i)=>({name:`S${i}`,route:`/s${i}`})),'Core',true);
  e.arrange(false,true);
  const rows=e.document.screens.map(s=>e.document.views.filter(v=>v.screenId===s.id)).filter(r=>r.length);
  for(const row of rows.filter(r=>r.length>1)){expect(new Set(row.map(v=>v.y)).size).toBe(1);expect(row[1].x).toBe(row[0].x+row[0].width+80);}
  const columns=new Set(rows.map(r=>r[0].x));expect(columns.size).toBeGreaterThan(1);
  const boxes=e.document.views.map(v=>({l:v.x,t:v.y,r:v.x+v.width,b:v.y+v.height}));
  expect(boxes.some((a,i)=>boxes.some((b,j)=>i<j&&a.l<b.r&&b.l<a.r&&a.t<b.b&&b.t<a.b))).toBe(false);
  const wide=Math.max(...boxes.map(b=>b.r))-Math.min(...boxes.map(b=>b.l)),high=Math.max(...boxes.map(b=>b.b))-Math.min(...boxes.map(b=>b.t));
  expect(wide/high).toBeGreaterThan(1);expect(wide/high).toBeLessThan(2.6);
  e.undo();expect(new Set(e.document.views.map(v=>v.x)).size).toBe(3);
});
// Rows of a tidied workspace, as displayed: each screen's frames, its first frame's position, and whether any two frames overlap.
const tidied=(e:WorkspaceEditor)=>{
  const frames=e.frames,rows=e.document.screens.map(s=>frames.filter(v=>v.screenId===s.id).sort((a,b)=>a.x-b.x)).filter(r=>r.length);
  const boxes=frames.map(v=>({l:v.x,t:v.y,r:v.x+v.width,b:v.y+v.height}));
  return {rows,overlap:boxes.some((a,i)=>boxes.some((b,j)=>i<j&&a.l<b.r&&b.l<a.r&&a.t<b.b&&b.t<a.b)),columns:new Set(rows.map(r=>r[0].x)).size};
};
const sideBySide=(rows:ReturnType<typeof tidied>['rows'])=>{for(const row of rows){expect(new Set(row.map(v=>v.y)).size).toBe(1);for(let i=1;i<row.length;i++)expect(row[i].x).toBe(row[i-1].x+row[i-1].width+80);}};
test('switching between single column and collage keeps viewports together with uneven content heights, and each switch undoes in one step',()=>{
  const e=new WorkspaceEditor();e.connectProject('Ember','http://127.0.0.1:5174');
  e.addScreens(Array.from({length:6},(_,i)=>({name:`S${i}`,route:`/s${i}`})),'Core',true);
  // Uneven loaded heights: a long feed, a medium page, and the rest at their device height.
  const phone=(route:string)=>e.document.views.find(v=>v.name==='Phone'&&e.document.screens.find(s=>s.id===v.screenId)?.route===route)!;
  for(const [route,height] of [['/s1',3200],['/s4',1500]] as const){const v=phone(route);e.contentSizes.set(v.id,{source:`http://127.0.0.1:5174${route}`,width:v.width,viewportHeight:v.height,height});}
  const start=JSON.stringify(e.document.views),depth=e.past.length;
  e.arrange(false,true);
  const collage=tidied(e);expect(collage.overlap).toBe(false);expect(collage.columns).toBeGreaterThan(1);sideBySide(collage.rows);
  const collageViews=JSON.stringify(e.document.views);
  e.arrange(false,false);
  const column=tidied(e);expect(column.overlap).toBe(false);expect(column.columns).toBe(1);sideBySide(column.rows);
  // Each row starts below the tallest displayed frame of the row above it.
  for(let i=1;i<column.rows.length;i++)expect(column.rows[i][0].y).toBe(column.rows[i-1][0].y+Math.max(...column.rows[i-1].map(v=>v.height))+80);
  expect(e.past.length).toBe(depth+2);
  e.undo();expect(JSON.stringify(e.document.views)).toBe(collageViews);
  e.undo();expect(JSON.stringify(e.document.views)).toBe(start);
  e.redo();expect(JSON.stringify(e.document.views)).toBe(collageViews);
  e.redo();expect(tidied(e).columns).toBe(1);
  // Tidying again in the same layout changes nothing and adds no undo step.
  e.arrange(false,false);expect(e.past.length).toBe(depth+2);
});
test('a collage settles to late content heights into the bulk add, so one undo removes both',()=>{
  const e=new WorkspaceEditor();e.connectProject('Ember','http://127.0.0.1:5174');
  e.addScreens(Array.from({length:6},(_,i)=>({name:`S${i}`,route:`/s${i}`})),'Core',true);
  const depth=e.past.length,v=e.document.views.find(v=>v.name==='Phone'&&e.document.screens.find(s=>s.id===v.screenId)?.route==='/s0')!;
  expect(e.arrange(true,true)).toBe(true);expect(e.past.length).toBe(depth);
  e.contentSizes.set(v.id,{source:'http://127.0.0.1:5174/s0',width:v.width,viewportHeight:v.height,height:4000});
  expect(e.arrange(true,true)).toBe(false);expect(e.past.length).toBe(depth);
  const settled=tidied(e);expect(settled.overlap).toBe(false);expect(settled.columns).toBeGreaterThan(1);sideBySide(settled.rows);
  const views=JSON.stringify(e.document.views);
  e.undo();expect(e.document.screens.length).toBe(1);
  e.redo();expect(JSON.stringify(e.document.views)).toBe(views);
});
test('choosing a layout settles late measurements into the choice, so one undo restores the previous layout',()=>{
  const e=new WorkspaceEditor();e.connectProject('Ember','http://127.0.0.1:5174');
  e.addScreens(Array.from({length:9},(_,i)=>({name:`S${i}`,route:`/s${i}`})),'Phone',true);
  e.select(e.document.views[0].id);e.property('name','Start');
  const column=JSON.stringify(e.document.views),depth=e.past.length;
  e.arrange(false,true);expect(e.past.length).toBe(depth+1);
  const v=e.document.views.find(v=>e.document.screens.find(s=>s.id===v.screenId)?.route==='/s3')!;
  e.contentSizes.set(v.id,{source:'http://127.0.0.1:5174/s3',width:v.width,viewportHeight:v.height,height:4000});
  expect(tidied(e).overlap).toBe(false);
  expect(e.arrange(true,true)).toBe(false);expect(e.past.length).toBe(depth+1);
  const settled=tidied(e);expect(settled.overlap).toBe(false);expect(settled.columns).toBeGreaterThan(1);
  const views=JSON.stringify(e.document.views);
  e.undo();expect(JSON.stringify(e.document.views)).toBe(column);
  // After an undo, a stale automatic pass cannot overwrite the restored layout.
  e.redo();expect(JSON.stringify(e.document.views)).toBe(views);
  e.undo();expect(e.arrange(true,true)).toBe(false);expect(e.past.length).toBe(depth);expect(JSON.stringify(e.document.views)).toBe(column);
});
test('a single-screen add ends the earlier settling window instead of owning it',()=>{
  const e=new WorkspaceEditor();e.connectProject('Ember','http://127.0.0.1:5174');
  e.addScreens(Array.from({length:9},(_,i)=>({name:`S${i}`,route:`/s${i}`})),'Phone',true);
  e.select(e.document.views[0].id);e.property('name','Start');
  e.arrange(false,true);
  e.addScreen('Blank','','Phone',false);const added=e.past.length,screens=e.document.screens.length;
  const v=e.document.views.find(v=>e.document.screens.find(s=>s.id===v.screenId)?.route==='/s3')!;
  e.contentSizes.set(v.id,{source:'http://127.0.0.1:5174/s3',width:v.width,viewportHeight:v.height,height:4000});
  // Measurements update the arrangement without adding another undo step.
  expect(e.arrange(true,true)).toBe(false);expect(e.past.length).toBe(added);expect(tidied(e).overlap).toBe(false);
  e.undo();expect(e.document.screens.length).toBe(screens-1);e.redo();
  // A screen added with a device set opens its own window and owns the tidy that follows.
  e.addScreen('Set','','Core',false);const owned=e.past.length;
  expect(e.arrange(true,true)).toBe(false);expect(e.past.length).toBe(owned);
  e.undo();expect(e.document.screens.length).toBe(screens);
});
test('device-set additions record their automatic collage in the add undo step',()=>{
  for(const add of [(e:WorkspaceEditor)=>e.addScreen('Set','','Core',false),(e:WorkspaceEditor)=>e.addViews('Every size')]){
    const e=new WorkspaceEditor(),before=JSON.stringify(e.document);
    add(e);const depth=e.past.length;
    expect(e.arrange(true,true)).toBe(true);expect(e.past.length).toBe(depth);
    expect(e.document.arrangedCollage).toBe(true);expect(tidied(e).overlap).toBe(false);
    e.undo();expect(JSON.stringify(e.document)).toBe(before);
    expect(e.arrange(true,true)).toBe(false);expect(JSON.stringify(e.document)).toBe(before);
    e.redo();expect(e.document.arrangedCollage).toBe(true);
  }
});
test('both layouts keep hidden screens below the visible rows, without a gap',()=>{
  for(const collage of [false,true]) {
    const e=new WorkspaceEditor();e.connectProject('Ember','http://127.0.0.1:5174');
    e.addScreens([{name:'Today',route:'/'},{name:'Diary',route:'/diary'},{name:'Profile',route:'/profile'}],'Core',true);
    const screen=(route:string)=>e.document.screens.find(s=>s.route===route)!;
    e.setHidden(screen('/diary').id,true);
    // A screen with one hidden viewport stays in place; its hidden frame keeps its slot in the row.
    const profilePhone=e.document.views.find(v=>v.screenId===screen('/profile').id&&v.name==='Phone')!;e.setHidden(profilePhone.id,true);
    e.arrange(false,collage);
    const {rows,overlap}=tidied(e);expect(overlap).toBe(false);sideBySide(rows);
    const row=(route:string)=>rows.find(r=>r[0].screenId===screen(route).id)!,bottom=(r:typeof rows[number])=>r[0].y+Math.max(...r.map(v=>v.height));
    const visible=rows.filter(r=>r[0].screenId!==screen('/diary').id);
    expect(row('/diary')[0].y).toBe(Math.max(...visible.map(bottom))+80);
    expect(row('/diary')[0].x).toBe(Math.min(...rows.map(r=>r[0].x)));
    if(!collage)expect(row('/profile')[0].y).toBe(bottom(row('/'))+80);
    expect(row('/profile').length).toBe(3);
  }
});
test('automatic layout joins a bulk add, while later measurements and stale passes leave undo alone',()=>{
  const e=new WorkspaceEditor();e.connectProject('Ember','http://127.0.0.1:5174');
  e.addScreens([{name:'Today',route:'/'},{name:'Diary',route:'/diary'}],'Core',true);
  const depth=e.past.length,phone=e.document.views.find(v=>v.name==='Phone'&&e.document.screens.find(s=>s.id===v.screenId)?.route==='/')!;
  // A click before the first automatic choice keeps the bulk add's undo ownership.
  e.hit(phone.x+10,phone.y-10);e.move(0,0);
  expect(e.arrange(true)).toBe(true);expect(e.past.length).toBe(depth);
  const saved=JSON.stringify(e.document);
  for(const height of [2000,3000]){
    e.contentSizes.set(phone.id,{source:'http://127.0.0.1:5174/',width:phone.width,viewportHeight:phone.height,height});
    expect(e.arrange(true)).toBe(false);expect(e.past.length).toBe(depth);
    expect(JSON.stringify(e.document)).toBe(saved);
    const diary=e.frames.find(v=>v.name==='Phone'&&e.document.screens.find(s=>s.id===v.screenId)?.route==='/diary')!;
    expect(diary.y).toBe(e.frames.find(v=>v.id===phone.id)!.y+height+80);
  }
  e.undo();expect(e.document.screens.length).toBe(1);e.redo();
  e.select(phone.id);e.move(30,20);const manual=JSON.stringify(e.document),edited=e.past.length;
  expect(e.document.arranged).toBeUndefined();
  expect(e.arrange(true,true)).toBe(false);expect(e.past.length).toBe(edited);expect(JSON.stringify(e.document)).toBe(manual);
  e.undo();expect(e.document.arranged).toBe(true);expect(tidied(e).overlap).toBe(false);
});
test('collage stays separated as content grows and restores its layout after reload',()=>{
  const e=new WorkspaceEditor();e.connectProject('Ember','http://127.0.0.1:5174');
  e.addScreens(Array.from({length:8},(_,i)=>({name:`S${i}`,route:`/s${i}`})),'Core',true);
  e.arrange(false,true);
  const saved=JSON.stringify(e.document),depth=e.past.length;
  const phone=e.document.views.find(v=>v.name==='Phone'&&e.document.screens.find(s=>s.id===v.screenId)?.route==='/s0')!;
  e.contentSizes.set(phone.id,{source:'http://127.0.0.1:5174/s0',width:phone.width,viewportHeight:phone.height,height:3200});
  const frames=e.frames,boxes=frames.map(v=>({l:v.x,t:v.y,r:v.x+v.width,b:v.y+v.height}));
  expect(boxes.some((a,i)=>boxes.some((b,j)=>i<j&&a.l<b.r&&b.l<a.r&&a.t<b.b&&b.t<a.b))).toBe(false);
  expect(JSON.stringify(e.document)).toBe(saved);expect(e.past.length).toBe(depth);
  const restored=new WorkspaceEditor();restored.document=loadWorkspace(JSON.parse(saved));restored.contentSizes=e.contentSizes;
  expect(restored.frames).toEqual(frames);expect(restored.document.arrangedCollage).toBe(true);
  e.arrange(false,false);expect(e.document.arrangedCollage).toBe(false);
  e.undo();expect(e.document.arrangedCollage).toBe(true);expect(e.frames).toEqual(frames);
});
test('tidy records one layout choice while later measurements stay out of undo and storage',()=>{

  const e=new WorkspaceEditor();e.connectProject('Ember','http://127.0.0.1:5174');
  e.addScreens([{name:'Today',route:'/'},{name:'Diary',route:'/diary'}],'Core',true);
  const depth=e.past.length,phone=e.document.views.find(v=>v.name==='Phone'&&e.document.screens.find(s=>s.id===v.screenId)?.route==='/')!;
  e.arrange();expect(e.past.length).toBe(depth+1);
  const saved=JSON.stringify(e.document);
  for(const height of [2000,3000]){
    e.contentSizes.set(phone.id,{source:'http://127.0.0.1:5174/',width:phone.width,viewportHeight:phone.height,height});
    e.arrange(true);expect(e.past.length).toBe(depth+1);
    expect(JSON.stringify(e.document)).toBe(saved);
    const diary=e.frames.find(v=>v.name==='Phone'&&e.document.screens.find(s=>s.id===v.screenId)?.route==='/diary')!;
    expect(diary.y).toBe(phone.y+height+80);
  }
  e.undo();expect(e.document.arranged).toBeUndefined();expect(e.past.length).toBe(depth);
});
test('project setup connects, adds missing routes once, replaces the untouched starter, and undoes in one step',()=>{
  const e=new WorkspaceEditor();expect(e.isPristine()).toBe(true);
  const routes=[{name:'Today',route:'/'},{name:'Diary',route:'/diary'},{name:'Note',route:'/note/:id'}];
  expect(e.setupProject('Ember','http://127.0.0.1:5174',routes,'Core')).toBe(2);
  expect(e.document.project).toEqual({name:'Ember',url:'http://127.0.0.1:5174'});
  expect(e.document.screens.map(s=>s.name)).toEqual(['Today','Diary']);expect(e.document.views.length).toBe(6);
  expect(e.document.views.some(v=>v.id===e.active)).toBe(true);
  e.setupProject('Ember','http://127.0.0.1:5174',routes,'Core');expect(e.document.views.length).toBe(6);expect(e.past.length).toBe(1);
  e.undo();expect(e.isPristine()).toBe(true);
  // An edited starter stays.
  e.selected='title';e.property('text','Mine');e.setupProject('Ember','http://127.0.0.1:5174',routes,'Phone');
  expect(e.document.screens.map(s=>s.name)).toEqual(['Home','Today','Diary']);
});

test('project setup lays the screens it hides below the visible ones, and the tidy that follows settles into its undo step',()=>{
  const e=new WorkspaceEditor();
  const routes=[{name:'Today',route:'/'},{name:'Welcome',route:'/welcome'},{name:'Diary',route:'/diary'},{name:'Profile',route:'/profile'}];
  e.setupProject('Ember','http://127.0.0.1:5174',routes,'Core',['Welcome','/profile']);
  expect(e.document.screens.map(s=>s.name)).toEqual(['Today','Welcome','Diary','Profile']);
  const top=(name:string)=>e.document.views.find(v=>v.screenId===e.document.screens.find(s=>s.name===name)!.id)!.y;
  expect(top('Welcome')).toBeLessThan(top('Profile'));expect(top('Profile')).toBeLessThan(top('Today'));expect(top('Today')).toBeLessThan(top('Diary'));
  expect(e.isShown(e.active)).toBe(true);
  const before=JSON.stringify(e.document.views);
  expect(e.arrange(true)).toBe(false);expect(e.past.length).toBe(1);expect(JSON.stringify(e.document.views)).toBe(before);
  e.undo();expect(e.isPristine()).toBe(true);
  // A collage after setup settles into the setup's undo step too.
  e.setupProject('Ember','http://127.0.0.1:5174',routes,'Core',['Welcome','/diary','/profile']);
  expect(e.arrange(true,true)).toBe(true);expect(e.past.length).toBe(1);
  const collage=tidied(e);expect(collage.overlap).toBe(false);expect(collage.columns).toBeGreaterThan(1);
  e.undo();expect(e.isPristine()).toBe(true);
});
test('a second setup link that only changes visibility settles its reorder into the same undo step',()=>{
  const e=new WorkspaceEditor();
  const routes=[{name:'Today',route:'/'},{name:'Welcome',route:'/welcome'},{name:'Diary',route:'/diary'},{name:'Profile',route:'/profile'}];
  e.setupProject('Ember','http://127.0.0.1:5174',routes,'Core');
  const views=JSON.stringify(e.document.views),depth=e.past.length;
  // Every screen exists, so this setup adds nothing: it only hides all but a later screen.
  e.setupProject('Ember','http://127.0.0.1:5174',routes,'Core',['/profile']);
  expect(e.past.length).toBe(depth+1);
  for(const collage of [false,true]){expect(e.arrange(true,collage)).toBe(collage);expect(e.past.length).toBe(depth+1);}
  const profile=tidied(e).rows.find(r=>e.document.screens.find(s=>s.id===r[0].screenId)!.route==='/profile')!;
  expect(profile[0].y).toBe(Math.min(...e.document.views.map(v=>v.y)));
  e.undo();expect(e.document.screens.every(s=>!s.hidden)).toBe(true);expect(JSON.stringify(e.document.views)).toBe(views);
});
test('project setup with a show list adds every route but leaves only the listed screens visible, in one undo step',()=>{
  const e=new WorkspaceEditor();
  const routes=[{name:'Today',route:'/'},{name:'Welcome',route:'/welcome'},{name:'Diary',route:'/diary'},{name:'Profile',route:'/profile'}];
  expect(e.setupProject('Ember','http://127.0.0.1:5174',routes,'Core',['today',' /welcome ',''])).toBe(4);
  expect(e.document.screens.filter(s=>!s.hidden).map(s=>s.name)).toEqual(['Today','Welcome']);
  expect(e.shownFrames.length).toBe(6);expect(e.isShown(e.active)).toBe(true);expect(e.past.length).toBe(1);
  // Running it again with a new list re-applies visibility to existing screens, including a screen whose viewports were all hidden.
  for(const v of e.document.views.filter(v=>v.screenId===e.document.screens[2].id)) v.hidden=true;
  e.setupProject('Ember','http://127.0.0.1:5174',routes,'Core',['Diary']);
  expect(e.document.screens.filter(s=>!s.hidden).map(s=>s.name)).toEqual(['Diary']);
  expect(e.shownFrames.length).toBe(3);expect(e.isShown(e.active)).toBe(true);
  // A list that matches nothing leaves visibility alone, so the canvas never starts empty.
  e.setupProject('Ember','http://127.0.0.1:5174',routes,'Core',['Nope']);
  expect(e.shownFrames.length).toBe(3);
  e.undo();e.undo();expect(e.isPristine()).toBe(true);
});

test('hiding screens and viewports removes them from the canvas, hit testing and snapping, and undoes',()=>{
  const e=new WorkspaceEditor(); e.addView('Phone'); e.addView('',true);
  const [first,phone,other]=e.document.views;
  expect(e.setHidden(phone.id,true)).toBe(true);
  expect(e.shownFrames.map(v=>v.id)).toEqual([first.id,other.id]);
  e.hit(phone.x+10,phone.y+10); expect(e.selected).not.toBe(phone.id);
  expect(e.setHidden('screen-1',true)).toBe(true);
  expect(e.shownFrames.map(v=>v.id)).toEqual([other.id]);
  expect(loadWorkspace(e.document)).toEqual(e.document);
  // Showing the screen keeps the viewport that was hidden on its own.
  e.setHidden('screen-1',false); expect(e.shownFrames.map(v=>v.id)).toEqual([first.id,other.id]);
  e.undo(); e.undo(); e.undo(); expect(e.shownFrames.length).toBe(3);
});
test('showing a viewport inside a hidden screen shows only that viewport',()=>{
  const e=new WorkspaceEditor(); e.addView('Phone'); const [first,phone]=e.document.views;
  e.setHidden('screen-1',true); e.setHidden(phone.id,false);
  expect(e.shownFrames.map(v=>v.id)).toEqual([phone.id]);
  expect(e.document.screens[0].hidden).toBeUndefined();
  expect(e.document.views.find(v=>v.id===first.id)!.hidden).toBe(true);
  // Showing a screen whose viewports are all hidden shows them all.
  e.setHidden(phone.id,true); e.setHidden('screen-1',false); expect(e.shownFrames.length).toBe(2);
});
test('invalid visibility flags are rejected',()=>{const e=new WorkspaceEditor();(e.document.views[0] as any).hidden='yes';expect(()=>loadWorkspace(e.document)).toThrow();});

test('native devices are not viewport presets',()=>{
  const e=new WorkspaceEditor();e.setupProject('App','http://127.0.0.1:5176',[{name:'Home',route:'/'}],'Native iOS');
  expect(e.document.views.every(v=>!('platform' in v))).toBe(true);
  expect(resolveDevices('Every size').some(d=>d.name.startsWith('Native'))).toBe(false);
  e.addView('Native iPhone 17');expect(e.view.name).not.toBe('Native iPhone 17');expect('platform' in e.view).toBe(false);
});
test('saved native canvas frames load as editable web frames of the same size',()=>{
  const e=new WorkspaceEditor();e.setupProject('App','http://127.0.0.1:5176',[{name:'Home',route:'/'}],'Phone');
  const saved=structuredClone(e.document) as any;Object.assign(saved.views[0],{name:'Native iPhone 17',width:402,height:874,platform:'ios',heightMode:'fixed'});
  const view=loadWorkspace(saved).views[0]!;
  expect('platform' in view).toBe(false);expect(view).toMatchObject({name:'iPhone 17',width:402,height:874,heightMode:'fixed'});
  expect(loadWorkspace(structuredClone(loadWorkspace(saved)))).toEqual(loadWorkspace(saved));
});
