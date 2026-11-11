import {test,expect} from 'bun:test';
import {mkdtemp,writeFile,readFile,rm,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {digest,literalAt,patchLayout,layoutValue,writeLayout,undoLayout,checkLayout,type LayoutSite} from '../tools/layout-source';
import {DesignSession} from '../tools/design-session';
const source='component App\n  view\n    column gap=12 padding="8px 16px"\n      text "Hello"\n';
const site=(text=source,attr='gap'):LayoutSite=>{
  const line=text.split('\n').findIndex(l=>l.includes(attr+'=')),prefix=text.split('\n')[line].split(attr+'=')[0];
  return {file:'app.contract',line:line+1,col:Buffer.byteLength(prefix)+1,attr,sha256:digest(text),shared:false};
};
test('patches only a literal attribute at the compiled UTF-8 source address',()=>{
  const original='component App\r\n  view\r\n    row aria-label="café" gap=12 // keep this\r\n';
  const edited=patchLayout(original,site(original),'24');
  expect(edited).toBe(original.replace('gap=12','gap=24'));
  expect(literalAt(source,site(source,'padding'))?.value).toBe('8px 16px');
  expect(()=>patchLayout(source,{...site(),sha256:'old'},'16')).toThrow('changed');
  for(const value of ['(wide ? 12 : 6)','spacing.large','`12px`']) {
    const dynamic=source.replace('gap=12','gap='+value);
    expect(literalAt(dynamic,site(dynamic))).toBeNull();
  }
});
test('layout values accept sizing and spacing without accepting expressions or code',()=>{
  expect(layoutValue('width','100%')).toBe('"100%"');
  expect(layoutValue('gap','16')).toBe('16');
  expect(layoutValue('gap','8 16')).toBe('"8px 16px"');
  expect(layoutValue('padding','8px 16px')).toBe('"8px 16px"');
  expect(layoutValue('padding','8 16')).toBe('"8px 16px"');
  expect(layoutValue('margin-left','-8')).toBe('-8');
  expect(layoutValue('flex-direction','column')).toBe('"column"');
  for(const [attr,value] of [['gap','-1'],['padding','calc(2px)'],['width','100000'],['gap','1; color=red'],['align-items','bogus']]) expect(()=>layoutValue(attr,value)).toThrow();
});
test('a design session joins real layout source and applies a staged draft',async()=>{
  const app=await mkdtemp(join(tmpdir(),'exact-layout-session-'));let events:any[]=[];
  await writeFile(join(app,'app.contract'),source);
  const files=async()=>({'app.contract':digest(await readFile(join(app,'app.contract'),'utf8'))});
  const request=(async(url:string,init:any)=>{
    const body=JSON.parse(init.body);
    if(url.endsWith('/events')){const reply={files:await files(),events,seq:1,epoch:'run'};events=[];return Response.json(reply);}
    if(body.method==='hello')return Response.json({ok:{protocol:'tamber/1.18',files:await files(),local:true,app}});
    if(body.method==='inspect')return Response.json({ok:{builds:['page']}});
    throw new Error('Layout edits must not use the appearance transaction API.');
  }) as typeof fetch;
  try {
    const s=new DesignSession('http://localhost:5174','fixture',request);await s.start();
    const location=site();
    events=[{event:'selection',build:'page',source:{file:'app.contract',line:3},rows:[{name:'gap',source:'authored',origin:'own',layout:true,attr:'gap',at:{file:join(app,'app.contract'),line:location.line,col:location.col,sha256:location.sha256},editable:{rung:null}}]}];
    const selected=await s.poll();expect(selected.rows[0]).toMatchObject({name:'Gap',value:'12',group:'Spacing',shared:false});
    await s.edit(selected.version,0,'24');expect(await readFile(join(app,'app.contract'),'utf8')).toBe(source);await s.apply();expect(await readFile(join(app,'app.contract'),'utf8')).toContain('gap=24');
    await writeFile(join(app,'app.contract'),source);expect(await readFile(join(app,'app.contract'),'utf8')).toBe(source);
  } finally {await rm(app,{recursive:true,force:true});}
});
test('checks a staged source and writes atomically; undo preserves intervening edits',async()=>{
  const app=await mkdtemp(join(tmpdir(),'exact-layout-'));
  try {
    await writeFile(join(app,'app.contract'),source);
    const inverse=await writeLayout(app,site(),'24');
    expect(await readFile(join(app,'app.contract'),'utf8')).toBe(source.replace('gap=12','gap=24'));
    await undoLayout(app,inverse);expect(await readFile(join(app,'app.contract'),'utf8')).toBe(source);
    await expect(checkLayout(app,'app.contract','not valid Contract')).rejects.toThrow();
    expect(await readFile(join(app,'app.contract'),'utf8')).toBe(source);
    await expect(writeLayout(app,site(),'20',async()=>{throw new Error('checker refused');})).rejects.toThrow('checker refused');
    expect(await readFile(join(app,'app.contract'),'utf8')).toBe(source);
    await expect(writeLayout(app,site(),'20',async()=>{await writeFile(join(app,'app.contract'),source+'// hand edit\n');})).rejects.toThrow('changed');
    await expect(undoLayout(app,inverse)).rejects.toThrow('overwrite');
  } finally {await rm(app,{recursive:true,force:true});}
});
test('cannot write sources outside the connected app, including through symlinks',async()=>{
  const root=await mkdtemp(join(tmpdir(),'exact-layout-boundary-')),app=join(root,'app');
  try {
    await import('node:fs/promises').then(fs=>fs.mkdir(app));
    await writeFile(join(root,'external.contract'),source);await symlink(join(root,'external.contract'),join(app,'linked.contract'));
    for(const file of ['../external.contract','linked.contract']) await expect(writeLayout(app,{...site(),file},'24')).rejects.toThrow('Only this app');
    expect(await readFile(join(root,'external.contract'),'utf8')).toBe(source);
  } finally {await rm(root,{recursive:true,force:true});}
});
test('on-canvas spacing drafts preserve shorthand sides before Apply',async()=>{
  const app=await mkdtemp(join(tmpdir(),'exact-canvas-spacing-'));let events:any[]=[];
  await writeFile(join(app,'app.contract'),source);
  const files=async()=>({'app.contract':digest(await readFile(join(app,'app.contract'),'utf8'))});
  const request=(async(url:string,init:any)=>{
    const body=JSON.parse(init.body);
    if(url.endsWith('/events')){const reply={files:await files(),events,seq:1,epoch:'run'};events=[];return Response.json(reply);}
    if(body.method==='hello')return Response.json({ok:{protocol:'tamber/1.18',files:await files(),local:true,app}});
    if(body.method==='inspect')return Response.json({ok:{builds:['page']}});
    throw new Error('Spacing must use checked source writes.');
  }) as typeof fetch;
  const select=()=>{events=[{event:'selection',build:'page',source:{file:'app.contract',line:3},rows:['gap','padding'].map(attr=>{
    const at=site(source,attr);return {name:attr,source:'authored',origin:'own',layout:true,attr,at:{file:join(app,'app.contract'),line:at.line,col:at.col,sha256:at.sha256},editable:{rung:null}};
  })}];};
  try{
    const session=new DesignSession('http://localhost:5174','fixture',request);await session.start();select();
    let selected=await session.poll();
    await session.editSpacing(selected.version,'padding-top','24');
    expect(await readFile(join(app,'app.contract'),'utf8')).toBe(source);await session.apply();
    expect(await readFile(join(app,'app.contract'),'utf8')).toContain('padding="24px 16px 8px 16px"');
    await writeFile(join(app,'app.contract'),source);expect(await readFile(join(app,'app.contract'),'utf8')).toBe(source);
    select();selected=await session.poll();await session.editSpacing(selected.version,'column-gap','20');await session.apply();
    expect(await readFile(join(app,'app.contract'),'utf8')).toContain('gap="12px 20px"');
    await writeFile(join(app,'app.contract'),source);expect(await readFile(join(app,'app.contract'),'utf8')).toBe(source);
    await expect(session.editSpacing(selected.version,'padding-top','30')).rejects.toThrow('changed');
  }finally{await rm(app,{recursive:true,force:true});}
});
