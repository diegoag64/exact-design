// Plan view for canvas previews. The app keeps its real layout but paints nothing: a line
// drawing of it sits on top, so hit testing, selection and draft editing still reach the
// app's own elements. Regions measure everything inside a dragged rectangle.
// Loaded by canvas-input-client.js on the first plan or region message; never in Preview.
import {maskImageUrl,decodeSvgDataUrl,fieldText,lineWords,isSurface,cornerRadius,index,valueFill,surfaceShape,layoutBox,visibleColor,measureRegion,regionSpec,placeLabel} from './plan-geometry.js';
import {measureSpacing} from './spacing-geometry.js';

const NS='http://www.w3.org/2000/svg';
// The canvas renderer cannot read Tamber tokens, so the studio's spacing, accent and panel
// colors are repeated here (studio/app.tamber). The plan palette is drawing paper and
// graphite in light mode and a blueprint in dark mode. It follows the Screens theme: the plan is a drawing of the screens.
const CSS=`
#ed-plan{position:fixed;inset:0;pointer-events:none;z-index:2147483646;contain:strict;
  --paper:#fcfcfd;--ink:#1e2a3a;--tint:color-mix(in srgb,#1e2a3a 12%,#fcfcfd);--scrim:rgb(255 255 255/.6);--label:#ffffff;
  --accent:#0d99ff;--on-accent:#ffffff;
  --padding:#22c55e1f;--padding-edge:#16a34a73;--padding-ink:#15803d;
  --margin:#f973161f;--margin-edge:#ea580c73;--margin-ink:#c2410c;
  --gap:#d946ef14;--gap-edge:#c026d373;--gap-ink:#a21caf}
#ed-plan[data-scheme="dark"]{
  --paper:#0f1724;--ink:#c9d7ea;--tint:color-mix(in srgb,#c9d7ea 14%,#0f1724);--scrim:rgb(15 23 36/.62);--label:#2c2c2c;
  --padding-ink:#86efac;--margin-ink:#fdba74;--gap-ink:#efabf5}
#ed-plan svg{position:absolute;inset:0;width:100%;height:100%;overflow:visible}
#ed-plan text:not([data-app]){font-family:system-ui,-apple-system,sans-serif;font-weight:600;font-variant-numeric:tabular-nums}`;
// The app paints nothing while the plan shows; modal sheets leave the top layer clear too.
const HIDE='#exact-root,:modal,:modal::backdrop{opacity:0!important}';
const SHAPES='path,circle,ellipse,rect,line,polyline,polygon,text';
const GEOMETRY=['cx','cy','r','rx','ry','x','y','width','height','d','transform','transform-origin','transform-box','stroke-dasharray','stroke-dashoffset','stroke-linecap','stroke-linejoin','display','visibility'];

// With Screens set to System, the plan follows the browser's scheme and its changes.
const systemDark=matchMedia('(prefers-color-scheme: dark)');
let zoom=1,pinnedScheme=null,planScheme=systemDark.matches?'dark':'light',planOn=false,planBoxes=false,planText=false,regionBox=null,dragFrom=null,copied=0,scheduled=0;
let host,svg,planLayer,regionLayer,defs,hideStyle,observer;
const k=()=>1/zoom; // one screen pixel in guest pixels
const el=(tag,attrs={},parent)=>{const n=document.createElementNS(NS,tag);for(const key in attrs)n.setAttribute(key,attrs[key]);parent?.append(n);return n;};
const measureCanvas=document.createElement('canvas').getContext('2d');
function textWidth(text,font){measureCanvas.font=font;return measureCanvas.measureText(text).width;}

function mount(){
  if(host?.isConnected)return;
  if(!host){
    const style=document.createElement('style');style.textContent=CSS;document.head.append(style);
    host=document.createElement('div');host.id='ed-plan';host.setAttribute('aria-hidden','true');host.dataset.scheme=planScheme;
    svg=el('svg',{},host);defs=el('defs',{},svg);planLayer=el('g',{},svg);regionLayer=el('g',{},svg);
    // The studio's hover outline moves every frame and the inspector keeps its own nodes; neither is layout.
    const ours=n=>host.contains(n)||n.dataset?.edHover!==undefined||!!n.closest?.('#exact-inspect');
    observer=new MutationObserver(list=>{if(list.some(m=>!ours(m.target)))schedule();});
    addEventListener('resize',schedule);addEventListener('scroll',schedule,true);
    for(const type of ['transitionend','animationend','load'])addEventListener(type,schedule,true);
  }
  (document.body??document.documentElement).append(host);
}
function active(){return planOn||!!regionBox;}
function schedule(){
  if(scheduled||!active())return;
  scheduled=requestAnimationFrame(()=>{scheduled=0;draw();});
}
function watch(){
  // Clearing can make the preview idle, so report it without waiting for a draw.
  if(!regionBox)report(null);
  if(active()){mount();observer.observe(document.documentElement,{subtree:true,childList:true,attributes:true,characterData:true});schedule();}
  else{observer?.disconnect();host?.remove();}
}

