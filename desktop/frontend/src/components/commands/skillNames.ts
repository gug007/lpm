import { isValidCommandName } from "../../lpmCommands";

// Names lpm offers in place of one that can't be used: what a typed name becomes
// under the naming rule, and a free one beside a name that's taken.

const MAX_NAME_LENGTH = 64;

// "Fix Ticket!" becomes "fix-ticket"; null when nothing usable is left.
export function nameSuggestion(typed: string): string | null {
  const slug = typed
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_NAME_LENGTH)
    .replace(/-+$/, "");
  return isValidCommandName(slug) ? slug : null;
}

function withSuffix(base: string, suffix: string): string {
  const room = MAX_NAME_LENGTH - suffix.length - 1;
  return `${base.slice(0, room).replace(/-+$/, "")}-${suffix}`;
}

const isFree = (taken: ReadonlySet<string>) => (name: string) => !taken.has(name.toLowerCase());

// `base-2`, `base-3`… whichever is first free in `taken` (lowercase names).
export function nextFreeName(base: string, taken: ReadonlySet<string>): string {
  const free = isFree(taken);
  for (let n = 2; ; n++) {
    const name = withSuffix(base, String(n));
    if (free(name)) return name;
  }
}

// `base-copy`, then `base-copy-2`… for a duplicate.
export function copyName(base: string, taken: ReadonlySet<string>): string {
  const first = withSuffix(base, "copy");
  return isFree(taken)(first) ? first : nextFreeName(first, taken);
}
