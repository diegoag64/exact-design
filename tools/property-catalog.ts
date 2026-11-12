/** CSS properties supported by both the inspector and pinned Contract compiler. */
export const propertyCatalog:Record<string,string>={
  position:'static',left:'0',top:'0',right:'auto',bottom:'auto',rotate:'0','z-index':'0',
  display:'flex','flex-direction':'column','align-items':'stretch','justify-content':'flex-start','flex-wrap':'nowrap','align-self':'auto',
  width:'auto',height:'auto','min-width':'0','max-width':'none','min-height':'0','max-height':'none','box-sizing':'border-box',
  'flex-grow':'0','flex-shrink':'1','flex-basis':'auto',order:'0','grid-template-columns':'1fr 1fr','grid-template-rows':'auto','aspect-ratio':'auto',
  padding:'0','padding-top':'0','padding-right':'0','padding-bottom':'0','padding-left':'0',
  margin:'0','margin-top':'0','margin-right':'0','margin-bottom':'0','margin-left':'0',gap:'0','row-gap':'0','column-gap':'0',
  opacity:'1','border-radius':'0','border-top-left-radius':'0','border-top-right-radius':'0','border-bottom-right-radius':'0','border-bottom-left-radius':'0',
  'background-color':'transparent','border-color':'currentcolor','border-width':'0','border-style':'none','box-shadow':'none',
  'font-family':'system-ui','font-size':'14','font-weight':'400','line-height':'1.5','letter-spacing':'0','text-align':'left',color:'currentcolor',
  overflow:'visible','object-fit':'cover',scale:'1','transform-origin':'center',
};
const paintDefaults=['opacity','border-radius','background-color','border-color','border-width','border-style','box-shadow'];
export function defaultProperties(kind:string,attributes:Set<string>){
  const spacing=['padding','margin','gap'].flatMap(name=>attributes.has(name)?[name]:[...attributes].some(a=>a.startsWith(name+'-')||(name==='gap'&&a.endsWith('-gap')))?name==='gap'?['row-gap','column-gap']:['top','right','bottom','left'].map(side=>name+'-'+side):[name]);
  const appearance=paintDefaults.flatMap(name=>name==='border-radius'&&[...attributes].some(a=>/^border-(top|bottom)-(left|right)-radius$/.test(a))?['border-top-left-radius','border-top-right-radius','border-bottom-right-radius','border-bottom-left-radius']:[name]);
  return ['position','left','top','rotate','width','height',...spacing,...appearance,...(kind==='text'?['font-family','font-size','font-weight','line-height','letter-spacing','text-align','color']:['display','flex-direction','align-items','justify-content','flex-wrap']),...(kind==='image'?['object-fit']:[])];
}
export function cssProperty(row:string){
  return row==='text_color'?'color':row.replace(/^border_radius_(top|bottom)_(left|right)$/,'border-$1-$2-radius').replace(/^border_(width|color|style)_(top|right|bottom|left)$/,'border-$2-$1').replaceAll('_','-');
}
export function computedValue(property:string,rows:any[]){
  const direct=rows.find(r=>cssProperty(r.name)===property);
  const value=direct?.token?.text??direct?.value;
  if(property==='padding'||property==='margin')return ['top','right','bottom','left'].map(side=>computedValue(property+'-'+side,rows)).join(' ');
  if(property==='gap')return ['row-gap','column-gap'].map(side=>computedValue(side,rows)).join(' ');
  if(property==='border-radius')return ['top-left','top-right','bottom-right','bottom-left'].map(side=>computedValue('border-'+side+'-radius',rows)).join(' ');
  if(property==='border-width'||property==='border-color'||property==='border-style')return computedValue(property.replace('border-','border-top-'),rows);
  if(value!==undefined&&value!==null&&typeof value!=='object'){
    if(value==='normal'&&property.endsWith('gap'))return '0';
    if(property==='font-family'&&typeof value==='number')return 'system-ui';
    return String(value);
  }
  return propertyCatalog[property]??(property.endsWith('-width')?'0':property.endsWith('-color')?'currentcolor':property.endsWith('-style')?'none':'0');
}
