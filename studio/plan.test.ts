import {test,expect} from 'bun:test';
import {maskImageUrl,decodeSvgDataUrl,fieldText,valueFill,surfaceShape,layoutBox,visibleColor,index,measureRegion,regionSpec,placeLabel} from '../tools/plan-geometry.js';

test('plan mask URLs preserve parentheses in quoted and unquoted SVG data',()=>{
  const svg='<svg xmlns="http://www.w3.org/2000/svg"><g transform="translate(12 12)"><rect width="10" height="10"/></g></svg>';
  const url='data:image/svg+xml,'+encodeURIComponent(svg);
  for(const css of [`url("${url}")`,`url('${url}')`,`url(${url})`]){
    expect(maskImageUrl(css)).toBe(url);expect(decodeSvgDataUrl(maskImageUrl(css))).toBe(svg);
  }
  expect(maskImageUrl('none')).toBe('');expect(maskImageUrl('')).toBe('');
  expect(maskImageUrl('url("/icon.svg")')).toBe('/icon.svg');
  expect(decodeSvgDataUrl('data:image/svg+xml;base64,'+btoa(svg))).toBe(svg);
});

test('plan malformed SVG data URLs fail without throwing',()=>{
  for(const url of ['data:image/svg+xml,<svg width="100%"/>','data:image/svg+xml,%E0%A4','data:image/svg+xml;base64,%%%','data:image/svg+xml'])expect(decodeSvgDataUrl(url)).toBeNull();
});

test('plan fields mask passwords before measuring or drawing text',()=>{
  const password='secret123';
  expect(fieldText('password',password,'Password')).toBe('•'.repeat(password.length));
  expect(fieldText('password',password)).not.toContain(password);
  expect(fieldText('password','  ')).toBe('••');
  expect(fieldText('password','','Password')).toBe('Password');
  expect(fieldText('password')).toBe('');
});

test('plan text fields keep values and empty-field placeholders',()=>{
  for(const type of ['text','search','email','url','tel','number','date','datetime','datetime-local','month','week','time','','unknown',undefined,'textarea','select']){
    expect(fieldText(type,'Value','Placeholder')).toBe('Value');
    expect(fieldText(type,'','Placeholder')).toBe('Placeholder');
    expect(fieldText(type,'0')).toBe('0');
    expect(fieldText(type)).toBe('');
  }
});

test('plan buttons show only their value and non-text inputs show no text',()=>{
  for(const type of ['button','submit','reset']){
    expect(fieldText(type,'Action','Placeholder')).toBe('Action');
    expect(fieldText(type,'','Placeholder')).toBe('');
  }
  for(const type of ['checkbox','radio','range','color','file','image','hidden']){
    expect(fieldText(type,'on','Placeholder')).toBe('');
    expect(fieldText(type,'','Placeholder')).toBe('');
  }
});

// A record as plan-client.js reads it: document order, parent index and computed layout.
const box=(i:number,p:number,x:number,y:number,w:number,h:number,extra:any={})=>({i,p,x,y,w,h,radius:0,radii:[0,0,0,0],surface:false,borders:[false,false,false,false],
  display:'block',dir:'row',gap:[0,0],pad:[0,0,0,0],flow:true,decorative:false,label:'Container',hint:'',media:0,clip:{x:0,y:0,r:390,b:844},...extra});

test('a fill that starts at its track and shares its height reads as a value; full-width bars drop edges on the screen edge',()=>{
  const track=box(1,0,37,664,316,10,{surface:true,radius:5}),fill=box(2,1,37,664,136,10,{surface:true,radius:5}),dot=box(3,1,37,640,8,8,{surface:true});
  const {byI}=index([box(0,-1,0,0,390,844),track,fill,dot]);
  expect(valueFill(fill,byI)).toBe(true);
  expect(valueFill(dot,byI)).toBe(false);
  expect(valueFill(track,byI)).toBe(false);
  expect(surfaceShape(box(4,0,0,787,390,57,{surface:true}),390,844)).toEqual({kind:'edges',edges:[[0,787,390,787]]});
  expect(surfaceShape(box(5,0,47,491,296,1,{surface:true}),390,844)).toMatchObject({kind:'line',y1:491.5});
  expect(surfaceShape(box(6,0,24,97,342,455,{surface:true,radius:28}),390,844)).toEqual({kind:'rect',r:28});
});

