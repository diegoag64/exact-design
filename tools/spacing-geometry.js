const number=value=>Math.max(0,parseFloat(value)||0);
const value=n=>String(Math.round(n*10)/10);

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
    boxes.push({key:property+'-'+boxes.length,property,x:x1,y:y1,width:x2-x1,height:y2-y1,labelX:(x1+x2)/2,labelY:(y1+y2)/2,value:value(n),label:false});
  }
  const pt=number(css.paddingTop),pr=number(css.paddingRight),pb=number(css.paddingBottom),pl=number(css.paddingLeft);
  add('padding-top',left,top,right-left,pt*sy,pt);
  add('padding-bottom',left,bottom-pb*sy,right-left,pb*sy,pb);
  add('padding-left',left,top+pt*sy,pl*sx,Math.max(0,bottom-top-(pt+pb)*sy),pl);
  add('padding-right',right-pr*sx,top+pt*sy,pr*sx,Math.max(0,bottom-top-(pt+pb)*sy),pr);
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
    const gap=number(horizontal?css.columnGap:css.rowGap),scaledGap=gap*(horizontal?sx:sy);
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
    const crossGap=number(horizontal?css.rowGap:css.columnGap),scaledCrossGap=crossGap*(horizontal?sy:sx);
    for(let i=1;i<lines.length;i++){
      const space=lines[i].start-lines[i-1].end;if(space+0.5<scaledCrossGap)continue;
      const start=lines[i-1].end+(space-scaledCrossGap)/2;
      if(horizontal)add('row-gap',left+pl*sx,start,right-left-(pl+pr)*sx,scaledCrossGap,crossGap);
      else add('column-gap',start,top+pt*sy,scaledCrossGap,bottom-top-(pt+pb)*sy,crossGap);
    }
  }
  // Repeated gaps get one value, placed on the largest visible segment.
  for(const property of new Set(boxes.map(b=>b.property))){
    const candidates=boxes.filter(b=>b.property===property).sort((a,b)=>b.width*b.height-a.width*a.height);
    candidates[0].label=true;
    if(property==='column-gap')candidates[0].labelY=Math.max(10,candidates[0].y-10);
  }
  return boxes;
}
