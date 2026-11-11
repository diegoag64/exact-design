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
