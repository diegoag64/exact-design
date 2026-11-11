import type { Ctx2D, Frame } from './app.contract.d.ts';
import type { Layer } from './model';
export function render(args: unknown[], c: Ctx2D, frame: Frame) {
  const [drawing, selected, zoom, panX, panY, dx, dy, resizing] = args as [string, string, number, number, number, number, number, boolean];
  const layers = JSON.parse(drawing || '[]') as Layer[];
  c.clearRect(0, 0, frame.width, frame.height);
  c.fillStyle = '#ededee'; c.fillRect(0, 0, frame.width, frame.height);
  c.save(); c.translate(panX, panY); c.scale(zoom, zoom);
  c.shadowColor = '#00000012'; c.shadowBlur = 16; c.shadowOffsetY = 4;
  c.fillStyle = '#ffffff'; c.fillRect(0, 0, 720, 520); c.shadowColor = 'transparent';
  c.fillStyle = '#808087'; c.font = `${11 / zoom}px system-ui`; c.fillText('Screen', 0, -12 / zoom);
  for (const original of layers) {
    const n = original.id === selected && resizing ? {...original, width: Math.max(1, original.width + dx), height: Math.max(1, original.height + dy)} : original;
    const x = n.x + (n.id === selected && !resizing ? dx : 0), y = n.y + (n.id === selected && !resizing ? dy : 0);
    c.fillStyle = n.fill;
    if(n.kind === 'text') { c.font = `${n.fontSize}px system-ui`; c.textBaseline = 'top'; c.fillText(n.text, x, y, n.width); }
    else {
      c.beginPath(); c.roundRect(x, y, n.width, n.height, Math.min(n.radius, n.width / 2, n.height / 2)); c.fill();
      if(n.kind === 'button') { c.fillStyle = '#ffffff'; c.font = `${n.fontSize}px system-ui`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(n.text, x + n.width / 2, y + n.height / 2, Math.max(1,n.width - 16)); c.textAlign = 'left'; }
    }
  }
  const original = layers.find(n => n.id === selected);
  const n = original && resizing ? {...original, width: Math.max(1,original.width+dx), height: Math.max(1,original.height+dy)} : original;
  if(n) {
    const x=n.x+(resizing?0:dx), y=n.y+(resizing?0:dy);
    c.strokeStyle = '#5574ef'; c.lineWidth = 1 / zoom; c.strokeRect(x,y,n.width,n.height);
    for(const [hx,hy] of [[x+n.width,y+n.height]]) { c.fillStyle='#ffffff'; c.fillRect(hx-3/zoom,hy-3/zoom,6/zoom,6/zoom); c.strokeRect(hx-3/zoom,hy-3/zoom,6/zoom,6/zoom); }
  }
  c.restore();
}
