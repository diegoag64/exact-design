/** Viewport sizes in CSS pixels (iOS points). Phone, Tablet and Desktop keep their original sizes for saved workspaces. */
export type DeviceKind = 'phone' | 'tablet' | 'desktop';
export type Device = { name: string; width: number; height: number; kind: DeviceKind };
export const devices: Device[] = [
  { name: 'iPhone SE', width: 375, height: 667, kind: 'phone' },
  { name: 'Phone', width: 390, height: 844, kind: 'phone' },
  { name: 'iPhone Pro', width: 402, height: 874, kind: 'phone' },
  { name: 'Android', width: 412, height: 915, kind: 'phone' },
  { name: 'iPhone Pro Max', width: 440, height: 956, kind: 'phone' },
  { name: 'iPad mini', width: 744, height: 1133, kind: 'tablet' },
  { name: 'Tablet', width: 768, height: 1024, kind: 'tablet' },
  { name: 'iPad Air', width: 820, height: 1180, kind: 'tablet' },
  { name: 'iPad Pro', width: 1032, height: 1376, kind: 'tablet' },
  { name: 'iPad landscape', width: 1180, height: 820, kind: 'tablet' },
  { name: 'Laptop', width: 1280, height: 800, kind: 'desktop' },
  { name: 'Desktop', width: 1440, height: 900, kind: 'desktop' },
  { name: 'Wide', width: 1920, height: 1080, kind: 'desktop' },
];
/** Named groups of devices, added together and laid out narrowest first. */
export const deviceSets: Record<string, string[]> = {
  Core: ['Phone', 'Tablet', 'Desktop'],
  'Apple devices': ['iPhone SE', 'iPhone Pro Max', 'iPad mini', 'iPad Pro', 'Laptop'],
  'Every size': devices.map(d => d.name),
};
export const presets: Record<string, [number, number]> = Object.fromEntries(devices.map(d => [d.name, [d.width, d.height]]));
export const slug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
/** A device or set name as the devices it adds, narrowest first; unknown names add nothing. */
export function resolveDevices(choice: string): Device[] {
  const names = deviceSets[choice] ?? (presets[choice] ? [choice] : []);
  return devices.filter(d => names.includes(d.name)).sort((a, b) => a.width - b.width);
}
/** Options for the studio's pickers: sets first, then each device with its size. */
export function deviceOptions() {
  return {
    devices: devices.map(d => ({ name: d.name, slug: slug(d.name), kind: d.kind, width: d.width, height: d.height, label: `${d.name} · ${d.width} × ${d.height}` })),
    sets: Object.entries(deviceSets).map(([name, names]) => ({ name, slug: slug(name), label: `${name} · ${names.length} sizes`, count: names.length })),
  };
}
