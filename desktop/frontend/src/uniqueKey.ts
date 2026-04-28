export function uniqueKey(prefix: string, existing: string[]): string {
  if (!existing.includes(prefix)) return prefix;
  let i = 2;
  while (existing.includes(`${prefix}-${i}`)) i += 1;
  return `${prefix}-${i}`;
}
