import { test, expect } from 'bun:test';
import { snapMove, snapTargets } from './snapping';
import { WorkspaceEditor, type View } from './workspace';
const peer: View = {id:'peer',screenId:'screen',name:'',x:0,y:0,width:720,height:520};
const moving: View = {...peer,id:'moving',x:900,y:100,width:390,height:844};
const views = [peer,moving];

test('snaps side by side with the standard gap and aligned top edges',()=>{
  expect(snapMove(moving,views,-96,-96,1)).toEqual({dx:-100,dy:-100});
});
test('snaps flush edges, centers, and vertical spacing',()=>{
  expect(snapMove(moving,views,-177,-96,1)).toEqual({dx:-180,dy:-100});
  expect(snapMove(moving,views,-732,-259,1)).toEqual({dx:-735,dy:-262});
  expect(snapMove(moving,views,-897,497,1)).toEqual({dx:-900,dy:500});
});
test('snap tolerance stays eight screen pixels at different zoom levels',()=>{
  expect(snapMove(moving,views,-88,-88,0.5)).toEqual({dx:-100,dy:-100});
  expect(snapMove(moving,views,-88,-88,1)).toEqual({dx:-88,dy:-88});
  expect(snapMove(moving,views,-95,-95,2)).toEqual({dx:-95,dy:-95});
});
test('stationary clicks, lone frames, and distant drags stay put',()=>{
  expect(snapMove({...moving,x:804,y:4},views,0,0,1)).toEqual({dx:0,dy:0});
  expect(snapTargets(moving,[moving])).toEqual({x:[],y:[]});
  expect(snapMove(moving,[moving],12,18,1)).toEqual({dx:12,dy:18});
  expect(snapMove(moving,views,2000,2000,1)).toEqual({dx:2000,dy:2000});
});
test('snapped moves make one undo step and can be bypassed',()=>{
  const e=new WorkspaceEditor();e.addView('Phone');e.move(100,100);const before=structuredClone(e.view), history=e.past.length;
  e.move(-96,-96,false,1);expect(e.view.x).toBe(800);expect(e.view.y).toBe(0);expect(e.past.length).toBe(history+1);
  e.undo();expect(e.view).toEqual(before);e.move(-96,-96);expect(e.view.x).toBe(804);expect(e.view.y).toBe(4);
});
