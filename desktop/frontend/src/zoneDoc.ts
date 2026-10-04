import YAML from "yaml";

type Doc = ReturnType<typeof YAML.parseDocument>;

export function zonesOf(doc: Doc, create: boolean): YAML.YAMLMap | null {
  const node = doc.get("zones", true);
  if (YAML.isMap(node)) return node;
  if (!create) return null;
  doc.set("zones", doc.createNode({}));
  const created = doc.get("zones", true);
  return YAML.isMap(created) ? created : null;
}

export function keysOf(map: YAML.YAMLMap | null): string[] {
  return (map?.items ?? []).flatMap((item) => (YAML.isScalar(item.key) ? [String(item.key.value)] : []));
}

export function removeZoneFromDoc(doc: Doc, name: string): void {
  const zones = zonesOf(doc, false);
  if (!zones) return;
  zones.delete(name);
  if (zones.items.length === 0) doc.delete("zones");
}
