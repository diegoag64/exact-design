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
/** Whether a screen's route (a real path, with any query or fragment) is one the manifest pattern serves: `:name` takes
 *  one segment and `*name` the rest. */
export function routeServed(route: string, pattern: string): boolean {
  // Segments as the router compares them: a trailing slash is a segment of its own, so `/activity/` is not `/activity`.
  const parts = (route.split(/[?#]/)[0] || '/').split('/').slice(1), wanted = pattern.split('/').slice(1);
  for (let i = 0; i < wanted.length; i++) {
    if (wanted[i].startsWith('*')) return true;
    if (i >= parts.length) return false;
    if (wanted[i].startsWith(':') ? !parts[i] : wanted[i] !== parts[i]) return false;
  }
  return parts.length === wanted.length;
}
