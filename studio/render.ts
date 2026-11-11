import type { Ctx2D, Frame } from './app.contract.d.ts';
import type { Workspace } from './workspace';
import { resolveLayer } from './model';

// Exact components render screen content. Canvas only draws editor decorations.
export function render(args: unknown[], c: Ctx2D, frame: Frame) {
  const [drawing, selected, zoom, panX, panY, dx, dy, resizing] = args as [string, string, number, number, number, number, number, boolean];
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
    const original = active ? screen.layers.find(n => n.id === selected) : undefined;
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
  }
  c.restore();
}
