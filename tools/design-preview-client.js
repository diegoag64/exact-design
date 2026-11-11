/** Draft CSS targets source bindings, leaving Exact's application state intact. */
export function designPreview(){
  const sheet=document.createElement('style');sheet.dataset.exactDesignDraft='';document.head.append(sheet);
  let patches=[],sequence=0,table=null,tablePlan='',last='';
  async function cssValue(property,value){
    if(CSS.supports(property,value))return value;
    const plan=globalThis.exact?.plan;
    if(tablePlan!==plan){table=await(await fetch('dev-inspect.json',{cache:'no-store'})).json();tablePlan=table.plan;}
    const token=Object.entries(table?.props??{}).find(([,name])=>name===value)?.[0];
    if(token&&/^--[\w-]+$/.test(token))return `var(${token})`;
    throw new Error(`Cannot preview ${property}: ${value}`);
  }
  async function render(){
    const at=++sequence,rules=[];
    for(const patch of patches){
      if(patch.plan!==globalThis.exact?.plan)continue;
      const value=await cssValue(patch.property,patch.value);
      const declaration=document.createElement('div').style;declaration.setProperty(patch.property,value);
      for(const target of patch.targets??[{site:patch.site,properties:[patch.property]}]){
        const declarations=target.properties.map(property=>`${property}:${declaration.getPropertyValue(property)||value}!important`).join(';');
        rules.push(`#exact-root [data-site="${target.site}"]{${declarations}}`);
      }
    }
    if(at!==sequence)return;
    const text=rules.join('\n');if(text!==last){sheet.textContent=text;last=text;}
  }
  let plan=globalThis.exact?.plan;
  const timer=setInterval(()=>{if(plan!==globalThis.exact?.plan){plan=globalThis.exact?.plan;void render().catch(()=>{});}},100);
  addEventListener('pagehide',()=>clearInterval(timer));
  return {apply:values=>{patches=values;return render();}};
}
