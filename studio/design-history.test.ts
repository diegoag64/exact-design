import {test,expect} from 'bun:test';
import {DesignHistory,draftChanges,workspaceChanges} from './design-history';
import type {FileSystem} from './app.contract.d.ts';
import {compoundFields,compoundValue} from '../tools/inspector-fields';

test('timeline preserves ordered actor, source and before/after evidence across reloads',async()=>{
  let disk='',fail=false;
  const fs={readFile:async()=>{if(!disk)throw {code:'ENOENT'};return new TextEncoder().encode(disk);},atomicWriteFile:async(_file:string,bytes:Uint8Array)=>{if(fail)throw Error('disk full');disk=new TextDecoder().decode(bytes);}} as FileSystem;
  const h=new DesignHistory(),base={time:'2026-11-11T12:00:00.000Z',kind:'draft',project:'app-a',label:'Edit padding',target:'Card',changes:[{target:'app.contract:10:5',property:'padding',before:'8',after:'16'}],beforeState:'before',afterState:'after'};
  await Promise.all([h.append(fs,base),h.append(fs,{...base,actor:'ai',label:'AI edit'})]);
  expect(h.entries[1].parent).toBe(h.entries[0].id);expect(h.entries[1].actor).toBe('ai');
  fail=true;await expect(h.append(fs,base)).rejects.toThrow('disk full');expect(h.entries.length).toBe(2);
  fail=false;await h.append(fs,{...base,project:'app-b'});expect(h.entries[2].parent).toBe('');
  const restored=new DesignHistory();await restored.load(fs);expect(restored.entries).toEqual(h.entries);expect(restored.view('app-a').length).toBe(2);expect(restored.view('app-b').length).toBe(1);
});
test('draft changes describe edit, undo, discard and apply without inventing an inverse on apply',()=>{
  const patch={key:'binding',binding:{file:'app.contract',line:3,col:8,property:'gap'},original:'8',value:'16'};
  const empty=JSON.stringify({patches:[]}),draft=JSON.stringify({patches:[patch]});
  expect(draftChanges(empty,draft)).toMatchObject([{before:'8',after:'16'}]);
  expect(draftChanges(draft,empty)).toMatchObject([{before:'16',after:'8'}]);
  expect(draftChanges(draft,empty,true)).toMatchObject([{before:'8',after:'16'}]);
  expect(draftChanges(draft,draft)).toEqual([]);
});
test('workspace changes identify layers by id, independent of array ordering',()=>{
  const before={layers:[{id:'a',x:10},{id:'b',x:20}]},after={layers:[{id:'b',x:20},{id:'a',x:30}]};
  expect(workspaceChanges(before,after)).toEqual([{target:'workspace/layers/a',property:'x',before:'10',after:'30'}]);
});
test('linked controls expand CSS edges and axes, preserving untouched values',()=>{
  expect(compoundFields('padding','8 16').map(f=>f.value)).toEqual(['8','16','8','16']);
  expect(compoundValue('padding','8 16','3','24')).toBe('8 16 8 24');
  expect(compoundValue('border-radius','12','1','0')).toBe('12 0 12 12');
  expect(compoundValue('gap','8 16','all','20')).toBe('20');
  expect(compoundFields('padding','spacing.large')).toEqual([]);
  expect(()=>compoundValue('padding','8','7','24')).toThrow();
});
