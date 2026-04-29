import YAML from "yaml";
import { editProjectDoc } from "./yamlQueue";

export interface ServicePatch {
  set: Record<string, unknown>;
  remove: readonly string[];
}

function getServicesMap(doc: ReturnType<typeof YAML.parseDocument>) {
  const node = doc.get("services", true);
  return YAML.isMap(node) ? node : null;
}

function ensureServicesMap(doc: ReturnType<typeof YAML.parseDocument>) {
  const existing = getServicesMap(doc);
  if (existing) return existing;
  const created = doc.createNode({});
  doc.set("services", created);
  const verified = doc.get("services", true);
  return YAML.isMap(verified) ? verified : null;
}

// Walk every profile's service-name list and apply `update` to each entry.
// Used by rename and delete to keep top-level `profiles:` references in sync
// with the canonical `services:` keys.
function forEachProfileServiceRef(
  doc: ReturnType<typeof YAML.parseDocument>,
  update: (list: YAML.YAMLSeq, index: number, name: string) => void,
) {
  const profiles = doc.get("profiles", true);
  if (!YAML.isMap(profiles)) return;
  for (const item of profiles.items) {
    const list = item.value;
    if (!YAML.isSeq(list)) continue;
    for (let i = list.items.length - 1; i >= 0; i--) {
      const v = list.items[i];
      const name = YAML.isScalar(v) ? String(v.value) : v;
      update(list, i, String(name));
    }
  }
}

export function appendService(
  projectName: string,
  key: string,
  payload: Record<string, unknown>,
) {
  return editProjectDoc(projectName, (doc) => {
    const services = ensureServicesMap(doc);
    if (services) services.set(key, payload);
  });
}

// Patch in place rather than overwriting, so user-authored fields the form
// doesn't manage (e.g. per-service profiles list) survive an edit.
export function replaceService(projectName: string, key: string, patch: ServicePatch) {
  return editProjectDoc(projectName, (doc) => {
    const services = getServicesMap(doc);
    if (!services || !services.has(key)) return;

    // Compact `name: cmd-string` form needs to be promoted to a mapping
    // before fields can be patched onto it.
    const raw = services.get(key, true);
    if (!YAML.isMap(raw)) {
      const cmd = YAML.isScalar(raw) ? String(raw.value ?? "") : "";
      services.set(key, doc.createNode({ cmd }));
    }
    const entry = services.get(key, true);
    if (!YAML.isMap(entry)) return;

    for (const [k, v] of Object.entries(patch.set)) entry.set(k, v);
    for (const k of patch.remove) entry.delete(k);
  });
}

export function renameService(projectName: string, oldKey: string, newKey: string) {
  if (oldKey === newKey) return Promise.resolve();
  return editProjectDoc(projectName, (doc) => {
    const services = getServicesMap(doc);
    if (!services || !services.has(oldKey)) return;
    const entry = services.get(oldKey, true);
    services.delete(oldKey);
    services.set(newKey, entry);
    forEachProfileServiceRef(doc, (list, i, name) => {
      if (name === oldKey) list.set(i, newKey);
    });
  });
}

// Removes the service entry plus any profile membership references so the
// resulting YAML still passes validation.
export function deleteService(projectName: string, key: string) {
  return editProjectDoc(projectName, (doc) => {
    const services = getServicesMap(doc);
    if (services?.has(key)) {
      services.delete(key);
      if (services.items.length === 0) doc.delete("services");
    }
    forEachProfileServiceRef(doc, (list, i, name) => {
      if (name === key) list.delete(i);
    });
  });
}
