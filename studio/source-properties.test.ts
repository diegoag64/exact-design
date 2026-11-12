import {test,expect} from 'bun:test';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {attributeRange,elementInsertion} from '../tools/source-properties';
import {applyDesignDraft,bindingKey,previewValue,type DesignBinding,type DesignPatch} from '../tools/design-drafts';
import {digest} from '../tools/layout-source';
import {propertyCatalog} from '../tools/property-catalog';

const source='component App\n  state wide = true\n  view\n    column width=(wide ? 240 : 120) border="1px solid #ffffff" // keep me\n      text "Hello" color="#ffffff"\n';
function patch(property:string,value:string,mode:'insert'|'replace'='insert'):DesignPatch{
  const line=source.split('\n')[3],col=mode==='insert'?5:line.indexOf(property+'=')+1;
  const binding:DesignBinding={file:'app.contract',line:4,col,property,mode,sha256:digest(source),shared:false},key=bindingKey(binding);
  return {key,binding,original:'0',value,operation:null,preview:{key,site:0,plan:'plan',property,value:previewValue(property,value).css,scope:'site'}};
}
test('source ranges keep quoted values, balanced expressions and comments intact',()=>{
  const at=attributeRange(source,{line:4,col:12,property:'width'});
  expect(at?.raw).toBe('(wide ? 240 : 120)');
  const insertion=elementInsertion(source,{line:4,col:5,property:'padding'});
  expect(source.slice(insertion!)).toStartWith('// keep me');
  expect(elementInsertion(source,{line:4,col:6,property:'padding'})).toBeNull();
  expect(attributeRange(source,{line:4,col:13,property:'width'})).toBeNull();
});
test('new properties and explicit expression overrides compile together without overwriting neighboring code',async()=>{
  const app=await mkdtemp(join(tmpdir(),'exact-properties-'));
  try{
    const file=join(app,'app.contract');await writeFile(file,source);
    await applyDesignDraft(app,[patch('padding','12 24'),patch('gap','16'),patch('border-radius','8'),patch('opacity','0.75'),patch('border-width','2'),patch('width','320','replace')]);
    const result=await readFile(file,'utf8');
    expect(result).toContain('width=320');expect(result).toContain('padding="12px 24px"');expect(result).toContain('gap=16');expect(result).toContain('// keep me');expect(result).toContain('text "Hello" color="#ffffff"');
    await expect(applyDesignDraft(app,[patch('gap','20')])).rejects.toThrow('source changed');
    expect(await readFile(file,'utf8')).toBe(result);
  }finally{await rm(app,{recursive:true,force:true});}
});
test('catalog defaults are valid Contract properties, not merely browser CSS',async()=>{
  const app=await mkdtemp(join(tmpdir(),'exact-catalog-'));
  try{
    const file=join(app,'app.contract');await writeFile(file,source);
    // Compile independently so shorthand/longhand defaults cannot hide errors.
    for(const [property,value]of Object.entries(propertyCatalog)){
      if(property==='width')continue;
      await writeFile(file,source);
      try{await applyDesignDraft(app,[patch(property,value)]);}catch(error){throw new Error(`${property}=${value}: ${(error as Error).message}`);}
    }
  }finally{await rm(app,{recursive:true,force:true});}
});

test('new attributes and code overrides keep their distinct source intent when drafts reload',async()=>{
  const {DesignDraft}=await import('../tools/design-drafts');
  const d=new DesignDraft(),files={'app.contract':digest(source)};
  const inserted={...patch('padding','0'),original:'[not set]'};
  const replaced=patch('width','240','replace');replaced.binding.expression='(wide ? 240 : 120)';replaced.original=replaced.binding.expression;
  d.stage(inserted,files);d.stage(replaced,files);
  const restored=new DesignDraft();restored.restore(d.serialize());
  expect(restored.snapshot().map(p=>[p.binding.mode,p.original])).toEqual([['insert','[not set]'],['replace','(wide ? 240 : 120)']]);
  expect(previewValue('opacity','75%')).toEqual({author:'0.75',css:'0.75'});
  expect(previewValue('rotate','45').css).toBe('45deg');
});
