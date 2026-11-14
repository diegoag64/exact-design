import {test,expect} from 'bun:test';
import {decodeSpacing,spacingRows} from './spacing';
import {spacingOperation} from '../tools/design-session';
import {measureSpacing,measureDistance} from '../tools/spacing-geometry.js';

const rect=(x:number,y:number,width:number,height:number)=>({left:x,top:y,right:x+width,bottom:y+height,width,height});
const css={marginTop:'0px',marginRight:'0px',marginBottom:'0px',marginLeft:'0px',display:'flex',flexDirection:'row',flexWrap:'nowrap',position:'static',paddingTop:'12px',paddingRight:'20px',paddingBottom:'12px',paddingLeft:'20px',columnGap:'16px',rowGap:'24px',borderTopWidth:'0px',borderRightWidth:'0px',borderBottomWidth:'0px',borderLeftWidth:'0px',overflowX:'visible',overflowY:'visible'};
const element=(r:ReturnType<typeof rect>,style=css,children:any[]=[],parentElement:any=null)=>({getBoundingClientRect:()=>r,style,children,parentElement,offsetWidth:r.width,offsetHeight:r.height});
const styleOf=(el:any)=>el.style;
const viewport={width:600,height:600};

test('padding and flex gaps follow borders and actual viewport geometry and label every gap',()=>{
  const el=element(rect(10,20,300,120),css,[element(rect(30,32,60,80)),element(rect(106,32,60,80)),element(rect(182,32,60,80))]);
  const boxes=measureSpacing(el,styleOf,viewport);
  expect(boxes.find((b:any)=>b.property==='padding-top')).toMatchObject({x:10,y:20,width:300,height:12,value:'12'});
  expect(boxes.filter((b:any)=>b.property==='column-gap')).toHaveLength(2);
  expect(boxes.filter((b:any)=>b.property==='column-gap'&&b.label)).toHaveLength(2);
  expect(boxes.filter((b:any)=>b.property==='column-gap').map((b:any)=>b.labelY)).toEqual([22,22]);
  expect(boxes.find((b:any)=>b.property==='column-gap')).toMatchObject({x:90,y:32,width:16,height:80,value:'16'});
});
test('wrapped and reversed flex layouts measure both axes; hidden and positioned children do not count',()=>{
  const el=element(rect(0,0,300,220),{...css,flexDirection:'row-reverse',flexWrap:'wrap'},[
    element(rect(106,12,60,80)),element(rect(30,12,60,80)),element(rect(30,116,60,80)),
    element(rect(10,10,20,20),{...css,position:'absolute'}),element(rect(0,0,0,0)),
  ]);
  const boxes=measureSpacing(el,styleOf,viewport);
  expect(boxes.find((b:any)=>b.property==='column-gap')).toMatchObject({x:90,width:16});
  expect(boxes.find((b:any)=>b.property==='row-gap')).toMatchObject({y:92,height:24,value:'24'});
});
test('scroll clipping, transforms, and distributed space do not report extra spacing as CSS gap',()=>{
  const parent=element(rect(40,35,100,100),{...css,overflowX:'hidden',overflowY:'auto'});
  const el=element(rect(10,20,300,120),css,[element(rect(30,32,60,80)),element(rect(200,32,60,80))],parent);
  const boxes=measureSpacing(el,styleOf,viewport);
  expect(boxes.every((b:any)=>b.x>=40&&b.y>=35&&b.x+b.width<=140&&b.y+b.height<=135)).toBe(true);
  expect(boxes.find((b:any)=>b.property==='column-gap')).toMatchObject({width:3,value:'16'});
  const scaled=element(rect(0,0,600,240));scaled.offsetWidth=300;scaled.offsetHeight=120;
  expect(measureSpacing(scaled,styleOf,viewport).find((b:any)=>b.property==='padding-top')).toMatchObject({height:24,value:'12'});
  el.style={...css,columnGap:'10%'};expect(measureSpacing(el,styleOf,viewport).some((b:any)=>b.property==='column-gap')).toBe(false);
});
test('segment keys count within each property, so clipping padding does not renumber gaps',()=>{
  const children=[element(rect(30,32,60,80)),element(rect(106,32,60,80)),element(rect(182,32,60,80))];
  const keys=(el:any)=>measureSpacing(el,styleOf,viewport).filter((b:any)=>b.property==='column-gap').map((b:any)=>b.key);
  expect(keys(element(rect(10,20,300,120),css,children))).toEqual(['column-gap-0','column-gap-1']);
  expect(keys(element(rect(10,20,300,120),{...css,paddingTop:'0px',paddingLeft:'0px'},children))).toEqual(['column-gap-0','column-gap-1']);
});
test('positive margins are measured outside the border box',()=>{
  const el=element(rect(40,50,200,100),{...css,display:'block',marginTop:'16px',marginRight:'8px',marginBottom:'-4px',marginLeft:'auto'});
  const boxes=measureSpacing(el,styleOf,viewport).filter((b:any)=>b.property.startsWith('margin'));
  expect(boxes.map((b:any)=>b.property)).toEqual(['margin-top','margin-right']);
  expect(boxes[0]).toMatchObject({x:40,y:34,width:200,height:16,value:'16',label:true});
  expect(boxes[1]).toMatchObject({x:240,y:50,width:8,height:100,value:'8'});
});
test('spacing edits prefer explicit sides and preserve other shorthand values and units',()=>{
  const rows=[{name:'padding',editable:{row:'padding',text:'1rem 20px'}},{name:'left',editable:{row:'padding-left',text:'8'}}];
  expect(spacingOperation(rows,'padding-top','24')).toEqual({index:0,value:'24 20px 1rem 20px'});
  expect(spacingOperation(rows,'padding-left','12')).toEqual({index:1,value:'12'});
  expect(spacingOperation([{name:'gap',editable:{row:'gap',text:'8'}}],'column-gap','16')).toEqual({index:0,value:'8 16'});
  expect(spacingOperation([{name:'gap',editable:{row:'gap',text:'8px 1rem'}}],'row-gap','16')).toEqual({index:0,value:'16 1rem'});
  for(const [property,value] of [['width','20'],['padding-left','-2'],['row-gap','8 16'],['padding-top','calc(1px)']])expect(()=>spacingOperation(rows,property,value)).toThrow();
  expect(spacingOperation([{name:'margin',editable:{row:'margin',text:'0 auto'}}],'margin-top','12')).toEqual({index:0,value:'12 auto 0 auto'});
  expect(spacingOperation([{name:'margin',editable:{row:'margin',text:'4'}}],'margin-left','-8')).toEqual({index:0,value:'4 4 4 -8'});
  expect(()=>spacingOperation([],'padding-top','20')).toThrow('computed');
  expect(spacingRows([{id:'0',property:'padding',value:'1rem 20px',shared:true}])[0]).toEqual({property:'padding-top',value:'1rem',shared:true});
  expect(spacingRows([{id:'0',property:'margin',value:'0 auto',shared:false}]).map(r=>r.value)).toEqual(['0','auto','0','auto']);
  expect(spacingRows([{id:'0',property:'gap',value:'8px 1rem',shared:false}])).toEqual([{property:'row-gap',value:'8px',shared:false},{property:'column-gap',value:'1rem',shared:false}]);
});
test('guest messages accept only bounded geometry and known spacing properties',()=>{
  const box={key:'padding-top-0',property:'padding-top',x:0,y:0,width:100,height:12,labelX:50,labelY:6,value:'12',label:true};
  const message=(boxes:any[])=>JSON.stringify({kind:'exact-design:spacing',id:'node',plan:'plan',boxes});
  expect(decodeSpacing('view-1',message([box])).boxes).toEqual([{...box,linked:1}]);
  const gaps=decodeSpacing('view-1',message([box,{...box,key:'row-gap-1',property:'row-gap'},{...box,key:'row-gap-2',property:'row-gap',extra:1}])).boxes;
  expect(gaps.map(b=>b.linked)).toEqual([1,2,2]);expect('extra' in gaps[2]).toBe(false);
  for(const boxes of [[{...box,x:Infinity}],[{...box,property:'width'}],[{...box,width:-1}],[box,box],Array(45).fill(box)])expect(decodeSpacing('view-1',message(boxes)).boxes).toEqual([]);
  expect(decodeSpacing('view-1','not JSON').id).toBe('');
});
test('guest messages carry Alt-hover distances and the selection size',()=>{
  const line={key:'measure-x-0',property:'measure-x',x:10,y:20,width:16,height:1,labelX:18,labelY:20,value:'16',label:true};
  const decoded=decodeSpacing('view-1',JSON.stringify({kind:'exact-design:spacing',id:'node',plan:'plan',width:120.04,height:-3,boxes:[line]}));
  expect(decoded.boxes).toEqual([{...line,linked:1}]);expect(decoded.width).toBe(120);expect(decoded.height).toBe(0);
});
test('Alt-hover distances measure gaps between siblings and insets inside a parent',()=>{
  const a=rect(10,10,40,20);
  const right=measureDistance(a,rect(70,15,30,30));
  expect(right.filter((b:any)=>b.property==='measure-x')).toEqual([expect.objectContaining({x:50,width:20,value:'20',labelY:22.5})]);
  expect(right.some((b:any)=>b.property==='measure-y')).toBe(false);
  expect(right.at(-1)).toMatchObject({property:'measure-target',x:70,y:15,width:30,height:30});
  const below=measureDistance(a,rect(0,50,100,10));
  expect(below.filter((b:any)=>b.property==='measure-y').map((b:any)=>b.value)).toEqual(['20']);
  const parent=measureDistance(a,rect(0,0,100,50));
  expect(parent.filter((b:any)=>b.property!=='measure-target').map((b:any)=>[b.property,b.value])).toEqual([['measure-y','10'],['measure-y','20'],['measure-x','10'],['measure-x','50']]);
  // A child inside the selection measures from its edges outward to the selection's.
  expect(measureDistance(rect(0,0,100,50),a).filter((b:any)=>b.property==='measure-x').map((b:any)=>b.value)).toEqual(['10','50']);
  expect(measureDistance(a,rect(10,10,40,20)).filter((b:any)=>b.property!=='measure-target')).toEqual([]);
});
