import {test,expect} from 'bun:test';
import {draftReview,reviewName} from './draft-review';
const patch=(file:string,line:number,property:string,original:string,value:string,extra:any={})=>({key:`${file}:${line}:1#${property}`,binding:{file,line,col:1,property,shared:false,...extra.binding},original,value,label:extra.label});
test('draft review groups changes by file in source order with readable names, icons, and swatches',()=>{
  const state=JSON.stringify({version:1,files:{},patches:[
    patch('app.contract',40,'padding','8','16 24',{label:'Card'}),
    patch('app.contract',12,'background-color','#ffffff','#123456'),
    patch('ui.contract',3,'gap','[not set]','12',{binding:{mode:'insert'}}),
    patch('ui.contract',9,'color','theme.ink','#000',{binding:{mode:'replace',shared:true}}),
  ]});
  const files=draftReview(state);
  expect(files.map(f=>f.file)).toEqual(['app.contract','ui.contract']);
  expect(files[0].changes.map(c=>c.line)).toEqual([12,40]);
  const [fill,padding]=files[0].changes;
  expect(fill).toMatchObject({name:'Fill',icon:'paint-bucket',swatchBefore:'#ffffff',swatchAfter:'#123456'});
  expect(padding).toMatchObject({name:'Padding',element:'Card',icon:'between-horizontal-start',swatchAfter:''});
  expect(files[1].changes[0]).toMatchObject({added:true,before:'',after:'12'});
  expect(files[1].changes[1]).toMatchObject({replaced:true,shared:true,swatchBefore:'',swatchAfter:'#000'});
  expect(reviewName('min-width')).toBe('Min width');
  expect(draftReview('')).toEqual([]);expect(draftReview('not json')).toEqual([]);
});
