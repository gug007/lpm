import YAML from "yaml";
import {
  type ConfigLayer,
  editAllLayers,
  editFirstLayer,
  editProjectDoc,
  projectLayer,
  repoLayer,
} from "./yamlQueue";

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

function forEachSeqRef(
  list: unknown,
  update: (list: YAML.YAMLSeq, index: number, name: string) => void,
) {
  if (!YAML.isSeq(list)) return;
  for (let i = list.items.length - 1; i >= 0; i--) {
    const v = list.items[i];
    const name = YAML.isScalar(v) ? String(v.value) : v;
    update(list, i, String(name));
  }
}

function forEachProfileServiceRef(
  doc: ReturnType<typeof YAML.parseDocument>,
  update: (list: YAML.YAMLSeq, index: number, name: string) => void,
) {
  const profiles = doc.get("profiles", true);
  if (!YAML.isMap(profiles)) return;
  for (const item of profiles.items) {
    forEachSeqRef(item.value, update);
  }
}

function forEachDependsOnRef(
  doc: ReturnType<typeof YAML.parseDocument>,
  update: (list: YAML.YAMLSeq, index: number, name: string) => void,
) {
  const services = getServicesMap(doc);
  if (!services) return;
  for (const item of services.items) {
    const entry = item.value;
    if (!YAML.isMap(entry)) continue;
    forEachSeqRef(entry.get("dependsOn", true), update);
    forEachSeqRef(entry.get("depends_on", true), update);
  }
}

// Rewrites every reference to a service name — in profile lists and in other
// services' dependency lists — within one document. Returns whether it changed.
export function rewriteServiceRefs(
  doc: ReturnType<typeof YAML.parseDocument>,
  oldKey: string,
  newKey: string,
): boolean {
  let changed = false;
  const rename = (list: YAML.YAMLSeq, i: number, name: string) => {
    if (name === oldKey) {
      list.set(i, newKey);
      changed = true;
    }
  };
  forEachProfileServiceRef(doc, rename);
  forEachDependsOnRef(doc, rename);
  return changed;
}

// Strips every reference to a service name — in profile lists and in other
// services' dependency lists — within one document. Returns whether it changed.
export function stripServiceRefs(
  doc: ReturnType<typeof YAML.parseDocument>,
  key: string,
): boolean {
  let changed = false;
  const strip = (list: YAML.YAMLSeq, i: number, name: string) => {
    if (name === key) {
      list.delete(i);
      changed = true;
    }
  };
  forEachProfileServiceRef(doc, strip);
  forEachDependsOnRef(doc, strip);
  return changed;
}

function serviceLayers(projectName: string): readonly ConfigLayer[] {
  return [projectLayer(projectName), repoLayer(projectName)];
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

// Patches in place so user-authored fields the form doesn't manage
// (e.g. per-service profiles list) survive an edit.
export async function replaceService(projectName: string, key: string, patch: ServicePatch) {
  await editFirstLayer(serviceLayers(projectName), (doc) => {
    const services = getServicesMap(doc);
    if (!services || !services.has(key)) return false;

    // Compact `name: cmd-string` form needs to be promoted to a mapping
    // before fields can be patched onto it.
    const raw = services.get(key, true);
    if (!YAML.isMap(raw)) {
      const cmd = YAML.isScalar(raw) ? String(raw.value ?? "") : "";
      services.set(key, doc.createNode({ cmd }));
    }
    const entry = services.get(key, true);
    if (!YAML.isMap(entry)) return false;

    for (const [k, v] of Object.entries(patch.set)) entry.set(k, v);
    for (const k of patch.remove) entry.delete(k);
    return true;
  });
}

// Renames in the topmost layer that has the service; profile and dependency
// refs are rewritten in every layer so nothing dangles under the old name.
export async function renameService(projectName: string, oldKey: string, newKey: string) {
  if (oldKey === newKey) return;
  let renamed = false;
  await editAllLayers(serviceLayers(projectName), (doc) => {
    let changed = false;
    if (!renamed) {
      const services = getServicesMap(doc);
      if (services?.has(oldKey)) {
        const entry = services.get(oldKey, true);
        services.delete(oldKey);
        services.set(newKey, entry);
        renamed = true;
        changed = true;
      }
    }
    if (rewriteServiceRefs(doc, oldKey, newKey)) changed = true;
    return changed;
  });
}

// Strips profile and dependency refs across all layers so the resulting YAML
// stays valid after the service is gone.
export async function deleteService(projectName: string, key: string) {
  let removed = false;
  await editAllLayers(serviceLayers(projectName), (doc) => {
    let changed = false;
    if (!removed) {
      const services = getServicesMap(doc);
      if (services?.has(key)) {
        services.delete(key);
        if (services.items.length === 0) doc.delete("services");
        removed = true;
        changed = true;
      }
    }
    if (stripServiceRefs(doc, key)) changed = true;
    return changed;
  });
}