// A card with a header and three macro rows of the same structure, each a label row above a bar.
function macros(){
  const records:any[]=[box(0,-1,16,578,358,225,{surface:true,radius:28,radii:[28,28,28,28],display:'flex',dir:'column',gap:[18,18],pad:[21,21,21,21],label:'Column',hint:'Macros'})];
  records.push(box(1,0,37,599,316,21,{display:'flex',label:'Row',hint:'Macros',gap:[0,8]}));
  let i=2;
  for(const [y,name] of [[638,'Protein'],[692,'Carbs'],[746,'Fat']] as const){
    const row=i++,top=i++,bar=i++;
    records.push(box(row,0,37,y,316,36,{display:'flex',dir:'column',gap:[8,8],label:'Column',hint:name}));
    records.push(box(top,row,37,y,316,18,{display:'flex',gap:[8,8],label:'Row',hint:name}));
    records.push(box(bar,row,37,y+26,316,10,{surface:true,radius:5,radii:[5,5,5,5]}));
  }
  return records;
}

test('a region labels repeated rows once and marks the copies',()=>{
  const records=macros(),m=measureRegion(records,[],{x:12,y:574,w:366,h:233});
  expect(m.badges.map(b=>[b.e.hint,b.n])).toEqual([['Protein',3]]);
  expect(m.repeats.map(r=>r.hint)).toEqual(['Carbs','Fat']);
  expect(m.live.some(e=>e.hint==='Fat')).toBe(false);
  // The card's corner is labeled; its bars sit inside it, so they are not.
  expect(m.radii.map(e=>e.i)).toEqual([0]);
  expect(m.sizes.map(e=>`${e.w}×${e.h}`)).toContain('358×225');
  // Elements that only partly fall inside the region are not measured.
  expect(measureRegion(records,[],{x:12,y:574,w:366,h:60}).live.map(e=>e.i)).toEqual([1]);
});

test('the copied spec indents like the Layers panel and names each row by its first text',()=>{
  const records=macros(),R={x:12,y:574,w:366,h:233};
  expect(regionSpec(R,measureRegion(records,[],R),records).split('\n')).toEqual([
    'Region 366 × 233 at 12, 574',
    '  Column "Macros" · 358 × 225 · padding 21 · gap 18 · radius 28',
    '    Column "Protein" · 316 × 36 · gap 8 · ×3',
    '      Container · 316 × 10 · radius 5',
  ]);
});

// Two sibling cards at different x and y positions, each with a child and media.
function cards(){
  const records=[box(1,0,10,10,180,80,{surface:true,radius:12,pad:[8,8,8,8],display:'flex',gap:[8,8],media:1,hint:'First'}),
    box(2,1,18,18,32,32),
    box(3,0,200,110,180,80,{surface:true,radius:12,pad:[8,8,8,8],display:'flex',gap:[8,8],media:1,hint:'Second'}),
    box(4,3,208,118,32,32)];
  const media=[{p:1,x:58,y:18,w:24,h:24},{p:3,x:248,y:118,w:24,h:24}];
  return {records,media,R:{x:0,y:0,w:390,h:200}};
}

const differences=[['width',{w:100}],['height',{h:60}],
  ...[0,1,2,3].map(i=>['padding '+i,{pad:[8,8,8,8].map((v,j)=>i===j?24:v)}]),
  ['row gap',{gap:[24,8]}],['column gap',{gap:[8,24]}],['radius',{radius:20}],
  ['display',{display:'grid'}],['direction',{dir:'column'}]] as const;
// A descendant's width follows its content, so only the siblings' own widths split a group.
for(const [name,change] of differences)for(const descendant of [false,true])if(!(descendant&&name==='width'))test(`regions keep cards with differing ${descendant?'descendant ':''}${name} separate`,()=>{
  const {records,media,R}=cards();
  Object.assign(records[descendant?3:2],change);
  const m=measureRegion(records,media,R),spec=regionSpec(R,m,records);
  expect(m.badges).toEqual([]);
  expect(m.repeats).toEqual([]);
  expect(m.live.map(e=>e.i)).toEqual([1,2,3,4]);
  expect(m.sizes.filter(e=>e.i===1||e.i===3).map(e=>e.i)).toEqual([1,3]);
  expect(spec).toContain('Container "First"');
  expect(spec).toContain('Container "Second"');
  expect(spec).not.toContain('×2');
});

