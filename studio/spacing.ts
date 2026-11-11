export const spacingProperties=['padding-top','padding-right','padding-bottom','padding-left','row-gap','column-gap'];
export type SpacingBox={key:string;property:string;x:number;y:number;width:number;height:number;labelX:number;labelY:number;value:string;label:boolean};
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
    return {frame,id:value.id as string,plan:value.plan as string,boxes:value.boxes as SpacingBox[]};
  }catch{return emptySpacing(frame);}
}

type SpacingRow={id:string;property:string;value:string;shared:boolean};
export function spacingRows(rows:SpacingRow[]){
  return spacingProperties.map(property=>{
    const row=rows.find(r=>r.property===property)??rows.find(r=>r.property===(property.startsWith('padding-')?'padding':'gap'));
    if(!row)return null;
    let value=row.value;
    if(row.property==='padding'){
      const parts=value.trim().split(/\s+/),sides=[parts[0],parts[1]??parts[0],parts[2]??parts[0],parts[3]??parts[1]??parts[0]];
      value=sides[spacingProperties.indexOf(property)];
    }
    if(row.property==='gap'){
      const parts=value.trim().split(/\s+/);value=property==='row-gap'?parts[0]:parts[1]??parts[0];
    }
    return {property,value,shared:row.shared};
  }).filter((row):row is {property:string;value:string;shared:boolean}=>row!==null);
}
