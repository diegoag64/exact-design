import type { View } from './workspace';

export const FRAME_GAP = 80;
export const SNAP_DISTANCE = 8;
export type SnapTarget = { value: number; guide: number; start: number; end: number; gap: boolean };

function axisTargets(size: number, position: number, otherSize: number, start: number, end: number): SnapTarget[] {
  const target = (value: number, guide: number, gap = false): SnapTarget => ({value, guide, start, end, gap});
  return [
    target(position, position),
    target(position + otherSize - size, position + otherSize),
    target(position + (otherSize - size) / 2, position + otherSize / 2),
    target(position + otherSize, position + otherSize),
    target(position - size, position),
    target(position + otherSize + FRAME_GAP, position + otherSize, true),
    target(position - size - FRAME_GAP, position, true),
  ];
}

export function snapTargets(view: View, views: View[]): {x: SnapTarget[]; y: SnapTarget[]} {
  const x: SnapTarget[] = [], y: SnapTarget[] = [];
  for (const other of views) {
    if (other.id === view.id) continue;
    x.push(...axisTargets(view.width, other.x, other.width, other.y, other.y + other.height));
    y.push(...axisTargets(view.height, other.y, other.height, other.x, other.x + other.width));
  }
  return {x, y};
}

export function snapAxis(targets: SnapTarget[], position: number, zoom: number): number {
  let best: SnapTarget | undefined;
  for (const target of targets) {
    if (!best || Math.abs(target.value - position) < Math.abs(best.value - position)) best = target;
  }
  return best && Math.abs(best.value - position) <= SNAP_DISTANCE / Math.max(0.05, zoom) ? best.value : position;
}

export function snapMove(view: View, views: View[], dx: number, dy: number, zoom: number) {
  if (dx === 0 && dy === 0) return {dx, dy};
  const targets = snapTargets(view, views);
  return {
    dx: snapAxis(targets.x, view.x + dx, zoom) - view.x,
    dy: snapAxis(targets.y, view.y + dy, zoom) - view.y,
  };
}
