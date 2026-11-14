// Plan view geometry over plain element records, in the guest's viewport coordinates.
// plan-client.js reads the records from the DOM; everything here is testable without a browser.
//
// A record: {i, p, x, y, w, h, radius, radii:[tl,tr,br,bl], surface, borders:[t,r,b,l], display, dir, gap:[row,column],
//   pad:[t,r,b,l], margin:[t,r,b,l], flow (in normal flow), decorative, label, hint}. `hint` is the first text inside a
//   container whose label is only its kind, so a copied spec says which row is which. `i` and `p` index the document order.

export function maskImageUrl(value){
  const match=value.match(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^'"].*))\s*\)/);
  return match?.[1]??match?.[2]??match?.[3]?.trim()??'';
}
export function decodeSvgDataUrl(url){
  const comma=url.indexOf(',');if(comma<0)return null;
  try{return url.slice(0,comma).endsWith(';base64')?atob(url.slice(comma+1)):decodeURIComponent(url.slice(comma+1));}catch{return null;}
}

// Computed colours are `rgb(r, g, b)` when opaque and `rgba(r, g, b, a)` or `rgb(r g b / a)` otherwise.
// Only an alpha of 0 is invisible: pure black, `rgb(0, 0, 0)`, is a colour.
export const visibleColor=c=>!!c&&c!=='transparent'&&!/^rgba\([^,]+,[^,]+,[^,]+,\s*0(?:\.0+)?\s*\)$/.test(c)&&!/\/\s*0(?:\.0+)?%?\s*\)$/.test(c);
export const near=(a,b,t=0.75)=>Math.abs(a-b)<=t;
export const isSurface=e=>e.surface||e.borders.some(Boolean);
export const cornerRadius=e=>Math.min(e.radius,e.w/2,e.h/2);
const round=n=>Math.round(n*10)/10;

export function fieldText(type,value='',placeholder=''){
  if(type==='password')return value?'•'.repeat(value.length):placeholder;
  if(['checkbox','radio','range','color','file','image','hidden'].includes(type))return '';
  if(['button','submit','reset'].includes(type))return value;
  return value||placeholder;
}

export function index(records){
  const byI=new Map(records.map(e=>[e.i,e])),kids=new Map();
  for(const e of records){if(!kids.has(e.p))kids.set(e.p,[]);kids.get(e.p).push(e);}
  return {byI,kids};
}
export function surfaceAncestor(e,byI){
  for(let p=byI.get(e.p);p;p=byI.get(p.p))if(isSurface(p)&&!p.decorative)return p;
  return null;
}
// A surface that starts at its parent surface's edge, shares its height and is narrower
// reads as the filled part of a track, like a progress bar. It keeps a light tint.
export function valueFill(e,byI){
  const a=surfaceAncestor(e,byI);
  return !!a&&e.surface&&near(e.x,a.x)&&near(e.y,a.y)&&near(e.h,a.h)&&e.w<a.w-1;
}
// How to draw a surface: a single hairline, a rounded outline, or only the edges inside the
// screen. A full-width bar's outer edges sit on the screen edge, which the frame line draws.
export function surfaceShape(e,vw,vh){
  if(e.h<=1.5)return {kind:'line',x1:e.x,y1:e.y+e.h/2,x2:e.x+e.w,y2:e.y+e.h/2};
  if(e.w<=1.5)return {kind:'line',x1:e.x+e.w/2,y1:e.y,x2:e.x+e.w/2,y2:e.y+e.h};
  const r=cornerRadius(e);
  if(r>0)return {kind:'rect',r};
  const r2=e.x+e.w,b=e.y+e.h,edges=[];
  if(!near(e.y,0))edges.push([e.x,e.y,r2,e.y]);
  if(!near(r2,vw))edges.push([r2,e.y,r2,b]);
  if(!near(b,vh))edges.push([e.x,b,r2,b]);
  if(!near(e.x,0))edges.push([e.x,e.y,e.x,b]);
  return edges.length===4?{kind:'rect',r:0}:{kind:'edges',edges};
}
// A layout-only wrapper worth outlining: it holds elements, and its box is neither the screen's
// nor its parent's, which already draw that outline.
export function layoutBox(e,byI,kids,vw,vh){
  if(isSurface(e)||e.decorative||covers(e,vw,vh)||!(kids.get(e.i)?.length||e.media))return false;
  const p=byI.get(e.p);
  return !(p&&near(p.x,e.x)&&near(p.y,e.y)&&near(p.w,e.w)&&near(p.h,e.h));
}
export const covers=(e,vw,vh)=>e.x<=0.5&&e.y<=0.5&&e.x+e.w>=vw-0.5&&e.y+e.h>=vh-0.5;

const within=(e,R,t=1)=>e.x>=R.x-t&&e.y>=R.y-t&&e.x+e.w<=R.x+R.w+t&&e.y+e.h<=R.y+R.h+t;
const sameRect=(a,b)=>near(a.x,b.x)&&near(a.y,b.y)&&near(a.w,b.w)&&near(a.h,b.h);
const visibleIn=(e,c)=>!c||(e.y>=c.y-1&&e.y+e.h<=c.b+1&&e.x>=c.x-1&&e.x+e.w<=c.r+1);

/** What a region measures: every element whose box lies inside it. Siblings with the same
 *  structure and whole-pixel layout measurements are labeled once: the first carries
 *  a ×N badge and the rest become outlines. `media` are icons, images and inline SVGs. */
