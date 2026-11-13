import { test, expect } from 'bun:test';
import { WorkspaceEditor, loadWorkspace } from './workspace';
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
test('settling tidy passes merge into one undo step until another edit',()=>{
  const e=new WorkspaceEditor();e.connectProject('Ember','http://127.0.0.1:5174');
  e.addScreens([{name:'Today',route:'/'},{name:'Diary',route:'/diary'}],'Core',true);
  const depth=e.past.length,phone=e.document.views.find(v=>v.name==='Phone'&&e.document.screens.find(s=>s.id===v.screenId)?.route==='/')!;
  // Already tidy: no undo step, so the next real pass must not merge into an older edit.
  expect(e.arrange(true)).toBe(false);expect(e.past.length).toBe(depth);
  e.contentSizes.set(phone.id,{source:'http://127.0.0.1:5174/',width:phone.width,viewportHeight:phone.height,height:2000});
  expect(e.arrange(true)).toBe(false);expect(e.past.length).toBe(depth+1);
  e.contentSizes.set(phone.id,{source:'http://127.0.0.1:5174/',width:phone.width,viewportHeight:phone.height,height:3000});
  expect(e.arrange(true)).toBe(true);expect(e.past.length).toBe(depth+1);
  const diary=e.document.views.find(v=>v.name==='Phone'&&e.document.screens.find(s=>s.id===v.screenId)?.route==='/diary')!;
  expect(diary.y).toBe(phone.y+3000+80);
  e.undo();expect(e.past.length).toBe(depth);
  e.select(phone.id);e.property('name','Today again');expect(e.arrange(true)).toBe(false);
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

test('native sets retain platform, fixed sizes, history and visibility',()=>{
  const e=new WorkspaceEditor();e.setupProject('App','http://127.0.0.1:5176',[{name:'Home',route:'/'}],'Native iOS');
  expect(e.document.views).toHaveLength(4);expect(e.document.views.every(v=>v.platform==='ios'&&v.heightMode==='fixed')).toBe(true);
  const before=structuredClone(e.view);e.move(50,70,true);e.property('width','800');e.property('height','900');e.property('heightMode','content');expect(e.view).toEqual(before);
  e.contentSizes.set(e.active,{source:e.source,width:e.view.width,viewportHeight:e.view.height,height:2000});expect(e.frame.height).toBe(before.height);
  e.setHidden(e.active,true);expect(e.shownFrames).toHaveLength(3);e.undo();expect(e.shownFrames).toHaveLength(4);e.redo();expect(e.shownFrames).toHaveLength(3);
  e.arrange();expect(loadWorkspace(e.document)).toEqual(e.document);
});
test('native presets switch platforms and dedupe independently of web dimensions',()=>{
  const e=new WorkspaceEditor();e.setupProject('App','http://127.0.0.1:5176',[{name:'Home',route:'/'}],'iPhone SE');
  e.addViews('Native iOS');expect(e.document.views).toHaveLength(5);e.addViews('Native iOS');expect(e.document.views).toHaveLength(5);
  e.property('preset','Phone');expect(e.view.platform).toBeUndefined();expect(e.view.heightMode).toBe('content');
  e.property('preset','Native iPhone SE');expect(e.view.platform).toBe('ios');expect(e.view.width).toBe(375);expect(e.view.heightMode).toBe('fixed');
  e.addView('Native iPhone 17');expect(e.view.platform).toBe('ios');
});
test('native validation refuses local screens and unsupported platforms without migrating old web frames',()=>{
  const e=new WorkspaceEditor();expect(loadWorkspace(e.document)).toEqual(e.document);
  expect(()=>e.addScreens([{name:'Blank',route:''}],'Native iOS',false)).toThrow('connected project route');
  expect(()=>e.addView('Native iPhone SE')).toThrow('connected project route');expect(()=>e.addViews('Native iOS')).toThrow('connected project route');
  e.select(e.active);expect(()=>e.property('preset','Native iPhone SE')).toThrow('connected project route');
  const bad=structuredClone(e.document);(bad.views[0] as any).platform='android';expect(()=>loadWorkspace(bad)).toThrow('platform');
});
test('disconnecting a project turns native viewports into fixed web frames',()=>{
  const e=new WorkspaceEditor();e.setupProject('App','http://127.0.0.1:5176',[{name:'Home',route:'/'}],'Native iOS');
  e.disconnectProject();expect(e.document.views.every(v=>v.platform===undefined&&v.heightMode==='fixed')).toBe(true);
  expect(e.document.screens[0].source).toBe('http://127.0.0.1:5176/');expect(loadWorkspace(e.document)).toEqual(e.document);
  e.undo();expect(e.document.views.every(v=>v.platform==='ios')).toBe(true);
});
