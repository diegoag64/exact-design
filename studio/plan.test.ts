import {test,expect} from 'bun:test';
import {valueFill,surfaceShape,layoutBox,index,measureRegion,regionSpec,placeLabel} from '../tools/plan-geometry.js';

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
