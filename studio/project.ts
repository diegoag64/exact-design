export type Project = { name: string; url: string };
export type ScreenSource = { source: string; route: string };

export function projectUrl(value: string): string {
  const url=value.trim().replace(/\/$/, '');
  const match=/^https?:\/\/(?:\[[a-f\d:.]+\]|[a-z\d](?:[a-z\d.-]*[a-z\d])?)(?::(\d{1,5}))?$/i.exec(url);
  if(!match || (match[1] && (Number(match[1]) < 1 || Number(match[1]) > 65535))) throw new Error('Use a server URL, such as http://127.0.0.1:5174.');
  return url;
}
export function screenRoute(value: string): string {
  const route=value.trim() || '/';
  if(!route.startsWith('/') || route.startsWith('//') || /[\s\\]/.test(route) || route.length > 2048) throw new Error('Use a route starting with /, such as /settings.');
  return route;
}
export function screenSource(screen: ScreenSource, project: Project): string {
  return screen.route && project.url ? project.url + screen.route : screen.source;
}
