const number=value=>Math.max(0,parseFloat(value)||0);
const value=n=>String(Math.round(n*10)/10);
// Percentage/calc gaps can remain unresolved in computed style. Do not label
// their numeric prefix as pixels; the inspector still exposes authored values.
const gapPixels=value=>typeof value==='string'&&/^(?:\d+(?:\.\d+)?|\.\d+)px$/.test(value)?number(value):0;

/** Measurements stay in the guest's viewport coordinates, before canvas zoom. */
export function measureSpacing(el,styleOf,viewport){
  const r=el.getBoundingClientRect(),css=styleOf(el),boxes=[];
  if(!r.width||!r.height)return boxes;
  let clip={left:0,top:0,right:viewport.width,bottom:viewport.height};
  for(let parent=el.parentElement;parent;parent=parent.parentElement){
    const s=styleOf(parent),rect=parent.getBoundingClientRect();
    if(/auto|scroll|hidden|clip/.test(s.overflowX))clip={...clip,left:Math.max(clip.left,rect.left),right:Math.min(clip.right,rect.right)};
    if(/auto|scroll|hidden|clip/.test(s.overflowY))clip={...clip,top:Math.max(clip.top,rect.top),bottom:Math.min(clip.bottom,rect.bottom)};
  }
  const sx=el.offsetWidth?r.width/el.offsetWidth:1,sy=el.offsetHeight?r.height/el.offsetHeight:1;
  const left=r.left+number(css.borderLeftWidth)*sx,top=r.top+number(css.borderTopWidth)*sy;
  const right=r.right-number(css.borderRightWidth)*sx,bottom=r.bottom-number(css.borderBottomWidth)*sy;
  function add(property,x,y,width,height,n){
    if(n<=0||width<=0||height<=0||boxes.length>=36)return;
    const x1=Math.max(x,clip.left),y1=Math.max(y,clip.top),x2=Math.min(x+width,clip.right),y2=Math.min(y+height,clip.bottom);
    if(x2<=x1||y2<=y1)return;
    // Keys count within a property, so clipping one kind never renumbers another.
    boxes.push({key:property+'-'+boxes.filter(b=>b.property===property).length,property,x:x1,y:y1,width:x2-x1,height:y2-y1,labelX:(x1+x2)/2,labelY:(y1+y2)/2,value:value(n),label:false});
  }
  const pt=number(css.paddingTop),pr=number(css.paddingRight),pb=number(css.paddingBottom),pl=number(css.paddingLeft);
  add('padding-top',left,top,right-left,pt*sy,pt);
  add('padding-bottom',left,bottom-pb*sy,right-left,pb*sy,pb);
  add('padding-left',left,top+pt*sy,pl*sx,Math.max(0,bottom-top-(pt+pb)*sy),pl);
  add('padding-right',right-pr*sx,top+pt*sy,pr*sx,Math.max(0,bottom-top-(pt+pb)*sy),pr);
  // Margins sit outside the border box. Negative and auto margins have no
  // area to draw, so only positive ones are shown.
  const mt=number(css.marginTop),mr=number(css.marginRight),mb=number(css.marginBottom),ml=number(css.marginLeft);
  add('margin-top',r.left,r.top-mt*sy,r.width,mt*sy,mt);
  add('margin-bottom',r.left,r.bottom,r.width,mb*sy,mb);
  add('margin-left',r.left-ml*sx,r.top,ml*sx,r.height,ml);
  add('margin-right',r.right,r.top,mr*sx,r.height,mr);
  if(css.display.includes('flex')){
    const horizontal=css.flexDirection.startsWith('row');
    const children=[...el.children].filter(child=>{
      const s=styleOf(child),rect=child.getBoundingClientRect();
      return !['absolute','fixed'].includes(s.position)&&s.display!=='none'&&rect.width>0&&rect.height>0;
    }).map(child=>child.getBoundingClientRect());
    const main=horizontal?'left':'top',end=horizontal?'right':'bottom',cross=horizontal?'top':'left',crossEnd=horizontal?'bottom':'right';
    const lines=[];
    for(const child of children){
      let line=css.flexWrap==='nowrap'?lines[0]:lines.find(line=>Math.min(line.end,child[crossEnd])-Math.max(line.start,child[cross])>0.5);
      if(!line){line={start:child[cross],end:child[crossEnd],children:[]};lines.push(line);}
      line.start=Math.min(line.start,child[cross]);line.end=Math.max(line.end,child[crossEnd]);line.children.push(child);
    }
    const gap=gapPixels(horizontal?css.columnGap:css.rowGap),scaledGap=gap*(horizontal?sx:sy);
    for(const line of lines){
      line.children.sort((a,b)=>a[main]-b[main]);
      for(let i=1;i<line.children.length;i++){
        const previous=line.children[i-1],next=line.children[i],space=next[main]-previous[end];
        if(space+0.5<scaledGap)continue;
        const start=previous[end]+(space-scaledGap)/2;
        if(horizontal)add('column-gap',start,line.start,scaledGap,line.end-line.start,gap);
        else add('row-gap',line.start,start,line.end-line.start,scaledGap,gap);
      }
    }
    lines.sort((a,b)=>a.start-b.start);
    const crossGap=gapPixels(horizontal?css.rowGap:css.columnGap),scaledCrossGap=crossGap*(horizontal?sy:sx);
    for(let i=1;i<lines.length;i++){
      const space=lines[i].start-lines[i-1].end;if(space+0.5<scaledCrossGap)continue;
      const start=lines[i-1].end+(space-scaledCrossGap)/2;
      if(horizontal)add('row-gap',left+pl*sx,start,right-left-(pl+pr)*sx,scaledCrossGap,crossGap);
      else add('column-gap',start,top+pt*sy,scaledCrossGap,bottom-top-(pt+pb)*sy,crossGap);
    }
  }
  // Every visible segment carries its value; repeated gaps share one property,
  // so the studio shows them as linked. Column-gap labels sit above the strip,
  // which is usually narrower than the label.
  for(const box of boxes){
    box.label=true;
    if(box.property==='column-gap')box.labelY=Math.max(10,box.y-10);
  }
  return boxes;
}