export function measureRegion(records,media,R){
  const {byI,kids}=index(records);
  const leafCount=e=>(kids.get(e.i)?.length||0)+media.filter(m=>m.p===e.i).length;
  // Width and margins are compared for the siblings themselves only: a child's width or used
  // auto margin follows its text or value, so rows of the same structure would never group.
  const shape=(e,top=true)=>[...(top?[e.w,...e.margin]:[]),e.h,...e.pad,...e.gap,...e.radii].map(Math.round).join(',')+';'+e.display+';'+e.dir+'('+
    [...(kids.get(e.i)||[]).map(k=>shape(k,false)),...media.filter(m=>m.p===e.i).map(m=>'m'+Math.round(m.w)+','+Math.round(m.h))].join(';')+')';
  const inside=records.filter(e=>!e.decorative&&within(e,R)&&visibleIn(e,e.clip));
  const inM=new Set(inside.map(e=>e.i)),skip=new Set(),badges=[],repeats=[],siblings=new Map();
  for(const e of inside){if(!siblings.has(e.p))siblings.set(e.p,[]);siblings.get(e.p).push(e);}
  for(const list of siblings.values()){
    const groups=new Map();
    for(const e of list){if(!leafCount(e))continue;const k=shape(e);if(!groups.has(k))groups.set(k,[]);groups.get(k).push(e);}
    for(const g of groups.values())if(g.length>1){
      g.sort((a,b)=>a.y-b.y||a.x-b.x);badges.push({e:g[0],n:g.length});
      for(const r of g.slice(1)){skip.add(r.i);repeats.push(r);}
    }
  }
  const skipped=e=>{for(let p=e;p;p=byI.get(p.p))if(skip.has(p.i))return true;return false;};
  const live=inside.filter(e=>!skipped(e));
  const sizes=[
    ...live.filter(e=>{
      const parent=byI.get(e.p);if(parent&&inM.has(parent.i)&&sameRect(parent,e))return false;
      return (isSurface(e)&&e.w>=24&&e.h>=16)||(!leafCount(e)&&e.w>=24&&e.h>=24);
    }),
    ...media.filter(m=>within(m,R)&&!skipped({i:-2,p:m.p})&&m.w>=24&&m.h>=24),
  ];
  const radii=live.filter(e=>{const a=surfaceAncestor(e,byI);return isSurface(e)&&cornerRadius(e)>=4&&e.w>=24&&e.h>=24&&!(a&&inM.has(a.i));});
  return {live,repeats,badges,sizes,radii,inM};
}

const values=list=>list.every(v=>v===list[0])?String(list[0]):list.join(' ');
/** The region as text, indented like the Layers panel: size, padding, gap, radius, repeats. */
export function regionSpec(R,m,records){
  const {byI,kids}=index(records),badge=new Map(m.badges.map(b=>[b.e.i,b.n]));
  const rows=[];
  for(const e of m.live){
    const flowKids=(kids.get(e.i)||[]).filter(k=>k.flow).length+(e.media||0);
    const row=e.dir.startsWith('row'),flex=e.display.includes('flex'),grid=e.display.includes('grid');
    const gap=flowKids>1?(grid?values([e.gap[0],e.gap[1]].map(round)):flex?String(round(row?e.gap[1]:e.gap[0])):''):'';
    const padded=e.pad.some(v=>v>0);
    if(!padded&&(gap===''||gap==='0')&&!isSurface(e)&&!badge.has(e.i))continue;
    const parts=[`${Math.round(e.w)} × ${Math.round(e.h)}`];
    if(padded)parts.push('padding '+values(e.pad.map(round)));
    if(gap!==''&&gap!=='0')parts.push('gap '+gap);
    if(isSurface(e)&&cornerRadius(e)>=1)parts.push('radius '+Math.round(cornerRadius(e)));
    if(badge.has(e.i))parts.push('×'+badge.get(e.i));
    rows.push({e,text:(e.hint?`${e.label} "${e.hint}"`:e.label)+' · '+parts.join(' · ')});
  }
  // Indent by printed ancestors, so a skipped wrapper never leaves a gap in the outline.
  const printed=new Set(rows.map(r=>r.e.i));
  const depth=e=>{let d=0;for(let p=byI.get(e.p);p;p=byI.get(p.p))if(printed.has(p.i))d++;return d;};
  return [`Region ${Math.round(R.w)} × ${Math.round(R.h)} at ${Math.round(R.x)}, ${Math.round(R.y)}`,...rows.map(r=>'  '.repeat(depth(r.e)+1)+r.text)].join('\n');
}

/** Places a label box, sliding it along `axis` when it collides. Returns the box, or null when
 *  it has no room; at a higher zoom labels are smaller and it fits. */
export function placeLabel(placed,x,y,w,h,axis,bounds){
  for(const k of axis?[0,1,-1,2,-2]:[0]){
    const b={x:x+(axis==='x'?k*(w+3*h/14):0)-w/2,y:y+(axis==='y'?k*(h*1.2):0)-h/2,w,h};
    if(k&&bounds&&(b.x<bounds.x||b.y<bounds.y||b.x+w>bounds.r||b.y+h>bounds.b))continue;
    if(!placed.some(p=>b.x<p.x+p.w&&b.x+w>p.x&&b.y<p.y+p.h&&b.y+h>p.y)){placed.push(b);return b;}
  }
  return null;
}
