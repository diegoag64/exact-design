import {test,expect} from 'bun:test';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {DesignDraft,applyDesignDraft,bindingTargets,bindingKey,previewValue,type DesignPatch} from '../tools/design-drafts';
import {digest} from '../tools/layout-source';
import {PreviewChannel} from '../tools/preview-channel';
import {DraftStorage} from './draft-storage';
import type {FileSystem} from './app.contract.d.ts';
const source='component App\n  view\n    column gap=12 padding=8\n      text "Hello" color="#ffffff"\n';
function patch(property='gap',value='24',file='app.contract',text=source):DesignPatch{
  const lines=text.split('\n'),line=lines.findIndex(l=>l.includes(property+'='))+1,col=lines[line-1].indexOf(property+'=')+1;
  const binding={file,line,col,sha256:digest(text),property,shared:false},key=bindingKey(binding);
  return {key,binding,original:property==='gap'?'12':'#ffffff',value,preview:{key,site:1,plan:'plan',property,value:previewValue(property,value).css,scope:'site'},operation:null};
}
test('draft history, serialization, and source conflicts stay separate from source writes',()=>{
  const d=new DesignDraft(),files={'app.contract':digest(source)};
  d.stage(patch(),files);d.stage(patch('gap','36'),files);
  expect(d.count).toBe(1);expect(d.snapshot()[0].original).toBe('12');
  d.undo();expect(d.snapshot()[0].value).toBe('24');
  const restored=new DesignDraft();restored.restore(d.serialize());expect(restored.snapshot()).toMatchObject(d.snapshot());
  expect(restored.conflict({...files,other:'changed'})).toBe(true);
  expect(()=>restored.stage(patch(),{})).toThrow('source changed');
  restored.undo();expect(restored.count).toBe(0);
  d.stage(patch('gap','12'),files);expect(d.count).toBe(0);
  d.stage(patch('gap','48'),{'app.contract':'new-source'});d.undo();expect(d.past.length).toBe(0);
  expect(previewValue('padding','8 16').css).toBe('8px 16px');
  expect(()=>previewValue('gap','1; color:red')).toThrow();
  const invalid=JSON.parse(d.serialize());invalid.patches=[{...patch(),binding:{...patch().binding,property:'display'}}];
  expect(()=>restored.restore(JSON.stringify(invalid))).toThrow();
});
test('Apply validates the whole batch once and preserves source on compiler or digest failure',async()=>{
  const app=await mkdtemp(join(tmpdir(),'exact-design-draft-'));
  try{
    const path=join(app,'app.contract');await writeFile(path,source);
    let checks=0;
    const changes=[patch(),patch('color','#123456')];
    const checked=async(_app:string,_file:string,text:string,replacements?:Record<string,string>)=>{checks++;expect(text).toContain('gap=24');expect(text).toContain('color="#123456"');expect(replacements?.['app.contract']).toBe(text);expect(await readFile(path,'utf8')).toBe(source);};
    const result=await applyDesignDraft(app,changes,checked);expect(checks).toBe(1);expect(result.length).toBe(1);
    expect(await readFile(path,'utf8')).toBe(source.replace('gap=12','gap=24').replace('#ffffff','#123456'));
    await expect(applyDesignDraft(app,changes,checked)).rejects.toThrow('source changed');
    await writeFile(path,source);
    await expect(applyDesignDraft(app,changes,async()=>{throw new Error('compiler refused');})).rejects.toThrow('compiler refused');
    expect(await readFile(path,'utf8')).toBe(source);
    await expect(applyDesignDraft(app,changes,async()=>{await writeFile(path,source+'// external\n');})).rejects.toThrow('source changed');
    expect(await readFile(path,'utf8')).toContain('// external');
  }finally{await rm(app,{recursive:true,force:true});}
});
test('draft cache saves projects in order, retries failed writes, and restores on reload',async()=>{
  let disk:string|undefined,fail=false,writes=0;
  const fs={readFile:async()=>{if(!disk)throw {code:'ENOENT'};return new TextEncoder().encode(disk);},atomicWriteFile:async(_path:string,bytes:Uint8Array)=>{writes++;if(fail)throw new Error('disk full');disk=new TextDecoder().decode(bytes);}} as FileSystem;
  const cache=new DraftStorage();await cache.load(fs);
  await Promise.all([cache.save(fs,'a','first'),cache.save(fs,'b','second')]);
  const restored=new DraftStorage();await restored.load(fs);expect(restored.get('a')).toBe('first');expect(restored.get('b')).toBe('second');
  const count=writes;await restored.save(fs,'a','first');expect(writes).toBe(count);
  fail=true;await expect(restored.save(fs,'a','latest')).rejects.toThrow('disk full');expect(restored.get('a')).toBe('first');
  fail=false;await restored.save(fs,'a','latest');expect(restored.get('a')).toBe('latest');
});
test('preview updates and geometry are pushed immediately and close with the session',async()=>{
  const channel=new PreviewChannel(),response=channel.subscribe(new Request('http://localhost/design/events'));
  const reader=response.body!.getReader(),decode=(value?:Uint8Array)=>new TextDecoder().decode(value);
  expect(decode((await reader.read()).value)).toContain('"updateRevision":0');
  channel.publish(true);expect(decode((await reader.read()).value)).toContain('"updateRevision":1');
  channel.publish(false,{frame:'phone',id:'layer',plan:'plan',boxes:[]});
  expect(decode((await reader.read()).value)).toContain('"id":"layer"');
  channel.close();expect((await reader.read()).done).toBe(true);expect(channel.listeners.size).toBe(0);
});


