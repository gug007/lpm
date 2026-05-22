import YAML from "yaml";
import {
  type ConfigLayer,
  editFirstLayer,
  editGlobalDoc,
  editProjectDoc,
  editRepoDoc,
  globalLayer,
  projectLayer,
  repoLayer,
} from "./yamlQueue";

export type ActionConfigLayer = "project" | "repo" | "global";

export const ACTION_SECTIONS = ["actions", "terminals"] as const;
export type ActionSection = (typeof ACTION_SECTIONS)[number];

// The UI surface merges `actions:` and `terminals:` (see ResolvedActions),
// so edit/delete must look in both sections to find any displayed entry.
function findActionSection(doc: ReturnType<typeof YAML.parseDocument>, key: string) {
  for (const section of ACTION_SECTIONS) {
    const node = doc.get(section, true);
    if (YAML.isMap(node) && node.has(key)) return { section, node };
  }
  return null;
}

function actionLayers(projectName: string): readonly ConfigLayer[] {
  return [projectLayer(projectName), repoLayer(projectName), globalLayer];
}

export function appendActionToLayer(
  projectName: string,
  key: string,
  payload: Record<string, unknown>,
  layer: ActionConfigLayer,
) {
  const mutate = (doc: ReturnType<typeof YAML.parseDocument>) => {
    let actions = doc.get("actions", true);
    if (!YAML.isMap(actions)) {
      actions = doc.createNode({});
      doc.set("actions", actions);
    }
    if (YAML.isMap(actions)) actions.set(key, payload);
  };
  if (layer === "repo") return editRepoDoc(projectName, mutate);
  if (layer === "global") return editGlobalDoc(mutate);
  return editProjectDoc(projectName, mutate);
}

// Returns the topmost layer (in project → repo → global order) that defines
// the action key, matching where editFirstLayer will write an edit.
export async function findActionSource(
  projectName: string,
  key: string,
): Promise<ActionConfigLayer | null> {
  const candidates: Array<[ActionConfigLayer, ConfigLayer]> = [
    ["project", projectLayer(projectName)],
    ["repo", repoLayer(projectName)],
    ["global", globalLayer],
  ];
  for (const [name, layer] of candidates) {
    try {
      const content = await layer.read();
      const doc = YAML.parseDocument(content || "{}");
      if (findActionSection(doc, key)) return name;
    } catch {
      continue;
    }
  }
  return null;
}

// Acts on the topmost layer that defines the key; the lower layer remains
// as the new fallback once the topmost copy is removed.
export async function deleteAction(projectName: string, key: string) {
  await editFirstLayer(actionLayers(projectName), (doc) => {
    const match = findActionSection(doc, key);
    if (!match) return false;
    match.node.delete(key);
    if (match.node.items.length === 0) doc.delete(match.section);
    return true;
  });
}

export interface ActionPatch {
  set: Record<string, unknown>;
  remove: readonly string[];
}

// Patches in place rather than overwriting, so user-authored fields the
// wizard doesn't manage (cwd, env, inputs, ...) survive an edit.
export async function replaceAction(projectName: string, key: string, patch: ActionPatch) {
  await editFirstLayer(actionLayers(projectName), (doc) => {
    const match = findActionSection(doc, key);
    if (!match) return false;
    const entry = match.node.get(key, true);
    if (!YAML.isMap(entry)) return false;
    for (const [k, v] of Object.entries(patch.set)) entry.set(k, v);
    for (const k of patch.remove) entry.delete(k);
    return true;
  });
}

// Whole-payload replacement for the YAML editor: drops every existing field
// on the entry and writes only what the user supplied.
export async function replaceActionPayload(projectName: string, key: string, payload: Record<string, unknown>) {
  await editFirstLayer(actionLayers(projectName), (doc) => {
    const match = findActionSection(doc, key);
    if (!match) return false;
    match.node.set(key, payload);
    return true;
  });
}
