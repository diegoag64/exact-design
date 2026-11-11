import { screenRoute } from './project';

export type DiscoveredScreen = { name: string; route: string; dynamic: boolean };
export function hasRouteParameters(route: string): boolean {
  return route.split('/').some(part => part.startsWith(':') || part.includes('*'));
}
export function parseRoutes(value: unknown): DiscoveredScreen[] {
  const entries = (value as {routes?: unknown})?.routes;
  if (!Array.isArray(entries) || entries.length > 1000) throw new Error('This server did not return an Exact route manifest.');
  const seen = new Set<string>();
  const screens: DiscoveredScreen[] = [];
  for (const entry of entries) {
    if (!entry || typeof entry !== 'object') throw new Error('The route manifest contains an invalid screen.');
    if (entry.notfound === true) continue;
    if (typeof entry.name !== 'string' || !entry.name.trim() || typeof entry.pattern !== 'string' || !entry.pattern.startsWith('/')) throw new Error('The route manifest contains an invalid screen.');
    const route = screenRoute(entry.pattern);
    if (seen.has(route)) continue;
    seen.add(route);
    const words = entry.name.replace(/([a-z\d])([A-Z])/g, '$1 $2').replace(/[-_]+/g, ' ').trim();
    screens.push({name: (words.charAt(0).toUpperCase() + words.slice(1)).slice(0,120), route, dynamic: hasRouteParameters(route)});
  }
  return screens;
}
