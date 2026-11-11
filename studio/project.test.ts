import { test, expect } from 'bun:test';
import { WorkspaceEditor, loadWorkspace } from './workspace';
import { projectUrl, screenRoute } from './project';
test('server URLs and route paths are normalized without allowing another origin',()=>{
  expect(projectUrl(' http://127.0.0.1:5174/ ')).toBe('http://127.0.0.1:5174');
  expect(projectUrl('http://[::1]:5174')).toBe('http://[::1]:5174');
  expect(screenRoute('/notes/7?mode=empty#details')).toBe('/notes/7?mode=empty#details');
  for(const url of ['javascript:alert(1)','http://a:99999','https://user:pass@a','https://a/path','']) expect(()=>projectUrl(url)).toThrow();
  for(const path of ['//other.com','/\\other.com','https://other.com','/bad path']) expect(()=>screenRoute(path)).toThrow();
});
test('project routes follow a changed server and persist across reopen',()=>{
  const e=new WorkspaceEditor();e.connectProject('Morrow','http://localhost:5174');e.addScreen('Note','/note','Phone',true);e.addView('Tablet');
  expect(e.source).toBe('http://localhost:5174/note');expect(e.document.screens.length).toBe(2);
  e.connectProject('Morrow','http://localhost:6000');expect(e.source).toBe('http://localhost:6000/note');
  e.undo();expect(e.source).toBe('http://localhost:5174/note');
  expect(loadWorkspace(e.document)).toEqual(e.document);
});
test('connecting adopts matching old URLs and disconnecting preserves their previews',()=>{
  const e=new WorkspaceEditor();e.select(e.active);e.property('source','http://localhost:5174/note');e.connectProject('Morrow','http://localhost:5174');
  expect(e.screen.route).toBe('/note');expect(e.screen.source).toBe('');
  e.disconnectProject();expect(e.source).toBe('http://localhost:5174/note');expect(e.screen.route).toBe('');
  e.undo();expect(e.screen.route).toBe('/note');
});
test('blank and legacy screens coexist and duplicate routes do not change history',()=>{
  const e=new WorkspaceEditor();e.connectProject('Morrow','http://localhost:5174');e.addScreen('Home','/','Phone',true);
  const before=structuredClone(e.document),history=e.past.length;
  expect(()=>e.addScreen('Again','/','Tablet',true)).toThrow();expect(e.document).toEqual(before);expect(e.past.length).toBe(history);
  e.addScreen('Sketch','','Desktop',false);expect(e.source).toBe('');expect(e.view.y).toBeGreaterThan(before.views[1].y);
});
test('older workspaces migrate without changing their preview sources',()=>{
  const e=new WorkspaceEditor();e.select(e.active);e.property('source','https://example.com/profile');
  const old=JSON.parse(JSON.stringify(e.document));delete old.project;delete old.screens[0].route;
  const migrated=loadWorkspace(old);expect(migrated.project.url).toBe('');expect(migrated.screens[0].source).toBe('https://example.com/profile');
  expect(old.project).toBeUndefined();
});
