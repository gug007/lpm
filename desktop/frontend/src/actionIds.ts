// Menu children get composite `parent:child` ids from the resolver
// (resolve_actions in config.rs); top-level names can't contain a colon.
export function splitChild(id: string): { parent: string; child: string } | null {
  const i = id.indexOf(":");
  if (i < 0) return null;
  return { parent: id.slice(0, i), child: id.slice(i + 1) };
}

export function isChildId(id: string): boolean {
  return id.includes(":");
}
