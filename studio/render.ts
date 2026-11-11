import type { Ctx2D, Frame } from './app.contract.d.ts';
import type { Workspace } from './workspace';
import { snapTargets, type SnapTarget } from './snapping';
import { resolveLayer } from './model';

// Exact components render screen content. Canvas only draws editor decorations.
export function render(args: unknown[], c: Ctx2D, frame: Frame) {
  const [drawing, selected, zoom, panX, panY, dx, dy, resizing, snapping] = args as [string, string, number, number, number, number, number, boolean, boolean];
  const workspace = JSON.parse(drawing || '{}') as Workspace & {active: string};
  c.clearRect(0, 0, frame.width, frame.height);
  c.save(); c.translate(panX, panY); c.scale(zoom, zoom);
  for (const view of workspace.views ?? []) {
    const active = workspace.active === view.id;
    const frameSelected = active && selected === view.id;
    const vx = view.x + (frameSelected && !resizing ? dx : 0), vy = view.y + (frameSelected && !resizing ? dy : 0);
    const vw = Math.max(100,view.width + (frameSelected && resizing ? dx : 0)), vh = Math.max(100,view.height + (frameSelected && resizing ? dy : 0));
    const screen = workspace.screens.find(s=>s.id===view.screenId)!;
    c.save(); c.translate(vx,vy);
    c.fillStyle = frameSelected ? '#5574ef' : '#808087'; c.font = `${11 / zoom}px system-ui`; c.textBaseline = 'alphabetic'; c.textAlign = 'left';
    c.fillText(`${screen.name} · ${view.name}  ${Math.round(vw)} × ${Math.round(vh)}`, 0, -12 / zoom, vw);
    const original = active && !screen.source ? screen.layers.find(n => n.id === selected) : undefined;
    let n = original && {...original};
    if(n) {
      if(resizing) { n.width=Math.max(1,n.width+dx); n.height=Math.max(1,n.height+dy); n.right-=dx; }
      else { n.x+=dx; n.y+=dy; }
      n=resolveLayer(n,vw);
    }
    if(n || frameSelected) {
      const x=frameSelected?0:n!.x, y=frameSelected?0:n!.y;
      const w=frameSelected?vw:n!.width, h=frameSelected?vh:n!.height;
      c.strokeStyle = '#5574ef'; c.lineWidth = 1 / zoom; c.strokeRect(x,y,w,h);
      const hx=x+w,hy=y+h;
      c.fillStyle='#ffffff'; c.fillRect(hx-3/zoom,hy-3/zoom,6/zoom,6/zoom); c.strokeRect(hx-3/zoom,hy-3/zoom,6/zoom,6/zoom);
    }
    c.restore();
    if (frameSelected && snapping) {
      const targets = snapTargets(view, workspace.views);
      const tx = targets.x.find(t => Math.abs(t.value - vx) < 0.001);
      const ty = targets.y.find(t => Math.abs(t.value - vy) < 0.001);
      if (tx) drawGuide(c,tx,true,vx,vy,vw,vh,zoom);
      if (ty) drawGuide(c,ty,false,vx,vy,vw,vh,zoom);
    }
  }
  c.restore();
}

function drawGuide(c: Ctx2D, target: SnapTarget, horizontal: boolean, x: number, y: number, width: number, height: number, zoom: number) {
  c.save(); c.strokeStyle='#e44c91'; c.fillStyle='#e44c91'; c.lineWidth=1/zoom;
  const line = (x1: number,y1: number,x2: number,y2: number) => {c.beginPath();c.moveTo(x1,y1);c.lineTo(x2,y2);c.stroke();};
  if (!target.gap) {
    if(horizontal) line(target.guide,Math.min(target.start,y)-12/zoom,target.guide,Math.max(target.end,y+height)+12/zoom);
    else line(Math.min(target.start,x)-12/zoom,target.guide,Math.max(target.end,x+width)+12/zoom,target.guide);
  } else {
    const end = horizontal ? (x>target.guide?x:x+width) : (y>target.guide?y:y+height);
    const cross = horizontal ? y-30/zoom : x-14/zoom;
    if(horizontal) {
      line(target.guide,cross,end,cross);line(target.guide,cross-3/zoom,target.guide,cross+3/zoom);line(end,cross-3/zoom,end,cross+3/zoom);
    } else {
      line(cross,target.guide,cross,end);line(cross-3/zoom,target.guide,cross+3/zoom,target.guide);line(cross-3/zoom,end,cross+3/zoom,end);
    }
    c.font=`${10/zoom}px system-ui`;c.textAlign='center';c.textBaseline='bottom';
    c.fillText(`${Math.round(Math.abs(end-target.guide))}`,horizontal?(target.guide+end)/2:cross,horizontal?cross-4/zoom:(target.guide+end)/2);
  }
  c.restore();
}
