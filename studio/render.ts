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
    drawLabel(c, screen.name, view.name, vw, zoom, frameSelected);
    if (frameSelected) drawSize(c, `${Math.round(vw)} × ${Math.round(vh)}`, vw, vh, zoom);
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
      c.strokeStyle = '#0d99ff'; c.lineWidth = 1 / zoom; c.strokeRect(x,y,w,h);
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

/** Frame title: screen name, then the viewport in a quieter tone, truncated rather than squeezed. */
function drawLabel(c: Ctx2D, name: string, variant: string, width: number, zoom: number, selected: boolean) {
  const size = 11 / zoom, y = -8 / zoom;
  c.font = `500 ${size}px system-ui`; c.textBaseline = 'alphabetic'; c.textAlign = 'left';
  const fit = (text: string, room: number) => {
    if (c.measureText(text).width <= room) return text;
    let end = text.length; while (end > 1 && c.measureText(text.slice(0, end) + '…').width > room) end--;
    return end > 1 ? text.slice(0, end) + '…' : '';
  };
  const first = fit(name, width); c.fillStyle = selected ? '#0d99ff' : '#8c8c8c'; c.fillText(first, 0, y);
  if (first !== name) return;
  const gap = 6 / zoom, offset = c.measureText(name).width + gap;
  c.font = `${size}px system-ui`; const rest = fit(variant, width - offset);
  if (rest) { c.fillStyle = selected ? '#0d99ffb3' : '#8c8c8cb3'; c.fillText(rest, offset, y); }
}

/** Figma-style size badge centred under the selected frame. */
function drawSize(c: Ctx2D, text: string, width: number, height: number, zoom: number) {
  c.font = `500 ${10 / zoom}px system-ui`; c.textBaseline = 'middle'; c.textAlign = 'center';
  const w = c.measureText(text).width + 10 / zoom, h = 16 / zoom, x = width / 2 - w / 2, y = height + 8 / zoom;
  c.fillStyle = '#0d99ff'; c.beginPath(); c.roundRect(x, y, w, h, 3 / zoom); c.fill();
  c.fillStyle = '#ffffff'; c.fillText(text, width / 2, y + h / 2 + 0.5 / zoom);
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