test('preview targets follow source provenance and preserve shared-style overrides',()=>{
  const binding={file:'app.contract',line:3,col:12,sha256:'hash',property:'padding',shared:true};
  const at={file:'/app/app.contract',line:3,col:12};
  const shared=(row:string)=>({row,attr:'padding',origin:'class:Card',at});
  const map={nodes:[
    {bindings:[shared('padding_top'),shared('padding_left')]},
    {bindings:[{row:'padding_top',attr:'padding-top',at:{...at,line:8}},shared('padding_left')]},
    {bindings:[{...shared('padding_top'),at:{...at,line:20}}]},
    {bindings:[{...shared('padding_top'),state:'hover'}]},
  ]};
  expect(bindingTargets(map,'/app',binding)).toEqual([{site:0,properties:['padding-top','padding-left']},{site:1,properties:['padding-left']}]);
});

test('text drafts escape literal content and never rewrite a data expression',async()=>{
  const app=await mkdtemp(join(tmpdir(),'exact-text-draft-'));
  try{
    const path=join(app,'app.contract');await writeFile(path,source);
    const binding={file:'app.contract',line:4,col:7,sha256:digest(source),property:'text-content',shared:false},key=bindingKey(binding);
    const value='Hello "world"\nA second line';
    const draft:DesignPatch={key,binding,original:'Hello',value,preview:{key,site:1,plan:'plan',property:'text-content',value,scope:'site'},operation:null};
    await applyDesignDraft(app,[draft],async()=>{});
    expect(await readFile(path,'utf8')).toContain('text '+JSON.stringify(value)+' color=');
    const dynamic=source.replace('text "Hello"','text doc.title');await writeFile(path,dynamic);
    await expect(applyDesignDraft(app,[{...draft,binding:{...binding,sha256:digest(dynamic)}}],async()=>{})).rejects.toThrow('expression');
    expect(await readFile(path,'utf8')).toBe(dynamic);
    expect(previewValue('text-content','123').css).toBe('123');
    expect(previewValue('text-content','').author).toBe('');
    expect(bindingTargets({nodes:[{file:path,line:4,col:7},{file:path,line:5,col:7}]},app,binding)).toEqual([{site:0,properties:['text-content']}]);
  }finally{await rm(app,{recursive:true,force:true});}
});
