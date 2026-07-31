// Is the host running something older than this Mac?
//
// Deliberately conservative: only say "behind" when both sides report a real
// version and they differ in a way we can order. A dev build, an unreported
// version, or anything unparseable means we keep quiet — nagging someone to
// update a host that is actually fine is worse than staying silent, and this
// decides whether we offer to restart their server.
export function isHostBehind(hostVersion: string, appVersion: string): boolean {
  const host = parseVersion(hostVersion);
  const app = parseVersion(appVersion);
  if (!host || !app) return false;
  for (let i = 0; i < 3; i++) {
    if (host[i] !== app[i]) return host[i] < app[i];
  }
  return false;
}

function parseVersion(value: string): [number, number, number] | null {
  const m = /^v?(\d+)\.(\d+)\.(\d+)/.exec(value.trim());
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}
