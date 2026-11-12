/** Presentation metadata keeps source bindings separate from linked CSS values. */
export const propertyName:Record<string,string>={'text-content':'Content','font-family':'Font','font-size':'Size','font-weight':'Weight','line-height':'Line height','letter-spacing':'Letter spacing','background-color':'Fill',color:'Text color','border-radius':'Corner radius',opacity:'Opacity','flex-direction':'Direction','align-items':'Align items','justify-content':'Distribute','flex-wrap':'Wrap',width:'Width',height:'Height','min-width':'Min width','max-width':'Max width','min-height':'Min height','max-height':'Max height',gap:'Gap','row-gap':'Row gap','column-gap':'Column gap',padding:'Padding',margin:'Margin'};
export function propertyGroup(property:string){return property==='text-content'?'Text':property.startsWith('font-')||['line-height','letter-spacing','color'].includes(property)?'Typography':property.startsWith('padding')||property.startsWith('margin')||property.includes('gap')?'Spacing':property.includes('radius')||['opacity','background-color'].includes(property)?'Appearance':'Layout';}
export function compoundFields(property:string,value:string){
  const names=property==='gap'?['Row','Column']:property==='border-radius'?['Top left','Top right','Bottom right','Bottom left']:['Top','Right','Bottom','Left'];
  if(!['gap','padding','margin','border-radius'].includes(property))return [];
  const parts=value.trim().split(/\s+/);
  // Tokens and expressions are single bindings, not independently editable lengths.
  if(parts.some(p=>!/^(-?(?:\d+(?:\.\d+)?|\.\d+)(px|rem|em|%|vh|vw)?|auto)$/.test(p)))return [];
  const expanded=property==='gap'?[parts[0],parts[1]??parts[0]]:[parts[0],parts[1]??parts[0],parts[2]??parts[0],parts[3]??parts[1]??parts[0]];
  return names.map((label,i)=>({id:String(i),label,value:expanded[i]}));
}
export function compoundValue(property:string,current:string,part:string,value:string){
  const fields=compoundFields(property,current);
  if(!fields.length||!/^(-?(?:\d+(?:\.\d+)?|\.\d+)(px|rem|em|%|vh|vw)?|auto)$/.test(value.trim()))throw new Error('Enter one spacing value.');
  if(part==='all')return value.trim();
  if(!fields.some(f=>f.id===part))throw new Error('Unknown spacing edge.');
  return fields.map(f=>f.id===part?value.trim():f.value).join(' ');
}
