import {test,expect} from 'bun:test';
import {previewScreens,previewPath} from '../tools/preview-screens';
import {bridgeFor,stopElementBridges} from '../tools/element-bridge';
import {WorkspaceEditor,loadWorkspace} from './workspace';
import {snapTargets} from './snapping';

test('measured geometry drives hit testing, snapping, and placement without entering undo or storage',()=>{
  const editor=new WorkspaceEditor();editor.select(editor.active);editor.property('source','http://localhost:5174/');
  const past=editor.past.length;
  editor.contentSizes.set('view-1',{source:editor.source,width:720,viewportHeight:520,height:2200});
  expect(editor.frame.height).toBe(2200);expect(editor.view.height).toBe(520);expect(editor.past.length).toBe(past);
  expect(loadWorkspace(editor.document).views[0].height).toBe(520);
  editor.hit(100,2100);expect(editor.selected).toBe('view-1');
  editor.addScreen('Next','','Phone',false);expect(editor.view.y).toBe(2280);
  expect(snapTargets(editor.frame,editor.frames).y.some(t=>t.guide===2200)).toBe(true);
  editor.select('view-1');editor.property('height','700');expect(editor.frame.height).toBe(700);
  editor.property('heightMode','content');expect(editor.frame.height).toBe(700); // The old measurement has a different minimum.
  editor.contentSizes.set('view-1',{source:editor.source,width:720,viewportHeight:700,height:1800});
  expect(editor.frame.height).toBe(1800);editor.move(10,20,true);expect(editor.frame.height).toBe(1820);expect(editor.view.heightMode).toBe('fixed');
  editor.undo();expect(editor.frame.height).toBe(1800);editor.property('width','390');expect(editor.frame.height).toBe(700);
});

test('preview subscriptions ignore stale route and width measurements and release listeners on close',async()=>{
  const source='http://127.0.0.1:51992/library',bridge=bridgeFor(new URL(source).origin);
  const requests=[{id:'phone',url:source,width:390,height:844,auto:true}];
  const response=previewScreens(requests,new Request('http://localhost/previews'));
  const reader=response.body!.getReader();
  const read=async()=>JSON.parse(new TextDecoder().decode((await reader.read()).value).split('data: ')[1]);
  try{
    let message=await read();expect(message.frames[0]).toMatchObject({height:844,ready:false});
    expect(message.frames[0].previewSource).toContain('__ed_full=1');
    expect(message.frames[0].previewSource).toContain('__ed_canvas=1');
    const frame={frame:'phone',page:'page',build:'build',plan:'plan',inspecting:false,nodes:[],seen:Date.now()};bridge.frames.set('phone',frame);
    bridge.size(frame,{height:2200,width:390,viewportHeight:844,fullHeight:true,url:'/library?__ed_frame=phone&__ed_height=844&__ed_full=1'});
    message=await read();expect(message.frames[0]).toMatchObject({height:2200,ready:true});
    bridge.size(frame,{height:900,width:390,viewportHeight:844,fullHeight:true,url:'/other'});
    message=await read();expect(message.frames[0]).toMatchObject({height:844,ready:false});
    expect(bridge.size(frame,{height:Infinity,width:390,viewportHeight:844,fullHeight:true,url:'/library'})).toBe(false);
    expect(bridge.size(frame,{height:100000,width:390,viewportHeight:844,fullHeight:true,url:'/library'})).toBe(false);
    await reader.cancel();expect(bridge.feedback.size).toBe(0);
  }finally{await reader.cancel().catch(()=>{});stopElementBridges();}
  expect(previewPath('/library?__ed_full=1&__exactDev=nonce&filter=all')).toBe('/library?filter=all');
});

test('external previews retain their source URL and fixed fallback height',async()=>{
  const response=previewScreens([{id:'remote',url:'https://example.com/app',width:390,height:844,auto:false}],new Request('http://localhost/previews'));
  const reader=response.body!.getReader();
  const result=JSON.parse(new TextDecoder().decode((await reader.read()).value).split('data: ')[1]);
  expect(result.frames[0]).toMatchObject({previewSource:'https://example.com/app',height:844,ready:true});await reader.cancel();
  expect(()=>previewScreens([{id:'bad',url:'file:///etc/passwd',width:390,height:844,auto:true}],new Request('http://localhost/previews'))).toThrow();
});


test('list samples persist, reject stale sizes, and undo independently per viewport',()=>{
  const e=new WorkspaceEditor();e.select(e.active);e.property('source','http://localhost:5174/');
  e.contentSizes.set(e.active,{source:e.source,width:720,viewportHeight:520,height:2000,listRows:5});
  e.property('listRows','10');expect(e.frame.height).toBe(520);
  expect(loadWorkspace(e.document).views[0].listRows).toBe(10);
  e.undo();expect(e.frame.height).toBe(2000);e.redo();expect(e.view.listRows).toBe(10);
  e.property('listRows','7');expect(e.view.listRows).toBe(10);
  const invalid=structuredClone(e.document);invalid.views[0].listRows=7;expect(()=>loadWorkspace(invalid)).toThrow('sample');
});

test('arranged rows follow late content growth after reload without changing saved geometry or undo',()=>{
  const e=new WorkspaceEditor();e.setupProject('App','http://localhost:5174',[{name:'Feed',route:'/'},{name:'Library',route:'/library'}],'Core');e.arrange();
  const restored=new WorkspaceEditor();restored.document=loadWorkspace(e.document);
  const phone=restored.document.views[0],library=restored.document.views.find(v=>v.screenId!==phone.screenId)!;
  const before=JSON.stringify(restored.document);
  restored.contentSizes.set(phone.id,{source:'http://localhost:5174/',width:phone.width,viewportHeight:phone.height,height:4000});
  expect(restored.frames.find(v=>v.id===library.id)!.y).toBe(phone.y+4080);
  expect(JSON.stringify(restored.document)).toBe(before);expect(restored.past).toHaveLength(0);
  restored.select(library.id);restored.property('y','');expect(restored.document.arranged).toBe(true);restored.move(30,40);
  expect(restored.document.arranged).toBeUndefined();expect(restored.frame.y).toBe(phone.y+4120);
  restored.contentSizes.get(phone.id)!.height=5000;expect(restored.frame.y).toBe(phone.y+4120);
  restored.undo();expect(restored.document.arranged).toBe(true);expect(restored.frame.y).toBe(phone.y+5080);
});
