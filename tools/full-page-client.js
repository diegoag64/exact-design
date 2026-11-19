// Presentation changes belong to the preview, never to the application's source.
export function fullPage(report){
  const query=new URL(location.href).searchParams,url=location.pathname+location.search;
  const enabled=query.get('__ed_full')==='1',minimum=Math.max(100,Math.min(10000,Number(query.get('__ed_height'))||innerHeight));
  const requested=Number(query.get('__ed_rows')??5),rows=query.get('__ed_canvas')==='1'&&[5,10,20].includes(requested)?requested:0;
  const sampleSheet=document.createElement('style');sampleSheet.dataset.edListSamples='';document.head.append(sampleSheet);
  // Keep the real nodes and their source identities. Clip each vertical repeated
  // row group, including its pagination tail, rather than removing application data.
  function sampleLists(root){
    if(!rows)return;
    const bounded=new Set(),rules=[];
    for(const parent of root.querySelectorAll('[data-exact-list], [data-exact-list] *')){
      if(parent.parentElement?.closest('[data-ed-list-sample]'))continue;
      const groups=new Map();
      for(const child of parent.children){
        const site=child.getAttribute('data-site');if(site===null)continue;
        if(!groups.has(site))groups.set(site,[]);groups.get(site).push(child);
      }
      for(const group of groups.values()){
        if(group.length<=rows)continue;
        const boxes=group.map(el=>el.getBoundingClientRect());
        // Horizontal carousels, grids, and hidden routes keep their own layout.
        if(boxes.some((b,i)=>!b.width||!b.height||(i>0&&b.top<boxes[i-1].bottom-1)))continue;
        const box=parent.getBoundingClientRect(),css=getComputedStyle(parent);
        if(!box.width||css.display==='contents')continue;
        const height=Math.ceil(boxes[rows-1].bottom-box.top+(parseFloat(css.paddingBottom)||0)+(parseFloat(css.borderBottomWidth)||0));
        const id=String(bounded.size);bounded.add(parent);
        if(parent.dataset.edListSample!==id)parent.dataset.edListSample=id;
        rules.push(`#exact-root [data-ed-list-sample="${id}"]{max-height:${height}px!important;min-height:0!important;overflow:clip!important;box-sizing:border-box!important}[data-ed-list-sample="${id}"]>*{flex-shrink:0!important}`);
        break;
      }
    }
    for(const el of root.querySelectorAll('[data-ed-list-sample]'))if(!bounded.has(el))delete el.dataset.edListSample;
    const css=rules.join('\n');if(sampleSheet.textContent!==css)sampleSheet.textContent=css;
  }
  // Canvas layout changes must not act like the user scrolling to load a page.
  if(rows)addEventListener('scroll',e=>{if(e.target?.closest?.('[data-exact-list]'))e.stopImmediatePropagation();},true);
  const sheet=document.createElement('style');sheet.dataset.edFullPage='';document.head.append(sheet);
  let height=minimum,ready=false,scheduled=0,last='',closed=false,observed=null;
  const rules=`html,body{height:auto!important;min-height:0!important;overflow:visible!important}#exact-root{height:auto!important;min-height:${minimum}px!important;overflow:visible!important}[data-ed-page-grow]{height:auto!important;min-height:0!important;max-height:none!important;overflow:visible!important}[data-ed-page-flex]{flex-basis:auto!important;flex-shrink:0!important}[data-ed-page-position]{position:relative!important;inset:auto!important}#exact-root>main>[data-ed-page-position]{min-height:${minimum}px!important}#exact-root>main{height:auto!important;min-height:${minimum}px!important;overflow:visible!important}`;
  function measure(){
    scheduled=0;if(closed)return;
    const root=document.getElementById('exact-root')||document.body;
    if(!root)return;
    sampleLists(root);
    if(observed!==root){observer.disconnect();observer.observe(root,{subtree:true,childList:true,attributes:true,attributeFilter:['class','style','hidden']});observed=root;}
    // A presented modal or full-screen route covers the device: expanding the page underneath
    // would stack the route below its parent screen, so it keeps the viewport height.
    const presented=[...root.querySelectorAll('[navigationpresentation]')].some(el=>el.getAttribute('navigationpresentation')!=='push'&&el.checkVisibility({visibilityProperty:true}));
    if(enabled&&presented){
      sheet.disabled=true;
      for(const name of ['edPageGrow','edPagePosition','edPageScroll','edPageFlex'])for(const el of root.querySelectorAll(`[data-${name.replace(/[A-Z]/g,c=>'-'+c.toLowerCase())}]`))delete el.dataset[name];
      height=minimum;
    }else if(enabled){
      // Read the authored layout without our expansion. Re-evaluating at each
      // width also releases obsolete scroll regions after responsive changes.
      sheet.disabled=true;
      const scrolls=[...root.querySelectorAll('*')].filter(el=>{
        const css=getComputedStyle(el);
        return ['auto','scroll'].includes(css.overflowY)&&el.clientWidth>=innerWidth*0.45&&el.clientHeight>=minimum*0.3&&el.checkVisibility({visibilityProperty:true});
      });
      const grow=new Set(),position=new Set(),flex=new Set();
      for(const el of scrolls){
        el.dataset.edPageScroll='';
        for(let at=el;at&&at!==root;at=at.parentElement){
          grow.add(at);
          const parent=at.parentElement&&getComputedStyle(at.parentElement);
          if(parent?.display.includes('flex')&&parent.flexDirection.startsWith('column'))flex.add(at);
          const css=getComputedStyle(at);
          if(css.position==='absolute'&&css.top!=='auto'&&css.bottom!=='auto')position.add(at);
        }
      }
      for(const el of root.querySelectorAll('[data-ed-page-grow]'))if(!grow.has(el))delete el.dataset.edPageGrow;
      for(const el of root.querySelectorAll('[data-ed-page-position]'))if(!position.has(el))delete el.dataset.edPagePosition;
      for(const el of root.querySelectorAll('[data-ed-page-scroll]'))if(!scrolls.includes(el))delete el.dataset.edPageScroll;
      for(const el of root.querySelectorAll('[data-ed-page-flex]'))if(!flex.has(el))delete el.dataset.edPageFlex;
      for(const el of flex)el.dataset.edPageFlex='';
      for(const el of grow)el.dataset.edPageGrow='';
      for(const el of position)el.dataset.edPagePosition='';
      if(sheet.textContent!==rules)sheet.textContent=rules;
      sheet.disabled=false;
      // Root bounds can shrink, unlike document.scrollHeight, which is always
      // at least the iframe height and would otherwise keep the largest value.
      const rect=root.getBoundingClientRect();
      height=Math.max(minimum,Math.ceil(rect.bottom+(parseFloat(getComputedStyle(root).marginBottom)||0)));
      for(const el of root.children){const box=el.getBoundingClientRect();height=Math.max(height,Math.ceil(box.bottom));}
      height=Math.min(50000,height);
    }else height=minimum;
    ready=true;
    const packet={kind:'size',width:innerWidth,height,viewportHeight:minimum,fullHeight:enabled,url};
    const text=JSON.stringify(packet);
    if(text!==last)Promise.resolve(report(packet)).then(ok=>{if(ok)last=text;});
  }
  const schedule=()=>{if(!scheduled&&!closed)scheduled=requestAnimationFrame(measure);};
  const observer=new MutationObserver(schedule);
  observer.observe(document.body,{subtree:true,childList:true});
  const resize=new ResizeObserver(schedule);resize.observe(document.documentElement);
  addEventListener('resize',schedule);addEventListener('load',schedule,true);
  document.fonts?.ready.then(schedule);schedule();
  addEventListener('pagehide',()=>{closed=true;cancelAnimationFrame(scheduled);observer.disconnect();resize.disconnect();});
  return {snapshot:()=>ready?{contentHeight:height,viewportHeight:minimum,fullHeight:enabled,width:innerWidth,url}:{}};
}
