export function buildSwitchList(
  mru: string[],
  projectNames: string[],
  current: string | null,
): string[] {
  const exists = new Set(projectNames);
  const seen = new Set<string>();
  const result: string[] = [];

  if (current && exists.has(current)) {
    result.push(current);
    seen.add(current);
  }

  for (const name of mru) {
    if (seen.has(name) || !exists.has(name)) continue;
    result.push(name);
    seen.add(name);
  }

  for (const name of projectNames) {
    if (seen.has(name)) continue;
    result.push(name);
    seen.add(name);
  }

  return result;
}

export function cycleIndex(len: number, index: number, dir: 1 | -1): number {
  if (len <= 0) return 0;
  return (((index + dir) % len) + len) % len;
}
