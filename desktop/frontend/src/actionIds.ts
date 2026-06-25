// Menu children get composite path ids from the resolver (`a:b:c`); no key on
// the path may contain a colon (it's the separator).
export function splitChild(id: string): { parent: string; child: string } | null {
  const i = id.lastIndexOf(":");
  if (i < 0) return null;
  return { parent: id.slice(0, i), child: id.slice(i + 1) };
}

export function isChildId(id: string): boolean {
  return id.includes(":");
}

export function parsePath(id: string): string[] {
  return id.split(":");
}

export function parentPath(id: string): string | null {
  const i = id.lastIndexOf(":");
  return i < 0 ? null : id.slice(0, i);
}

export function leafKey(id: string): string {
  const i = id.lastIndexOf(":");
  return i < 0 ? id : id.slice(i + 1);
}
