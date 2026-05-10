import YAML from "yaml";
import {
  type ConfigLayer,
  editFirstLayer,
  editProjectDoc,
  projectLayer,
  repoLayer,
} from "./yamlQueue";

// The runtime treats the top-level `profiles:` map as the source of truth
// for which services a profile runs. Per-service `profiles:` lists exist in
// the schema but are not consumed, so this module ignores them.

function getProfilesMap(doc: ReturnType<typeof YAML.parseDocument>) {
  const node = doc.get("profiles", true);
  return YAML.isMap(node) ? node : null;
}

function ensureProfilesMap(doc: ReturnType<typeof YAML.parseDocument>) {
  const existing = getProfilesMap(doc);
  if (existing) return existing;
  const created = doc.createNode({});
  doc.set("profiles", created);
  const verified = doc.get("profiles", true);
  return YAML.isMap(verified) ? verified : null;
}

function profileLayers(projectName: string): readonly ConfigLayer[] {
  return [projectLayer(projectName), repoLayer(projectName)];
}

export function appendProfile(projectName: string, name: string, services: string[]) {
  return editProjectDoc(projectName, (doc) => {
    const profiles = ensureProfilesMap(doc);
    if (profiles) profiles.set(name, services);
  });
}

export async function replaceProfile(projectName: string, name: string, services: string[]) {
  await editFirstLayer(profileLayers(projectName), (doc) => {
    const profiles = getProfilesMap(doc);
    if (!profiles?.has(name)) return false;
    profiles.set(name, services);
    return true;
  });
}

export async function renameProfile(projectName: string, oldName: string, newName: string) {
  if (oldName === newName) return;
  await editFirstLayer(profileLayers(projectName), (doc) => {
    const profiles = getProfilesMap(doc);
    if (!profiles?.has(oldName)) return false;
    const entry = profiles.get(oldName, true);
    profiles.delete(oldName);
    profiles.set(newName, entry);
    return true;
  });
}

export async function deleteProfile(projectName: string, name: string) {
  await editFirstLayer(profileLayers(projectName), (doc) => {
    const profiles = getProfilesMap(doc);
    if (!profiles?.has(name)) return false;
    profiles.delete(name);
    if (profiles.items.length === 0) doc.delete("profiles");
    return true;
  });
}