/* Reading the layout ---------------------------------------------------------------- */
const px=v=>/^-?\d*\.?\d+px$/.test(v)?parseFloat(v):0;
function layerName(node,s){
  // The names the Layers panel shows, so a copied spec reads like the tree.
  const tag=node.localName,text=node.textContent?.trim().replace(/\s+/g,' ').slice(0,40)||'';
  const flex=s.display.includes('flex'),grid=s.display.includes('grid'),leaf=!node.querySelector('[data-site]');
  const kind=tag==='button'?'Button':tag==='img'||tag==='svg'?'Image':['input','textarea','select'].includes(tag)?'Input':tag==='main'?'Screen':flex?(s.flexDirection.startsWith('row')?'Row':'Column'):grid?'Grid':leaf&&text?'Text':'Container';
  const explicit=(node.getAttribute('aria-label')||node.getAttribute('data-testid')||'').trim().replace(/\s+/g,' ').slice(0,40);
  return explicit||((kind==='Text'||kind==='Button')&&text?text:kind);
}
const firstText=node=>{
  const walk=document.createTreeWalker(node,NodeFilter.SHOW_TEXT);
  for(let t=walk.nextNode();t;t=walk.nextNode()){const text=t.textContent.trim().replace(/\s+/g,' ');if(text)return text;}
  return '';
};
const svgSources=new Map();
function svgSource(url){
  // Mask and image icons are SVG documents: data URLs decode now, same-origin files load once.
  if(!url)return null;
  if(svgSources.has(url))return svgSources.get(url);
  if(url.startsWith('data:image/svg+xml')){
    const text=decodeSvgDataUrl(url);
    svgSources.set(url,text===null?null:parseSvg(text));return svgSources.get(url);
  }
  let same=false;try{const u=new URL(url,location.href);same=u.origin===location.origin&&/\.svg$/i.test(u.pathname);}catch{}
  svgSources.set(url,same?'loading':null);
  if(same)fetch(url).then(r=>r.ok?r.text():'').then(text=>{svgSources.set(url,text?parseSvg(text):null);schedule();}).catch(()=>svgSources.set(url,null));
  return svgSources.get(url);
}
function parseSvg(text){
  const doc=new DOMParser().parseFromString(text,'image/svg+xml').documentElement;
  if(doc.localName!=='svg')return null;
  const w=parseFloat(doc.getAttribute('width'))||24,h=parseFloat(doc.getAttribute('height'))||24;
  return {viewBox:doc.getAttribute('viewBox')||`0 0 ${w} ${h}`,shapes:[...doc.querySelectorAll(SHAPES)].filter(n=>!n.closest('defs,mask,clipPath,pattern'))};
}
// Readable text: the words on each wrapped line of a text node. A word belongs to the line its
// first box sits on. Scrolling and redraws reuse the answer while the text and its line widths hold.
const lineCache=new WeakMap();
const cased=(text,s)=>s.textTransform==='uppercase'?text.toUpperCase():s.textTransform==='lowercase'?text.toLowerCase():s.textTransform==='capitalize'?text.replace(/(^|\s)\S/g,c=>c.toUpperCase()):text;
function lineTexts(node,lines){
  const text=node.textContent,sig=text+'|'+lines.map(l=>Math.round(l.width)).join(','),hit=lineCache.get(node);
  if(hit?.sig===sig)return hit.words;
  const range=document.createRange();
  const out=lineWords(text,lines,offset=>{
    range.setStart(node,offset);range.setEnd(node,offset+(text.codePointAt(offset)>0xffff?2:1));
    return range.getClientRects()[0]??null;
  });
  lineCache.set(node,{sig,words:out});return out;
}
// One box per line. An ellipsized line reports its full text and its visible part as two boxes on
// the same line, so overlapping boxes at one height collapse to the widest.
function textLines(range){
  const lines=[];
  for(const r of range.getClientRects()){
    if(r.width<=0.5)continue;
    const same=lines.findIndex(l=>Math.abs(l.top-r.top)<1&&Math.abs(l.height-r.height)<1&&r.left<l.right&&r.right>l.left);
    if(same<0)lines.push(r);else if(r.width>lines[same].width)lines[same]=r;
  }
  return lines;
}
const fontOf=s=>({family:s.fontFamily,style:s.fontStyle,spacing:px(s.letterSpacing)});
const maskUrl=s=>maskImageUrl(s.maskImage||s.webkitMaskImage||'');

