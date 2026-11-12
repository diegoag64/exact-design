import {test,expect} from 'bun:test';
import type {FileSystem} from './app.contract.d.ts';
import {WorkspaceEditor,createWorkspace} from './workspace';
import {initial} from './model';
import {WorkspacePersistence,WORKSPACE_FILE} from './persistence';

function disk(initialText?:string){
  let text=initialText,reads=0,writes=0;
  const fs={
    async readFile(path:string){expect(path).toBe(WORKSPACE_FILE);reads++;if(text===undefined)throw {code:'ENOENT'};return new TextEncoder().encode(text);},
    async atomicWriteFile(path:string,bytes:Uint8Array){expect(path).toBe(WORKSPACE_FILE);writes++;text=new TextDecoder().decode(bytes);},
  } as FileSystem;
  return {fs,text:()=>text,reads:()=>reads,writes:()=>writes};
}

test('workspace storage restores project, screens, geometry, and active selection in a new editor',async()=>{
  const d=disk(),editor=new WorkspaceEditor(),store=new WorkspacePersistence(editor);
  await Promise.all([store.load(d.fs),store.load(d.fs)]);expect(d.reads()).toBe(1);expect(d.writes()).toBe(0);
  editor.connectProject('Ember','http://127.0.0.1:5174');
  editor.addScreen('Library','/','Phone',true);editor.addView('Desktop');editor.move(75,120);
  editor.property('width','1280');
  await store.save(d.fs);
  const restored=new WorkspaceEditor();await new WorkspacePersistence(restored).load(d.fs);
  expect(restored.document).toEqual(editor.document);expect(restored.active).toBe(editor.active);expect(restored.selected).toBe(editor.selected);
  expect(restored.source).toBe('http://127.0.0.1:5174/');expect(restored.view.width).toBe(1280);
  expect(restored.past).toEqual([]);
  const saved=d.writes();await store.save(d.fs);expect(d.writes()).toBe(saved);
});

test('earlier document formats migrate and stale selections fall back to a valid viewport',async()=>{
  for(const value of [initial(),createWorkspace()]){
    const d=disk(JSON.stringify(value)),editor=new WorkspaceEditor();
    await new WorkspacePersistence(editor).load(d.fs);expect(editor.document.screens.length).toBe(1);expect(editor.document.views.length).toBe(1);
  }
  const d=disk(JSON.stringify({version:1,workspace:createWorkspace(),active:'deleted',selected:'missing'})),editor=new WorkspaceEditor();
  await new WorkspacePersistence(editor).load(d.fs);expect(editor.active).toBe('view-1');expect(editor.selected).toBe('');
});

test('writes keep snapshots in order and a fresh editor restores the final edit',async()=>{
  const d=disk(),editor=new WorkspaceEditor(),store=new WorkspacePersistence(editor);await store.load(d.fs);
  let release!:()=>void,started!:()=>void;const gate=new Promise<void>(resolve=>release=resolve),firstStarted=new Promise<void>(resolve=>started=resolve),write=d.fs.atomicWriteFile.bind(d.fs);let calls=0;
  d.fs.atomicWriteFile=async(path,bytes)=>{if(++calls===1){started();await gate;}await write(path,bytes);};
  editor.connectProject('First','http://localhost:5174');const first=store.save(d.fs);
  editor.connectProject('Latest','http://localhost:6000');const latest=store.save(d.fs);
  await firstStarted;expect(calls).toBe(1);release();await Promise.all([first,latest]);
  expect(calls).toBe(2);
  const restored=new WorkspaceEditor();await new WorkspacePersistence(restored).load(d.fs);
  expect(restored.document.project.name).toBe('Latest');expect(restored.document.project.url).toBe('http://localhost:6000');
});

test('failed writes keep the previous workspace and retry the latest edit',async()=>{
  const d=disk(),editor=new WorkspaceEditor(),store=new WorkspacePersistence(editor);await store.load(d.fs);await store.save(d.fs);
  const previous=d.text(),write=d.fs.atomicWriteFile.bind(d.fs);editor.connectProject('Ember','http://localhost:5174');
  d.fs.atomicWriteFile=async()=>{throw {code:'ENOSPC'};};
  expect(await store.save(d.fs)).toBe(false);expect(store.error).toContain('Press Save');expect(d.text()).toBe(previous);
  d.fs.atomicWriteFile=write;expect(await store.save(d.fs,true)).toBe(true);expect(store.error).toBe('');
  expect(JSON.parse(d.text()!).workspace.project.name).toBe('Ember');
});

test('unreadable saves are preserved until an explicit save replaces them',async()=>{
  const d=disk('{incomplete'),editor=new WorkspaceEditor(),store=new WorkspacePersistence(editor);await store.load(d.fs);
  expect(store.error).toContain('Could not open');editor.addView('Phone');
  expect(await store.save(d.fs)).toBe(false);expect(d.text()).toBe('{incomplete');expect(d.writes()).toBe(0);
  expect(await store.save(d.fs,true)).toBe(true);expect(store.error).toBe('');
  expect(JSON.parse(d.text()!).workspace.views.length).toBe(2);
});

test('build-time storage refusal is propagated and does not mark the workspace loaded',async()=>{
  const d=disk(JSON.stringify(createWorkspace())),editor=new WorkspaceEditor(),store=new WorkspacePersistence(editor),read=d.fs.readFile.bind(d.fs);
  d.fs.readFile=async()=>{throw {code:'bake'};};await expect(store.load(d.fs)).rejects.toMatchObject({code:'bake'});
  d.fs.readFile=read;await store.load(d.fs);expect(d.reads()).toBe(1);expect(store.error).toBe('');
});
