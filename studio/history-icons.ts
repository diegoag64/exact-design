import type {HistoryEntry} from './design-history';
/** Derive icons for both new events and histories saved by earlier versions. */
export function historyIcon(entry:Pick<HistoryEntry,'kind'|'changes'>){
  const kind=entry.kind;
  if(kind==='apply')return 'code-2';
  if(kind==='undo'||kind==='workspace-undo')return 'undo-2';
  if(kind==='revert')return 'rotate-ccw';
  if(kind==='workspace-redo')return 'redo-2';
  if(kind==='discard'||kind==='workspace-delete')return 'trash-2';
  if(kind==='workspace-duplicate')return 'copy';
  if(kind==='workspace-connect'||kind==='workspace-disconnect')return 'link-2';
  if(['workspace-add','workspace-blank','workspace-screen','workspace-variant'].includes(kind))return 'frame';
  const properties=entry.changes.map(c=>c.property);
  if(kind==='workspace-move')return 'move';
  if(properties.some(p=>p==='text-content'||p==='text'))return 'type';
  if(properties.some(p=>p.includes('padding')||p.includes('margin')||p.includes('gap')))return 'between-horizontal-start';
  if(properties.some(p=>p.includes('radius')))return 'radius';
  if(properties.some(p=>['width','height','min-width','max-width','min-height','max-height','flex-basis'].includes(p)))return 'scan';
  if(properties.some(p=>['x','y','left','top','right','bottom','position'].includes(p)))return 'move';
  if(properties.includes('rotate'))return 'rotate-cw';
  if(properties.some(p=>p==='fill'||p.includes('color')))return 'paint-bucket';
  if(properties.some(p=>p.startsWith('font')||['line-height','letter-spacing','fontSize','text-align'].includes(p)))return 'text-cursor-input';
  if(properties.some(p=>p==='opacity'||p==='box-shadow'))return 'blend';
  if(properties.some(p=>p.startsWith('border')))return 'square-dashed';
  if(properties.includes('flex-direction'))return entry.changes.find(c=>c.property==='flex-direction')?.after.startsWith('row')?'columns-2':'rows-2';
  if(properties.some(p=>p.startsWith('grid')||['display','align-items','justify-content','flex-wrap','align-self','flex-grow','flex-shrink'].includes(p)))return 'grid-2x2';
  return 'layers';
}