function readScene(){
  const root=document.getElementById('exact-root');if(!root)return null;
  const vw=document.documentElement.clientWidth||innerWidth,vh=document.documentElement.clientHeight||innerHeight;
  const records=[],texts=[],media=[],byI=new Map();let n=0;
  const visit=(parent,p,clip,key)=>{
    for(const node of parent.children){
      if(node===host)continue;
      const s=getComputedStyle(node);
      if(s.display==='none'||s.visibility==='hidden'||(s.opacity==='0'&&!node.matches(':modal')))continue;
      if(s.display==='contents'){visit(node,p,clip,key);continue;}
      const r=node.getBoundingClientRect(),tag=node.localName,i=n++;
      const positioned=s.position!=='static',top=node.matches(':modal,:popover-open');
      const z=positioned&&s.zIndex!=='auto'?Number(s.zIndex)||0:key[1];
      const own=[top?1:key[0],z,positioned?1:key[2],i];
      const onScreen=r.width>0&&r.height>0&&r.right>clip.x&&r.left<clip.r&&r.bottom>clip.y&&r.top<clip.b;
      const box={i,p,x:r.left,y:r.top,w:r.width,h:r.height,key:own,clip};
      const mask=maskUrl(s);
      if(tag==='svg'){if(onScreen)media.push({...box,kind:'svg',node});if(byI.has(p))byI.get(p).media++;continue;}
      if(['img','video','canvas','picture','iframe'].includes(tag)||(mask&&!node.children.length)){
        const src=mask||(tag==='img'?node.currentSrc||node.src:'');
        if(onScreen)media.push({...box,kind:'image',src});if(byI.has(p))byI.get(p).media++;continue;
      }
      const color=['Top','Right','Bottom','Left'].map(side=>s[`border${side}Color`]);
      const borders=['Top','Right','Bottom','Left'].map((side,j)=>px(s[`border${side}Width`])>0&&!['none','hidden'].includes(s[`border${side}Style`])&&visibleColor(color[j]));
      const image=/url\(/.test(s.backgroundImage);
      const surface=visibleColor(s.backgroundColor)||s.backgroundImage!=='none'||s.boxShadow!=='none'||(s.backdropFilter||'none')!=='none'||(s.outlineStyle!=='none'&&px(s.outlineWidth)>0&&visibleColor(s.outlineColor));
      const content=!!node.textContent.trim()||!!node.querySelector('img,svg,video,canvas,input,textarea,select,button');
      const bleeds=r.left<-0.5||r.top<-0.5||r.right>vw+0.5;
      // Glows and aurora layers: painted, empty, and either bleeding past the screen, blurred or hidden from assistive tech.
      const decorative=surface&&!borders.some(Boolean)&&!content&&(bleeds||/blur/.test(s.filter)||node.getAttribute('aria-hidden')==='true'||s.pointerEvents==='none');
      if(decorative)continue;
      const radii=[s.borderTopLeftRadius,s.borderTopRightRadius,s.borderBottomRightRadius,s.borderBottomLeftRadius].map(v=>parseFloat(v)||0);
      const record={...box,node,tag,radius:Math.max(...radii),radii,surface,image,borders,display:s.display,dir:s.flexDirection,
        margin:[s.marginTop,s.marginRight,s.marginBottom,s.marginLeft].map(px),
        gap:[px(s.rowGap),px(s.columnGap)],pad:[s.paddingTop,s.paddingRight,s.paddingBottom,s.paddingLeft].map(px),
        flow:!['absolute','fixed'].includes(s.position),decorative:false,label:layerName(node,s),hint:'',media:0,visible:onScreen};
      if(['Row','Column','Grid','Container','Screen'].includes(record.label)){const t=firstText(node);record.hint=t.length>24?t.slice(0,23)+'…':t;}
      records.push(record);byI.set(i,record);
      let inner=clip;
      if(/auto|scroll|hidden|clip/.test(s.overflowX))inner={...inner,x:Math.max(inner.x,r.left),r:Math.min(inner.r,r.right)};
      if(/auto|scroll|hidden|clip/.test(s.overflowY))inner={...inner,y:Math.max(inner.y,r.top),b:Math.min(inner.b,r.bottom)};
      if(onScreen){
        if(['input','textarea','select'].includes(tag)){
          const value=fieldText(tag==='input'?node.type:tag,tag==='select'?node.selectedOptions?.[0]?.text??'':node.value,node.placeholder);
          if(value)texts.push({x:r.left+px(s.paddingLeft)+px(s.borderLeftWidth),y:r.top,w:Math.min(textWidth(value,s.font),r.width-px(s.paddingLeft)-px(s.paddingRight)),h:r.height,fs:parseFloat(s.fontSize),weight:node.value?400:300,key:[...own,1],clip:inner,text:value,field:true,...fontOf(s)});
        }else for(const child of node.childNodes){
          if(child.nodeType!==3||!child.textContent.trim()||!visibleColor(s.color))continue;
          const range=document.createRange();range.selectNodeContents(child);
          const lines=textLines(range),words=planText?lineTexts(child,lines):[];
          lines.forEach((line,j)=>texts.push({x:line.left,y:line.top,w:line.width,h:line.height,fs:parseFloat(s.fontSize),weight:Number(s.fontWeight)||400,key:[...own,1],clip:inner,text:cased(words[j]??'',s),...fontOf(s)}));
        }
      }
      visit(node,i,inner,own);
    }
  };
  visit(root,-1,{x:0,y:0,r:vw,b:vh},[0,0,0,0]);
  return {records,texts,media,vw,vh};
}

/* Drawing the plan ------------------------------------------------------------------ */
const compare=(a,b)=>{for(let j=0;j<Math.max(a.length,b.length);j++){const d=(a[j]??-1)-(b[j]??-1);if(d)return d;}return 0;};
function roundedPath(x,y,w,h,[tl,tr,br,bl]){
  const c=r=>Math.min(r,w/2,h/2);[tl,tr,br,bl]=[tl,tr,br,bl].map(c);
  return `M${x+tl} ${y}H${x+w-tr}A${tr} ${tr} 0 0 1 ${x+w} ${y+tr}V${y+h-br}A${br} ${br} 0 0 1 ${x+w-br} ${y+h}H${x+bl}A${bl} ${bl} 0 0 1 ${x} ${y+h-bl}V${y+tl}A${tl} ${tl} 0 0 1 ${x+tl} ${y}Z`;
}
let clips=new Map();
function clipFor(c,vw,vh){
  if(c.x<=0&&c.y<=0&&c.r>=vw&&c.b>=vh)return null;
  const id=`ed-clip-${Math.round(c.x)}-${Math.round(c.y)}-${Math.round(c.r)}-${Math.round(c.b)}`;
  if(!clips.has(id)){const path=el('clipPath',{id},defs);el('rect',{x:c.x,y:c.y,width:Math.max(0,c.r-c.x),height:Math.max(0,c.b-c.y)},path);clips.set(id,true);}
  return `url(#${id})`;
}
function line(parent,x1,y1,x2,y2,attrs={}){return el('line',{x1,y1,x2,y2,stroke:'var(--ink)','stroke-width':k(),...attrs},parent);}
function drawSurface(g,e,byI,vw,vh){
  const shape=surfaceShape(e,vw,vh),fill=valueFill(e,byI)?'var(--tint)':'var(--paper)';
  if(shape.kind==='line'){line(g,shape.x1,shape.y1,shape.x2,shape.y2,{'stroke-opacity':.55});return;}
  if(shape.kind==='rect')el('path',{d:roundedPath(e.x,e.y,e.w,e.h,e.radii),fill,stroke:'var(--ink)','stroke-width':k()},g);
  else{el('rect',{x:e.x,y:e.y,width:e.w,height:e.h,fill},g);for(const[x1,y1,x2,y2]of shape.edges)line(g,x1,y1,x2,y2);}
  if(e.image)crossed(g,e);
}
function crossed(g,b){
  // Photos and other bitmaps: a crossed box, as in an architect's placeholder.
  el('rect',{x:b.x,y:b.y,width:b.w,height:b.h,fill:'var(--paper)',stroke:'var(--ink)','stroke-width':k()*.75,'stroke-opacity':.7},g);
  el('path',{d:`M${b.x} ${b.y}L${b.x+b.w} ${b.y+b.h}M${b.x+b.w} ${b.y}L${b.x} ${b.y+b.h}`,stroke:'var(--ink)','stroke-width':k()*.6,'stroke-opacity':.45},g);
}
function drawText(g,t){
  // Readable text draws words only: a line with none draws nothing, not a bar.
  if(planText){
    if(!t.text)return;
    // The app's own words in its own font, in ink. Each line keeps its measured width, so wrapping and alignment hold.
    const n=el('text',{'data-app':'',x:t.x,y:t.y+t.h/2,'dominant-baseline':'central','font-size':t.fs,'font-weight':t.weight,'font-style':t.style,'font-family':t.family,fill:'var(--ink)','fill-opacity':t.field&&t.weight<400?.45:.8},g);
    if(t.spacing)n.setAttribute('letter-spacing',t.spacing);
    // A field's width is estimated; a line's is measured, so it pins the drawn text.
    if(!t.field)n.setAttribute('textLength',t.w);
    n.textContent=t.text;return;
  }
  // A bar at x-height that follows each wrapped line. Display text is outlined so large numbers stay light.
  const h=Math.max(2,t.fs*.42),y=t.y+t.h/2-h/2+t.fs*.04,radius=Math.min(1.5,h/2);
  if(t.fs>=20)el('rect',{x:t.x,y,width:t.w,height:h,rx:radius,fill:'var(--ink)','fill-opacity':.06,stroke:'var(--ink)','stroke-opacity':.55,'stroke-width':k()},g);
  else el('rect',{x:t.x,y,width:t.w,height:h,rx:radius,fill:'var(--ink)','fill-opacity':.18+Math.max(0,Math.min(300,t.weight-400))/300*.22},g);
}
function outlineShape(n){
  n.setAttribute('fill','none');n.setAttribute('stroke','var(--ink)');n.setAttribute('stroke-width',k());
  n.setAttribute('vector-effect','non-scaling-stroke');n.setAttribute('stroke-linejoin','round');n.setAttribute('stroke-linecap','round');
}
function drawIcon(g,m){
  const source=svgSource(m.src);
  if(!source||source==='loading'){if(!source)crossed(g,m);return;}
  const box=el('svg',{x:m.x,y:m.y,width:m.w,height:m.h,viewBox:source.viewBox,overflow:'visible'},g);
  for(const shape of source.shapes){
    const copy=el(shape.localName),transforms=[shape.getAttribute('transform')||''];
    const attrs='d cx cy r rx ry x y width height points x1 y1 x2 y2 transform'+(shape.localName==='text'?' dx dy rotate textLength lengthAdjust font-family font-size font-weight font-style font-stretch font-variant letter-spacing word-spacing text-anchor dominant-baseline alignment-baseline baseline-shift direction writing-mode':'');
    for(const name of attrs.split(' '))if(shape.hasAttribute(name))copy.setAttribute(name,shape.getAttribute(name));
    for(let p=shape.parentElement;p&&p.localName!=='svg';p=p.parentElement)if(p.localName==='g'&&p.hasAttribute('transform'))transforms.unshift(p.getAttribute('transform'));
    if(transforms.some(Boolean))copy.setAttribute('transform',transforms.join(' '));
    if(shape.localName==='text')copy.textContent=shape.textContent;outlineShape(copy);box.append(copy);
  }
}
function drawInlineSvg(g,m){
  const source=m.node,copy=source.cloneNode(true),set=(n,p,v)=>n.style.setProperty(p,v,'important');
  for(const n of copy.querySelectorAll('style,script,foreignObject'))n.remove();
  for(const n of [copy,...copy.querySelectorAll('*')])for(const {name} of [...n.attributes])if(/^(on.*|tabindex|autofocus|id)$/i.test(name))n.removeAttribute(name);
  copy.removeAttribute('class');copy.removeAttribute('style');
  Object.entries({x:m.x,y:m.y,width:m.w,height:m.h,overflow:'visible'}).forEach(([a,v])=>copy.setAttribute(a,v));
  const ctm=source.getScreenCTM(),unit=ctm?Math.hypot(ctm.a,ctm.b)||1:1;
  const originals=source.querySelectorAll(SHAPES),copies=copy.querySelectorAll(SHAPES);
  originals.forEach((o,j)=>{
    const c=copies[j];if(!c)return;
    const s=getComputedStyle(o),sw=parseFloat(s.strokeWidth)||0;
    if(s.visibility==='hidden'){c.remove();return;}
    // Opacity and display can hide a whole group; stop before the plan's hidden app root.
    for(let p=o;p;p=p.parentElement){
      const style=p===o?s:getComputedStyle(p);
      if(style.opacity==='0'||style.display==='none'){c.remove();return;}
      if(p===source)break;
    }
    const stroked=s.stroke!=='none'&&sw>0&&s.strokeOpacity!=='0',filled=s.fill!=='none'&&s.fillOpacity!=='0';
    // The app's class rules are scoped to its root, so the copy carries the computed geometry.
    for(const prop of GEOMETRY){const v=s.getPropertyValue(prop);if(v)set(c,prop,v);}
    set(c,'animation','none');set(c,'transition','none');set(c,'opacity','1');
    if(o.localName==='text'){set(c,'fill','var(--ink)');set(c,'fill-opacity','.5');set(c,'stroke','none');return;}
    if(!stroked&&!filled){set(c,'stroke','none');set(c,'fill','none');return;}
    if(stroked&&sw*unit>=3){
      // A wide stroke (a ring, a chart line) is outlined as a band: the stroke in ink, then a
      // narrower copy in paper on top. A dashed one is a value, like a progress arc, and is tinted.
      set(c,'fill','none');set(c,'stroke','var(--ink)');set(c,'stroke-width',`${sw}px`);
      const inner=c.cloneNode(true);
      set(inner,'stroke',s.strokeDasharray!=='none'?'var(--tint)':'var(--paper)');set(inner,'stroke-width',`${Math.max(0,sw-2*k()/unit)}px`);
      c.after(inner);return;
    }
    set(c,'fill','none');set(c,'stroke','var(--ink)');set(c,'stroke-width',`${k()}px`);c.setAttribute('vector-effect','non-scaling-stroke');
  });
  g.append(copy);
}
function drawPlan(scene){
  planLayer.replaceChildren();
  if(!planOn)return;
  const {records,texts,media,vw,vh}=scene,{byI,kids}=index(records);
  el('rect',{x:0,y:0,width:vw,height:vh,fill:'var(--paper)'},planLayer);
  const items=[];
  for(const e of records){
    if(!e.visible)continue;
    if(isSurface(e))items.push({key:e.key,clip:e.clip,draw:g=>drawSurface(g,e,byI,vw,vh)});
    // Layout boxes: wrappers the app never paints, as faint dashed outlines beneath their contents.
    else if(planBoxes&&layoutBox(e,byI,kids,vw,vh))items.push({key:e.key,clip:e.clip,draw:g=>el('rect',{'data-layout-box':'',x:e.x,y:e.y,width:e.w,height:e.h,fill:'none',stroke:'var(--ink)','stroke-opacity':.32,'stroke-width':k()*.75,'stroke-dasharray':`${2*k()} ${3*k()}`},g)});
  }
  for(const t of texts)items.push({key:t.key,clip:t.clip,draw:g=>drawText(g,t)});
  for(const m of media)items.push({key:m.key,clip:m.clip,draw:g=>m.kind==='svg'?drawInlineSvg(g,m):drawIcon(g,m)});
  items.sort((a,b)=>compare(a.key,b.key));
  for(const item of items){
    const clip=clipFor(item.clip,vw,vh),g=clip?el('g',{'clip-path':clip},planLayer):planLayer;
    item.draw(g);
  }
  el('rect',{x:k()*.75,y:k()*.75,width:Math.max(0,vw-k()*1.5),height:Math.max(0,vh-k()*1.5),fill:'none',stroke:'var(--ink)','stroke-width':k()*1.5},planLayer);
}

/* Regions --------------------------------------------------------------------------- */
const KIND=p=>p.endsWith('gap')?'gap':p.startsWith('margin')?'margin':'padding';
const LABEL_FONT='600 10px system-ui,-apple-system,sans-serif';
function label(parent,placed,x,y,text,{ink,edge,solid,axis,bounds}){
  const s=k(),w=(Math.ceil(textWidth(text,LABEL_FONT))+10)*s,h=18*s;
  // A preview cannot draw past its own edge, so labels near it move inward.
  const vw=document.documentElement.clientWidth||innerWidth,vh=document.documentElement.clientHeight||innerHeight;
  x=Math.min(Math.max(x,w/2+s),vw-w/2-s);y=Math.min(Math.max(y,h/2+s),vh-h/2-s);
  const b=placeLabel(placed,x,y,w,h,axis,bounds);if(!b)return null;
  el('rect',{x:b.x,y:b.y,width:w,height:h,rx:4*s,fill:solid?ink:'var(--label)',stroke:solid?ink:edge,'stroke-width':s},parent);
  const t=el('text',{x:b.x+w/2,y:b.y+h/2+.5*s,'text-anchor':'middle','dominant-baseline':'central','font-size':10*s,fill:solid?'var(--on-accent)':ink},parent);t.textContent=text;
  return b;
}
function hatch(){
  const s=k(),id='ed-gap-hatch',old=defs.querySelector('#'+id);old?.remove();
  const p=el('pattern',{id,width:6*s,height:6*s,patternUnits:'userSpaceOnUse',patternTransform:'rotate(45)'},defs);
  el('rect',{width:6*s,height:6*s,fill:'var(--gap)'},p);el('line',{x1:0,y1:0,x2:0,y2:6*s,stroke:'var(--gap-edge)','stroke-width':s},p);
  return `url(#${id})`;
}
let lastSpec='';
function drawRegion(scene){
  regionLayer.replaceChildren();
  if(!regionBox){report(null);return;}
  const R=regionBox,s=k(),{records,media,vw,vh}=scene;
  const m=measureRegion(records,media,R),placed=[],bounds={x:R.x,y:R.y,r:R.x+R.w,b:R.y+R.h};
  el('path',{d:`M0 0H${vw}V${vh}H0Z M${R.x} ${R.y}v${R.h}h${R.w}v${-R.h}Z`,fill:planOn?'var(--paper)':'var(--scrim)','fill-opacity':planOn?.6:1,'fill-rule':'evenodd'},regionLayer);
  for(const e of m.live)el('path',{d:roundedPath(e.x,e.y,e.w,e.h,isSurface(e)?e.radii:[0,0,0,0]),fill:'none',stroke:'var(--accent)','stroke-opacity':.5,'stroke-width':s,'stroke-dasharray':`${3*s} ${3*s}`},regionLayer);
  for(const r of m.repeats)el('rect',{x:r.x,y:r.y,width:r.w,height:r.h,fill:'var(--accent)','fill-opacity':.06,stroke:'var(--accent)','stroke-opacity':.6,'stroke-width':s,'stroke-dasharray':`${s} ${3*s}`},regionLayer);
  // The region's size and Copy claim their places before any measurement.
  const bottom=Math.min(R.y+R.h+13*s,vh-10*s);
  label(regionLayer,placed,R.x+R.w/2,bottom,`${Math.round(R.w)} × ${Math.round(R.h)}`,{ink:'var(--accent)',solid:true,axis:'x'});
  const cw=64*s,ch=22*s,cx=Math.min(R.x+R.w,vw)-cw,cy=R.y>=ch+4*s?R.y-ch-4*s:R.y+4*s,copy={x:cx,y:cy,width:cw,height:ch};
  placed.push({x:cx,y:cy,w:cw,h:ch});
  const gapFill=hatch();
  const boxes=m.live.flatMap(e=>measureSpacing(e.node,getComputedStyle,{width:vw,height:vh}).filter(b=>!b.property.startsWith('measure')));
  boxes.sort((a,b)=>parseFloat(b.value)-parseFloat(a.value));
  for(const b of boxes){
    const x=Math.max(b.x,R.x),y=Math.max(b.y,R.y),r=Math.min(b.x+b.width,R.x+R.w),bt=Math.min(b.y+b.height,R.y+R.h);
    if(r-x<=0||bt-y<=0)continue;
    const kind=KIND(b.property),ink=`var(--${kind}-ink)`,edge=`var(--${kind}-edge)`;
    el('rect',{x,y,width:r-x,height:bt-y,fill:kind==='gap'?gapFill:`var(--${kind})`,stroke:edge,'stroke-width':s,'stroke-dasharray':kind==='margin'?`${3*s} ${2*s}`:'none'},regionLayer);
    const vertical=/top|bottom|row-gap/.test(b.property),mx=(x+r)/2,my=(y+bt)/2,t=3*s;
    if((vertical?bt-y:r-x)>=10*s)el('path',{d:vertical?`M${mx} ${y}V${bt}M${mx-t} ${y}H${mx+t}M${mx-t} ${bt}H${mx+t}`:`M${x} ${my}H${r}M${x} ${my-t}V${my+t}M${r} ${my-t}V${my+t}`,stroke:ink,'stroke-width':s,fill:'none'},regionLayer);
    label(regionLayer,placed,mx,my,b.value,{ink,edge,axis:vertical?'x':'y',bounds});
  }
  for(const e of m.sizes)label(regionLayer,placed,e.x+e.w/2,e.y+e.h-9*s,`${Math.round(e.w)} × ${Math.round(e.h)}`,{ink:'var(--accent)',solid:true,axis:'x',bounds});
  for(const e of m.radii){
    const r=cornerRadius(e),ox=e.x+e.w-r,oy=e.y+e.h-r,a=r+4*s;
    el('path',{d:`M${ox+a} ${oy}A${a} ${a} 0 0 1 ${ox} ${oy+a}`,fill:'none',stroke:'var(--accent)','stroke-width':1.5*s},regionLayer);
    label(regionLayer,placed,Math.min(ox+a*.72+16*s,vw-20*s),Math.min(oy+a*.72+10*s,vh-10*s),`r ${Math.round(r)}`,{ink:'var(--accent)',solid:true,axis:'y'});
  }
  for(const b of m.badges)label(regionLayer,placed,b.e.x+b.e.w-14*s,b.e.y,`×${b.n}`,{ink:'var(--accent)',solid:true,axis:'x'});
  el('rect',{x:R.x,y:R.y,width:R.w,height:R.h,fill:'none',stroke:'var(--accent)','stroke-width':1.5*s},regionLayer);
  // Copy: Lucide's copy glyph, then the word. It turns into Copied for a moment.
  const button=el('g',{},regionLayer),done=Date.now()-copied<1400;
  el('rect',{...copy,rx:5*s,fill:'var(--accent)'},button);
  const icon=el('svg',{x:cx+7*s,y:cy+4*s,width:14*s,height:14*s,viewBox:'0 0 24 24'},button);
  el('path',{d:done?'M20 6 9 17l-5-5':'M8 8h12v12H8zM4 16V6a2 2 0 0 1 2-2h10',fill:'none',stroke:'var(--on-accent)','stroke-width':2,'stroke-linecap':'round','stroke-linejoin':'round'},icon);
  const word=el('text',{x:cx+25*s,y:cy+ch/2+.5*s,'dominant-baseline':'central','font-size':11*s,fill:'var(--on-accent)'},button);word.textContent=done?'Copied':'Copy';
  lastSpec=regionSpec(R,m,records);
  report({region:{x:R.x,y:R.y,width:R.w,height:R.h},copy,text:lastSpec});
}
// The studio clicks Copy for frames that are not interactive, so it needs the button and the text.
let reported='';
function report(state){
  const packet={kind:'exact-design:canvas',op:'region',...(state??{region:null,copy:null,text:''})},key=JSON.stringify(packet);
  if(key===reported)return;reported=key;parent.postMessage(packet,'*');
}
function draw(){
  if(!active()){host?.remove();return;}
  mount();const scene=readScene();if(!scene)return;
  defs.replaceChildren();clips=new Map();
  drawPlan(scene);drawRegion(scene);
}

/* Messages and input ---------------------------------------------------------------- */
systemDark.addEventListener('change',()=>{if(pinnedScheme)return;planScheme=systemDark.matches?'dark':'light';if(host)host.dataset.scheme=planScheme;});
export function detail(packet){
  const nextZoom=Number.isFinite(packet.zoom)&&packet.zoom>0?packet.zoom:zoom,nextPlan=packet.plan===true,nextBoxes=packet.planBoxes===true,nextText=packet.planText===true;
  pinnedScheme=packet.scheme==='dark'||packet.scheme==='light'?packet.scheme:null;
  const nextScheme=pinnedScheme??(systemDark.matches?'dark':'light');
  if(nextZoom===zoom&&nextPlan===planOn&&nextScheme===planScheme&&nextBoxes===planBoxes&&nextText===planText)return;
  zoom=nextZoom;planBoxes=nextBoxes;planText=nextText;planScheme=nextScheme;if(host)host.dataset.scheme=planScheme;
  if(nextPlan!==planOn){
    planOn=nextPlan;
    if(planOn){hideStyle??=Object.assign(document.createElement('style'),{textContent:HIDE});(document.head??document.documentElement).append(hideStyle);}
    else hideStyle?.remove();
  }
  watch();schedule();
}
const inside=(b,x,y)=>!!b&&x>=b.x&&y>=b.y&&x<=b.x+(b.width??b.w)&&y<=b.y+(b.height??b.h);
async function copySpec(){
  copied=Date.now();schedule();setTimeout(schedule,1450);
  try{await navigator.clipboard.writeText(lastSpec);}catch{parent.postMessage({kind:'exact-design:canvas',op:'copy',text:lastSpec},'*');}
}
/** Region input in guest coordinates. Returns true when the input was the region's own. */
export function region(op,x,y){
  if(op==='down'){dragFrom={x,y};regionBox={x,y,w:0,h:0};watch();return true;}
  if(op==='move'&&dragFrom){regionBox={x:Math.min(dragFrom.x,x),y:Math.min(dragFrom.y,y),w:Math.abs(x-dragFrom.x),h:Math.abs(y-dragFrom.y)};schedule();return true;}
  if(op==='up'&&dragFrom){dragFrom=null;if(regionBox.w<4||regionBox.h<4)regionBox=null;watch();schedule();return true;}
  if(op==='all'){
    const vw=document.documentElement.clientWidth||innerWidth,vh=document.documentElement.clientHeight||innerHeight;
    regionBox=regionBox&&regionBox.x<=0&&regionBox.y<=0&&regionBox.w>=vw-1&&regionBox.h>=vh-1?null:{x:0,y:0,w:vw,h:vh};
    watch();schedule();return true;
  }
  if(op==='clear'){const had=!!regionBox;regionBox=null;dragFrom=null;watch();draw();return had;}
  if(op==='copied'){copied=Date.now();schedule();setTimeout(schedule,1450);return true;}
  // A plain press: Copy copies; outside the region clears it and the press goes on as usual.
  if(op==='press'&&regionBox){
    const button=reported&&JSON.parse(reported).copy;
    if(inside(button,x,y)){void copySpec();return true;}
    if(!inside(regionBox,x,y))region('clear');
  }
  return false;
}
export const hasRegion=()=>!!regionBox;
