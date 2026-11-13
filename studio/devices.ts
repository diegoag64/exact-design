/** Viewport sizes in CSS pixels (iOS points). Phone, Tablet and Desktop keep their original sizes for saved workspaces. */
export type DeviceKind = 'phone' | 'tablet' | 'desktop';
/** `web` frames load the app in an iframe. `ios` frames show screenshots of the native build in the iOS Simulator. */
export type DevicePlatform = 'web' | 'ios';
export type Device = { name: string; width: number; height: number; kind: DeviceKind; platform?: DevicePlatform; simulator?: string };
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
  // Native frames: the size is the simulator's screen in points, and `simulator` is its CoreSimulator device type.
  { name: 'Native iPhone SE', width: 375, height: 667, kind: 'phone', platform: 'ios', simulator: 'com.apple.CoreSimulator.SimDeviceType.iPhone-SE-3rd-generation' },
  { name: 'Native iPhone 17', width: 402, height: 874, kind: 'phone', platform: 'ios', simulator: 'com.apple.CoreSimulator.SimDeviceType.iPhone-17' },
  { name: 'Native iPhone 17 Pro Max', width: 440, height: 956, kind: 'phone', platform: 'ios', simulator: 'com.apple.CoreSimulator.SimDeviceType.iPhone-17-Pro-Max' },
  { name: 'Native iPad Pro 11', width: 834, height: 1210, kind: 'tablet', platform: 'ios', simulator: 'com.apple.CoreSimulator.SimDeviceType.iPad-Pro-11-inch-M5-12GB' },
];
export const platformOf = (device: Device): DevicePlatform => device.platform ?? 'web';
const web = devices.filter(d => platformOf(d) === 'web').map(d => d.name);
/** Named groups of devices, added together and laid out narrowest first. */
export const deviceSets: Record<string, string[]> = {
  Core: ['Phone', 'Tablet', 'Desktop'],
  'Apple devices': ['iPhone SE', 'iPhone Pro Max', 'iPad mini', 'iPad Pro', 'Laptop'],
  'Every size': web,
  'Native iOS': devices.filter(d => platformOf(d) === 'ios').map(d => d.name),
};
export const presets: Record<string, [number, number]> = Object.fromEntries(devices.map(d => [d.name, [d.width, d.height]]));
export const slug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
/** A device or set name as the devices it adds, narrowest first; unknown names add nothing. */
export function resolveDevices(choice: string): Device[] {
  const names = deviceSets[choice] ?? (presets[choice] ? [choice] : []);
  return devices.filter(d => names.includes(d.name)).sort((a, b) => a.width - b.width);
}
/** The native device a catalog slug names, or undefined for web and unknown devices. */
export function nativeDevice(deviceSlug: string): Device | undefined {
  return devices.find(d => platformOf(d) !== 'web' && slug(d.name) === deviceSlug);
}
/** Options for the studio's pickers: sets first, then each device with its size. */
export function deviceOptions() {
  return {
    devices: devices.map(d => ({ name: d.name, slug: slug(d.name), kind: d.kind, platform: platformOf(d), width: d.width, height: d.height, label: `${d.name} · ${d.width} × ${d.height}` })),
    sets: Object.entries(deviceSets).map(([name, names]) => ({ name, slug: slug(name), label: `${name} · ${names.length} sizes`, count: names.length })),
  };
}
