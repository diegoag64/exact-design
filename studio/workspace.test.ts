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
