export type Layer = { id: string; kind: string; name: string; x: number; y: number; width: number; height: number; fill: string; text: string; fontSize: number; radius: number; widthMode: string; right: number };
export type Design = { version: 1; name: string; width: number; height: number; layers: Layer[] };
const layer = (id: string, kind: string, name: string, x: number, y: number, width: number, height: number, fill: string, text = '', fontSize = 16, radius = 0): Layer => ({ id, kind, name, x, y, width, height, fill, text, fontSize, radius, widthMode: 'fixed', right: 0 });
export const initial = (): Design => ({ version: 1, name: 'Untitled', width: 720, height: 520, layers: [
  layer('title', 'text', 'Heading', 56, 60, 608, 48, '#202124', 'A little room to think.', 32),
  layer('description', 'text', 'Description', 56, 120, 608, 28, '#787a80', 'Make space for your next idea.', 16),
  layer('card', 'rectangle', 'Card', 56, 192, 608, 176, '#f5f5f3', '', 16, 16),
  layer('card-title', 'text', 'Card title', 80, 220, 540, 32, '#292a2d', 'Start with something simple', 21),
  layer('card-copy', 'text', 'Card description', 80, 266, 540, 24, '#787a80', 'Good things begin with a blank page.', 15),
  layer('button', 'button', 'Button', 56, 410, 152, 44, '#292a2d', 'Get started', 14, 8),
] });
export function validate(value: unknown): Design {
  const d = structuredClone(value) as Design;
  if (!d || d.version !== 1 || typeof d.name !== 'string' || !Array.isArray(d.layers) || d.layers.length > 1000 || d.width !== 720 || d.height !== 520) throw new Error('Unsupported document');
  const ids = new Set<string>();
  for (const n of d.layers) {
    if (!n || typeof n.id !== 'string' || ids.has(n.id) || !['text', 'rectangle', 'button'].includes(n.kind)) throw new Error('Invalid layer');
    ids.add(n.id);
    n.widthMode ??= 'fixed'; n.right ??= 0;
    if (!['fixed', 'fill'].includes(n.widthMode) || !Number.isFinite(n.right)) throw new Error('Invalid width constraint');
    for (const k of ['x', 'y', 'width', 'height', 'fontSize', 'radius'] as const) if (!Number.isFinite(n[k])) throw new Error('Invalid geometry');
    if (n.width < 1 || n.height < 1 || n.fontSize < 1 || n.radius < 0 || !/^#[\da-f]{6}$/i.test(n.fill) || typeof n.text !== 'string' || typeof n.name !== 'string') throw new Error('Invalid properties');
  }
  return structuredClone(d);
}
export function hitTest(d: Design, x: number, y: number): string {
  return [...d.layers].reverse().find(n => x >= n.x && y >= n.y && x <= n.x + n.width && y <= n.y + n.height)?.id ?? '';
}
export class Editor {
  document = initial(); selected = ''; past: Design[] = []; future: Design[] = []; serial = 0;
  change(work: (d: Design) => void) {
    const next = structuredClone(this.document); work(next);
    if (JSON.stringify(next) === JSON.stringify(this.document)) return;
    this.past.push(this.document); if (this.past.length > 100) this.past.shift();
    this.document = next; this.future = [];
  }
  undo() { const d = this.past.pop(); if (d) { this.future.push(this.document); this.document = d; this.reconcile(); } }
  redo() { const d = this.future.pop(); if (d) { this.past.push(this.document); this.document = d; this.reconcile(); } }
  reconcile() { if (!this.document.layers.some(n => n.id === this.selected)) this.selected = ''; }
  add(kind: string) {
    if (!['rectangle', 'text', 'button'].includes(kind)) return;
    let id = ''; do { id = `layer-${++this.serial}`; } while (this.document.layers.some(n => n.id === id));
    this.change(d => d.layers.push(layer(id, kind, kind === 'text' ? 'Text' : kind === 'button' ? 'Button' : 'Rectangle', 240, 200, 200, kind === 'rectangle' ? 120 : 44, kind === 'rectangle' ? '#e4e4e7' : '#292a2d', kind === 'rectangle' ? '' : kind === 'text' ? 'Your text' : 'Button', 16, kind === 'text' ? 0 : 8)));
    this.selected = id;
  }
  remove() { this.change(d => { d.layers = d.layers.filter(n => n.id !== this.selected); }); this.selected = ''; }
  move(dx: number, dy: number) { if (!Number.isFinite(dx + dy)) return; this.change(d => { const n = d.layers.find(n => n.id === this.selected); if(n) { n.x = Math.round(n.x + dx); n.y = Math.round(n.y + dy); } }); }
  property(key: string, value: string) {
    this.change(d => {
      const n = d.layers.find(n => n.id === this.selected); if (!n) return;
      if (key === 'text' || key === 'name') n[key] = value.slice(0, 2000);
      else if (key === 'fill' && /^#[\da-f]{6}$/i.test(value)) n.fill = value;
      else if (['x','y','width','height','fontSize','radius'].includes(key) && value.trim() && Number.isFinite(Number(value))) {
        const k = key as 'x'|'y'|'width'|'height'|'fontSize'|'radius';
        n[k] = Math.round(Math.max(k === 'x' || k === 'y' ? -10000 : k === 'radius' ? 0 : 1, Math.min(10000, Number(value))));
      }
    });
  }
}
export function exportContract(d: Design): string {
  const q = JSON.stringify;
  const lines = ['component Screen', '  view', `    column position="relative" width="100%" height=${d.height} overflow="hidden" background-color="#ffffff"`];
  for (const n of d.layers) {
    const geometry = `position="absolute" left=${n.x} top=${n.y} width=${n.widthMode === 'fill' ? q(`max(1px, calc(100% - ${n.x + n.right}px))`) : n.width} height=${n.height}`;
    if(n.kind === 'text') lines.push(`      text ${q(n.text)} ${geometry} color=${q(n.fill)} font-size=${n.fontSize} line-height=1.2 white-space="pre-wrap" overflow-wrap="anywhere" overflow="hidden"`);
    else if(n.kind === 'button') lines.push(`      button ${geometry} background-color=${q(n.fill)} color="#ffffff" border-radius=${n.radius} border-width=0 padding=0 display="flex" align-items="center" justify-content="center" box-sizing="border-box" overflow="hidden" aria-label=${q(n.text)}`, `        text ${q(n.text)} font-size=${n.fontSize} line-height=1.2 white-space="pre-wrap" overflow-wrap="anywhere" overflow="hidden"`);
    else lines.push(`      column ${geometry} background-color=${q(n.fill)} border-radius=${n.radius}`);
  }
  return lines.join('\n') + '\n';
}

export function resolveLayer(n: Layer, viewportWidth: number): Layer {
  return {...n, width: n.widthMode === 'fill' ? Math.max(1, viewportWidth - n.x - n.right) : n.width};
}
