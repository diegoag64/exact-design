import type { Ctx2D, Frame } from './app.contract.d.ts';
import type { Workspace } from './workspace';
export function render(args: unknown[], c: Ctx2D, frame: Frame) {
  const [drawing, selected, zoom, panX, panY, dx, dy, resizing] = args as [string, string, number, number, number, number, number, boolean];
  const workspace = JSON.parse(drawing || '{}') as Workspace & {active: string};
  c.clearRect(0, 0, frame.width, frame.height);
  c.fillStyle = '#ededee'; c.fillRect(0, 0, frame.width, frame.height);
  c.save(); c.translate(panX, panY); c.scale(zoom, zoom);
  const activeScreen = workspace.views?.find(v=>v.id===workspace.active)?.screenId;
  for (const view of workspace.views ?? []) {
    const active = workspace.active === view.id;
    const frameSelected = active && selected === view.id;
    const vx = view.x + (frameSelected && !resizing ? dx : 0), vy = view.y + (frameSelected && !resizing ? dy : 0);
    const vw = Math.max(100,view.width + (frameSelected && resizing ? dx : 0)), vh = Math.max(100,view.height + (frameSelected && resizing ? dy : 0));
    const screen = workspace.screens.find(s=>s.id===view.screenId)!;
    const layers = screen.layers;
    c.save(); c.translate(vx,vy);
    c.shadowColor = '#00000012'; c.shadowBlur = 16; c.shadowOffsetY = 4;
    c.fillStyle = '#ffffff'; c.fillRect(0, 0, vw, vh); c.shadowColor = 'transparent';
    c.fillStyle = frameSelected ? '#5574ef' : '#808087'; c.font = `${11 / zoom}px system-ui`; c.textBaseline = 'alphabetic'; c.textAlign = 'left';
    c.fillText(`${screen.name} · ${view.name}  ${Math.round(vw)} × ${Math.round(vh)}`, 0, -12 / zoom, vw);
    c.save(); c.beginPath(); c.rect(0,0,vw,vh); c.clip();
    for (const original of layers) {
      const n = original.id === selected && activeScreen === view.screenId && resizing ? {...original, width: Math.max(1, original.width + dx), height: Math.max(1, original.height + dy)} : original;
      const x = n.x + (n.id === selected && activeScreen === view.screenId && !resizing ? dx : 0), y = n.y + (n.id === selected && activeScreen === view.screenId && !resizing ? dy : 0);
      c.fillStyle = n.fill;
      if(n.kind === 'text') { c.font = `${n.fontSize}px system-ui`; c.textBaseline = 'top'; c.fillText(n.text, x, y, n.width); }
      else {
        c.beginPath(); c.roundRect(x, y, n.width, n.height, Math.min(n.radius, n.width / 2, n.height / 2)); c.fill();
        if(n.kind === 'button') { c.fillStyle = '#ffffff'; c.font = `${n.fontSize}px system-ui`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(n.text, x + n.width / 2, y + n.height / 2, Math.max(1,n.width - 16)); c.textAlign = 'left'; }
      }
    }
    c.restore();
    const original = active ? layers.find(n => n.id === selected) : undefined;
    const n = original && resizing ? {...original, width: Math.max(1,original.width+dx), height: Math.max(1,original.height+dy)} : original;
    if(n || frameSelected) {
      const x=frameSelected?0:n!.x+(resizing?0:dx), y=frameSelected?0:n!.y+(resizing?0:dy);
      const w=frameSelected?vw:n!.width, h=frameSelected?vh:n!.height;
      c.strokeStyle = '#5574ef'; c.lineWidth = 1 / zoom; c.strokeRect(x,y,w,h);
      for(const [hx,hy] of [[x+w,y+h]]) { c.fillStyle='#ffffff'; c.fillRect(hx-3/zoom,hy-3/zoom,6/zoom,6/zoom); c.strokeRect(hx-3/zoom,hy-3/zoom,6/zoom,6/zoom); }
    }
    c.restore();
  }
  c.restore();
}