for(const dimension of ['w','h'] as const)test(`regions keep cards with differing media ${dimension} separate`,()=>{
  const {records,media,R}=cards();media[1][dimension]=32;
  const m=measureRegion(records,media,R);
  expect(m.badges).toEqual([]);
  expect(m.repeats).toEqual([]);
  expect(m.sizes).toContain(media[0]);
  expect(m.sizes).toContain(media[1]);
});

test('regions group identical cards at different positions despite subpixel noise',()=>{
  for(const noise of [0,0.2]){
    const {records,media,R}=cards();
    for(const e of records.slice(2)){
      e.w+=noise;e.h+=noise;e.radius+=noise;
      e.pad=e.pad.map(v=>v+noise);e.gap=e.gap.map(v=>v+noise);
    }
    media[1].w+=noise;media[1].h+=noise;
    const m=measureRegion(records,media,R),spec=regionSpec(R,m,records);
    expect(m.badges.map(b=>[b.e.i,b.n])).toEqual([[1,2]]);
    expect(m.repeats.map(e=>e.i)).toEqual([3]);
    expect(m.live.map(e=>e.i)).toEqual([1,2]);
    expect(spec).toContain('Container "First" · 180 × 80 · padding 8 · gap 8 · radius 12 · ×2');
    expect(spec).not.toContain('"Second"');
  }
});

test('a label that collides slides along its line and stays inside the region, or waits for more room',()=>{
  const placed:any[]=[];
  expect(placeLabel(placed,100,50,20,14,'x',null)).toMatchObject({x:90,y:43});
  expect(placeLabel(placed,100,50,20,14,'x',null)!.x).toBeCloseTo(113);
  expect(placeLabel(placed,100,50,20,14,'x',{x:80,y:0,r:135,b:100})).toBeNull();
  expect(placeLabel(placed,100,50,20,14,'x',null)!.x).toBeCloseTo(67);
  expect(placeLabel(placed,100,50,20,14,undefined as any,null)).toBeNull();
});

test('layout boxes outline wrappers that hold elements, but not surfaces, the screen, or a box that repeats its parent',()=>{
  const screen=box(0,-1,0,0,390,844),card=box(1,0,16,100,358,200,{surface:true}),row=box(2,1,37,120,316,40,{display:'flex'});
  const same=box(3,2,37,120,316,40),label=box(4,3,37,130,80,20),icon=box(5,2,300,128,24,24,{media:1}),empty=box(6,1,37,200,316,20);
  const records=[screen,card,row,same,label,icon,empty],{byI,kids}=index(records);
  const drawn=records.filter(e=>layoutBox(e,byI,kids,390,844)).map(e=>e.i);
  // The row holds elements; the icon wrapper holds media. The screen, the card, the repeat, the text and the empty box draw nothing.
  expect(drawn).toEqual([2,5]);
});

test('only a zero alpha makes a colour invisible, so pure black text, borders and fills are kept',()=>{
  for(const c of ['rgb(0, 0, 0)','rgb(20, 19, 23)','rgba(0, 0, 0, 0.5)','rgb(0 0 0 / 50%)','rgba(118, 118, 128, 0.12)','color(srgb 0 0 0)'])expect(visibleColor(c)).toBe(true);
  for(const c of ['','transparent','rgba(0, 0, 0, 0)','rgba(255, 255, 255, 0.0)','rgb(0 0 0 / 0)','rgb(0 0 0 / 0%)'])expect(visibleColor(c)).toBe(false);
});

test('rows with the same layout still group when their children differ in width, as labels and progress fills do',()=>{
  const row=(i:number,y:number,labelW:number,fillW:number)=>[
    box(i,0,37,y,316,36,{display:'flex',dir:'column',gap:[8,8],label:'Column'}),
    box(i+1,i,37,y,labelW,18,{label:'Text'}),box(i+2,i,37,y+26,316,10,{surface:true,radius:5,radii:[5,5,5,5]}),box(i+3,i+2,37,y+26,fillW,10,{surface:true,radius:5,radii:[5,5,5,5]})];
  const records=[box(0,-1,16,578,358,225,{surface:true,display:'flex',dir:'column'}),...row(1,599,70,136),...row(5,640,52,200),...row(9,680,34,90)];
  const m=measureRegion(records,[],{x:0,y:560,w:390,h:200});
  expect(m.badges.map(b=>b.n)).toEqual([3]);
});
