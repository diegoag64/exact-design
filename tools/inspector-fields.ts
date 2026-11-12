/** Presentation metadata keeps source bindings separate from linked CSS values. */
export const propertyName:Record<string,string>={'text-content':'Content','font-family':'Font','font-size':'Size','font-weight':'Weight','line-height':'Line height','letter-spacing':'Letter spacing','background-color':'Fill',color:'Text color','border-radius':'Border radius',opacity:'Opacity','flex-direction':'Direction','align-items':'Align items','justify-content':'Distribute','flex-wrap':'Wrap',width:'Width',height:'Height','min-width':'Min width','max-width':'Max width','min-height':'Min height','max-height':'Max height',gap:'Gap','row-gap':'Row gap','column-gap':'Column gap',padding:'Padding',margin:'Margin'};
Object.assign(propertyName,{position:'Position',left:'X',top:'Y',right:'Right',bottom:'Bottom',rotate:'Rotation','z-index':'Layer order',display:'Display','flex-direction':'Flow','align-items':'Align','justify-content':'Distribute','align-self':'Self alignment','flex-grow':'Grow','flex-shrink':'Shrink','flex-basis':'Basis','grid-template-columns':'Columns','grid-template-rows':'Rows','aspect-ratio':'Aspect ratio','box-sizing':'Sizing','border-color':'Color','border-width':'Weight','border-style':'Style','box-shadow':'Shadow',scale:'Scale','transform-origin':'Origin','text-align':'Text alignment','object-fit':'Image fit',overflow:'Overflow'});
export function propertyGroup(property:string){return ['position','left','top','right','bottom','rotate','z-index','scale','transform-origin'].includes(property)?'Position':property==='background-color'?'Fill':property.startsWith('border-')&&!property.includes('radius')?'Stroke':property==='box-shadow'?'Effects':property==='text-content'?'Text':property.startsWith('font-')||['line-height','letter-spacing','color','text-align'].includes(property)?'Typography':property.startsWith('padding')||property.startsWith('margin')||property.includes('gap')?'Spacing':property.includes('radius')||['opacity','background-color'].includes(property)?'Appearance':'Layout';}
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
