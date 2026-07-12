// Round-trippable, pattern-parseable identifiers for projects/terminals/roots
// that belong to a paired peer. A peer's `slug` is 8 lowercase hex chars,
// assigned at pairing. No registry lookup is needed to route: the marker is
// self-describing.
//
//   name / terminal id : peer-{slug}-{raw}
//   project root        : /@peer-{slug}{hostAbsolutePath}   (host path starts with /)
//
// A root stays a valid absolute-looking path (starts with /) so string ops and
// display don't break. Both forms are Tauri-event-name safe.

const SLUG = "[0-9a-f]{8}";
const NAME_RE = new RegExp(`^peer-(${SLUG})-([\\s\\S]*)$`);
const ROOT_RE = new RegExp(`^/@peer-(${SLUG})(/[\\s\\S]*)$`);

export interface PeerMarker {
  slug: string;
  // The host-native identifier with the marker stripped: a raw project/terminal
  // name for the name form, or the host absolute path for the root form.
  raw: string;
  kind: "name" | "root";
}

export function parsePeerMarker(value: unknown): PeerMarker | null {
  if (typeof value !== "string") return null;
  const nameMatch = NAME_RE.exec(value);
  if (nameMatch) return { slug: nameMatch[1], raw: nameMatch[2], kind: "name" };
  const rootMatch = ROOT_RE.exec(value);
  if (rootMatch) return { slug: rootMatch[1], raw: rootMatch[2], kind: "root" };
  return null;
}

export function isPeerName(value: unknown): boolean {
  return typeof value === "string" && NAME_RE.test(value);
}

export function isPeerRoot(value: unknown): boolean {
  return typeof value === "string" && ROOT_RE.test(value);
}

// True for any marked identifier (name or root form).
export function isPeerMarked(value: unknown): boolean {
  return parsePeerMarker(value) !== null;
}

export function peerSlugOf(value: unknown): string | null {
  return parsePeerMarker(value)?.slug ?? null;
}

export function prefixName(slug: string, raw: string): string {
  return `peer-${slug}-${raw}`;
}

export function prefixRoot(slug: string, hostPath: string): string {
  return `/@peer-${slug}${hostPath}`;
}

// The host-native identifier for a marked value; returns the value unchanged
// when it isn't marked.
export function stripMarker(value: string): string {
  return parsePeerMarker(value)?.raw ?? value;
}

// The raw project/terminal name for a marked name; the value unchanged
// otherwise. Used for display of remote rows.
export function peerRawName(value: string): string {
  const marker = parsePeerMarker(value);
  return marker && marker.kind === "name" ? marker.raw : value;
}
