import {test, expect} from 'bun:test';
import {render} from './render';
import {createWorkspace} from './workspace';
import type {Ctx2D, Frame} from './app.contract.d.ts';

function context() {
  const labels: string[] = [];
  let measures = 0;
  const c = new Proxy({font: ''}, {get(target, key) {
    if (key === 'measureText') return (text: string) => { measures++; return {width: text.length * 6}; };
    if (key === 'fillText') return (text: string) => labels.push(text);
    return key in target ? target[key as keyof typeof target] : () => {};
  }}) as unknown as Ctx2D;
  return {c, labels, measures: () => measures};
}
const frame = {width: 1280, height: 800} as Frame;

test('camera changes reuse label metrics and document edits invalidate the scene', () => {
  const ctx = context(), workspace = createWorkspace();
  const draw = (zoom: number) => render([JSON.stringify({...workspace, active: ''}), '', zoom, 0, 0, 0, 0, false, false], ctx.c, frame);
  draw(1);
  const measures = ctx.measures();
  draw(0.8);
  expect(ctx.measures()).toBe(measures);
  workspace.screens[0].name = 'Renamed';
  ctx.labels.length = 0;
  draw(1);
  expect(ctx.labels).toContain('Renamed');
  expect(ctx.labels).not.toContain('Home');
});

test('offscreen labels reappear when panned into view and active decorations remain', () => {
  const ctx = context(), workspace = createWorkspace();
  workspace.views[0].x = 2000;
  const draw = (pan: number, active = '') => render([JSON.stringify({...workspace, active}), '', 1, pan, 0, 0, 0, false, false], ctx.c, frame);
  draw(0);
  expect(ctx.labels).toEqual([]);
  draw(-2000);
  expect(ctx.labels).toContain('Home');
  ctx.labels.length = 0;
  draw(0, workspace.views[0].id);
  expect(ctx.labels).toContain('Home');
});

test('a font load remeasures labels and an empty truncation draws no text', () => {
  const ctx = context(), workspace = createWorkspace();
  const draw = (zoom: number, cause = 'args') => render([JSON.stringify({...workspace, active: ''}), '', zoom, 0, 0, 0, 0, false, false], ctx.c, {...frame, cause, causes: [cause]} as Frame);
  draw(1);
  const measures = ctx.measures();
  draw(1);
  expect(ctx.measures()).toBe(measures);
  draw(1, 'font');
  expect(ctx.measures()).toBeGreaterThan(measures);
  ctx.labels.length = 0;
  draw(0.01);
  expect(ctx.labels).toEqual([]);
});
