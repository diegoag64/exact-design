export const spacingProperties=['padding-top','padding-right','padding-bottom','padding-left','row-gap','column-gap','margin-top','margin-right','margin-bottom','margin-left'];
/** The shorthand a spacing longhand belongs to, and its position in that shorthand's expanded values. */
export function spacingShorthand(property:string){
  if(property.endsWith('-gap'))return {name:'gap',index:property==='row-gap'?0:1};
  const [name,side]=property.split('-');return {name,index:['top','right','bottom','left'].indexOf(side)};
}
export function expandSpacing(name:string,text:string){
  const parts=text.trim().split(/\s+/);
  return name==='gap'?[parts[0],parts[1]??parts[0]]:[parts[0],parts[1]??parts[0],parts[2]??parts[0],parts[3]??parts[1]??parts[0]];
}
export type SpacingBox={key:string;property:string;x:number;y:number;width:number;height:number;labelX:number;labelY:number;value:string;label:boolean;linked:number};
export const emptySpacing=(frame='')=>({frame,id:'',plan:'',boxes:[] as SpacingBox[]});
export function decodeSpacing(frame:string,text:string){
  try{
    if(text.length>20000)return emptySpacing(frame);
    const value=JSON.parse(text);
    if(value.kind!=='exact-design:spacing'||typeof value.id!=='string'||value.id.length>2048||typeof value.plan!=='string'||value.plan.length>100||!Array.isArray(value.boxes)||value.boxes.length>36)return emptySpacing(frame);
    const keys=new Set<string>();
    for(const box of value.boxes){
      if(typeof box.key!=='string'||box.key.length>80||keys.has(box.key)||!spacingProperties.includes(box.property)||typeof box.value!=='string'||!/^\d+(?:\.\d+)?$/.test(box.value)||typeof box.label!=='boolean')return emptySpacing(frame);
      if(!['x','y','width','height','labelX','labelY'].every(k=>Number.isFinite(box[k])&&Math.abs(box[k])<=20000)||box.width<=0||box.height<=0)return emptySpacing(frame);
      keys.add(box.key);
    }
    // Segments of one property share a value, so the studio presents them as linked.
    const counts=new Map<string,number>();
    for(const box of value.boxes)counts.set(box.property,(counts.get(box.property)??0)+1);
    const boxes:SpacingBox[]=value.boxes.map((box:SpacingBox)=>({key:box.key,property:box.property,x:box.x,y:box.y,width:box.width,height:box.height,labelX:box.labelX,labelY:box.labelY,value:box.value,label:box.label,linked:counts.get(box.property)!}));
    return {frame,id:value.id as string,plan:value.plan as string,boxes};
  }catch{return emptySpacing(frame);}
}

type SpacingRow={id:string;property:string;value:string;shared:boolean};
export function spacingRows(rows:SpacingRow[]){
  return spacingProperties.map(property=>{
    const {name,index}=spacingShorthand(property);
    const row=rows.find(r=>r.property===property)??rows.find(r=>r.property===name);
    if(!row)return null;
    return {property,value:row.property===name?expandSpacing(name,row.value)[index]:row.value,shared:row.shared};
  }).filter((row):row is {property:string;value:string;shared:boolean}=>row!==null);
}