/** Figma-style redlines between the selection and another element, in the guest's viewport coordinates.
 *  An element that encloses the other measures to its inner edges; separate elements measure the gap
 *  on each axis where they are apart, and overlapping ones the offset between matching edges. */
export function measureDistance(a,b){
  const boxes=[];
  if(!a.width||!a.height||!b.width||!b.height)return boxes;
  const line=(property,x1,y1,x2,y2,n)=>{
    if(n<0.5||boxes.length>=5)return;
    const horizontal=property==='measure-x',x=Math.min(x1,x2),y=Math.min(y1,y2);
    boxes.push({key:property+'-'+boxes.length,property,x:horizontal?x:x-0.5,y:horizontal?y-0.5:y,width:horizontal?Math.abs(x2-x1):1,height:horizontal?1:Math.abs(y2-y1),labelX:horizontal?(x1+x2)/2:x,labelY:horizontal?y:(y1+y2)/2,value:value(n),label:true});
  };
  const contains=(o,i)=>o.left<=i.left+0.5&&o.top<=i.top+0.5&&o.right>=i.right-0.5&&o.bottom>=i.bottom-0.5;
  const inner=contains(b,a)?a:contains(a,b)?b:null,outer=inner===a?b:a;
  const cx=(r)=>(r.left+r.right)/2,cy=(r)=>(r.top+r.bottom)/2;
  if(inner){
    line('measure-y',cx(inner),outer.top,cx(inner),inner.top,inner.top-outer.top);
    line('measure-y',cx(inner),inner.bottom,cx(inner),outer.bottom,outer.bottom-inner.bottom);
    line('measure-x',outer.left,cy(inner),inner.left,cy(inner),inner.left-outer.left);
    line('measure-x',inner.right,cy(inner),outer.right,cy(inner),outer.right-inner.right);
  }else{
    // Lines run through the middle of the axes' overlap, or from the selection's middle when there is none.
    const top=Math.max(a.top,b.top),bottom=Math.min(a.bottom,b.bottom),left=Math.max(a.left,b.left),right=Math.min(a.right,b.right);
    const y=bottom>top?(top+bottom)/2:cy(a),x=right>left?(left+right)/2:cx(a);
    const apartX=b.left>=a.right?[a.right,b.left]:a.left>=b.right?[b.right,a.left]:null;
    const apartY=b.top>=a.bottom?[a.bottom,b.top]:a.top>=b.bottom?[b.bottom,a.top]:null;
    if(apartX)line('measure-x',apartX[0],y,apartX[1],y,apartX[1]-apartX[0]);
    if(apartY)line('measure-y',x,apartY[0],x,apartY[1],apartY[1]-apartY[0]);
    if(!apartX&&!apartY){
      line('measure-x',Math.min(a.left,b.left),y,Math.max(a.left,b.left),y,Math.abs(a.left-b.left));
      line('measure-y',x,Math.min(a.top,b.top),x,Math.max(a.top,b.top),Math.abs(a.top-b.top));
    }
  }
  if(boxes.length)boxes.push({key:'measure-target-0',property:'measure-target',x:b.left,y:b.top,width:b.width,height:b.height,labelX:b.left,labelY:b.top,value:'0',label:false});
  return boxes;
}
