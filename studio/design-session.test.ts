import {test,expect} from 'bun:test';
import {DesignSession,editableRows,rowOperation} from '../tools/design-session';
const row={name:'font_size',editable:{rung:'template',file:'app.contract',at:{line:10,col:8},sha256:'abc',row:'font-size',text:'28'}};
test('only supported source-backed visual rows become editable',()=>{
  expect(editableRows({rows:[row,{name:'width',editable:row.editable},{name:'color',editable:{rung:null}}]})).toEqual([row]);
  expect(editableRows({readOnly:'stale',rows:[row]})).toEqual([]);
  expect(rowOperation(row,'32')).toMatchObject({op:'set-row',row:'font-size',value:32,sha256:'abc'});
  expect(()=>rowOperation(row,'oops')).toThrow('number');
});
test('draft edits and undo never write; Apply checks the source version',async()=>{
  let files={file:'before'},events:any[]=[],writes:any[]=[];
  const request=(async(url:string,init:any)=>{
    const body=JSON.parse(init.body);
    if(url.endsWith('/events')) {const reply={files,events,seq:1,epoch:'run'};events=[];return Response.json(reply);}
    if(body.method==='hello') return Response.json({ok:{protocol:'tamber/1.18',files}});
    if(body.method==='inspect') return Response.json({ok:{builds:['page']}});
    writes.push(body);files={file:'after'};return Response.json({ok:{files,inverse:'inverse-1'}});
  }) as typeof fetch;
  const s=new DesignSession('http://localhost:5174','not-a-real-token',request);await s.start();
  events=[{event:'selection',build:'page',source:{file:'app.contract',line:10},rows:[row]}];
  const selected=await s.poll();expect(selected.rows.length).toBe(1);
  const draft=await s.edit(selected.version,0,'32');expect(writes).toEqual([]);expect(draft.rows[0].value).toBe('32');expect(draft.canApply).toBe(true);
  s.undo();expect(s.view().draftCount).toBe(0);expect(writes).toEqual([]);
  await s.edit(s.version,0,'32');await s.apply();expect(writes[0].files).toEqual({file:'before'});expect(writes[0].ops[0].value).toBe(32);
  expect(s.view().draftCount).toBe(0);
  events=[{event:'selection',build:'page',rows:[row]}];const next=await s.poll();
  await s.edit(next.version,0,'40');files={file:'hand-edit'};
  await expect(s.apply()).rejects.toThrow('source changed');expect(writes.length).toBe(1);
  expect(s.view().draftCount).toBe(1);expect(s.view().canApply).toBe(false);
  expect(s.discard().draftCount).toBe(0);
});

test('reconnected viewports sharing a build resolve selection against the intended frame',async()=>{
  let events:any[]=[],inspections=0;
  const request=(async(url:string,init:any)=>{
    const body=JSON.parse(init.body);
    if(url.endsWith('/events')){const reply={files:{},events,seq:1,epoch:'run'};events=[];return Response.json(reply);}
    if(body.method==='hello')return Response.json({ok:{protocol:'tamber/1.18',files:{}}});
    if(body.method==='inspect')inspections++;
    return Response.json({ok:{builds:['shared-build']}});
  })as typeof fetch;
  const instance=[{region:0,key:'card-1'}],node={id:'card',path:'root/card',parent:'',site:45,instance,depth:0,label:'Card',kind:'column',tag:'div'};
  const frames=new Map([
    ['phone',{frame:'phone',page:'phone-page',build:'shared-build',plan:'plan',inspecting:true,nodes:[{...node,instance:[]}]}],
    ['tablet',{frame:'tablet',page:'tablet-page',build:'shared-build',plan:'plan',inspecting:true,nodes:[node]}],
  ]);
  const s=new DesignSession('http://localhost:5174','test',request);
  s.bridge={frames,feedback:new Set(),select:()=>{},preview:()=>{},measure:()=>{}}as any;
  await s.start();s.navigate('card'); // defaults to the first frame until a frame is chosen
  s.pick('tablet','card');events=[{event:'selection',build:'shared-build',site:45,instance,rows:[row]}];
  const selected=await s.poll();expect(selected.rows.length).toBe(1);expect(s.picked?.frame).toBe('tablet');expect(selected.selecting).toBe(false);
  const count=inspections;await s.poll();expect(inspections).toBe(count);
  // Once both trees know identical instance paths, selection must still stay put.
  frames.get('phone')!.nodes[0].instance=instance;
  await s.poll();expect(s.picked?.frame).toBe('tablet');
  s.pick('phone','card');events=[{event:'selection',build:'shared-build',site:45,instance,rows:[row]}];
  await s.poll();expect(s.picked?.frame).toBe('phone');
});
