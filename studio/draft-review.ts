import {historyIcon} from './history-icons';
export type ReviewChange={key:string;location:string;line:number;property:string;name:string;icon:string;element:string;before:string;after:string;added:boolean;replaced:boolean;shared:boolean;swatchBefore:string;swatchAfter:string};
export type ReviewFile={file:string;changes:ReviewChange[]};
const names:Record<string,string>={'background-color':'Fill',color:'Text color','text-content':'Content','border-color':'Stroke color','border-width':'Stroke weight','border-style':'Stroke style','box-shadow':'Shadow',left:'X',top:'Y',rotate:'Rotation','font-family':'Font','font-size':'Font size','font-weight':'Font weight','flex-direction':'Flow','align-items':'Align','justify-content':'Distribute','z-index':'Layer order'};
export function reviewName(property:string){return names[property]??property.charAt(0).toUpperCase()+property.slice(1).replaceAll('-',' ');}
/** Plain colour literals get a swatch; tokens and expressions stay text. */
function swatch(property:string,value:string){
  if(!(property==='color'||property.endsWith('-color')))return '';
  return /^#[0-9a-f]{3,8}$/i.test(value)||/^(rgb|hsl)a?\([\d\s.,%/-]+\)$/i.test(value)?value:'';
}
/** Group a serialized draft by file in source order for the review dialog. */
export function draftReview(draftState:string):ReviewFile[]{
  let patches:any[]=[];
  try{patches=JSON.parse(draftState||'{}').patches??[];}catch{return [];}
  if(!Array.isArray(patches))return [];
  const files=new Map<string,ReviewChange[]>();
  for(const p of patches){
    const b=p?.binding;if(!b||typeof b.file!=='string')continue;
    const added=b.mode==='insert',replaced=b.mode==='replace';
    const change:ReviewChange={key:String(p.key),location:`${b.file}:${b.line}:${b.col}`,line:Number(b.line)||0,property:String(b.property),name:reviewName(String(b.property)),
      icon:historyIcon({kind:'draft',changes:[{target:'',property:String(b.property),before:String(p.original),after:String(p.value)}]}),
      element:typeof p.label==='string'?p.label:'',before:added?'':String(p.original),after:String(p.value),added,replaced,shared:!!b.shared,
      swatchBefore:added?'':swatch(b.property,String(p.original)),swatchAfter:swatch(b.property,String(p.value))};
    files.set(b.file,[...(files.get(b.file)??[]),change]);
  }
  return [...files].map(([file,changes])=>({file,changes:changes.sort((a,b)=>a.line-b.line||a.location.localeCompare(b.location))}));
}
