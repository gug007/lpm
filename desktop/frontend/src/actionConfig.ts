import YAML from "yaml";
import {
  type ConfigLayer,
  editFirstLayer,
  editGlobalDoc,
  editProjectDoc,
  editRepoDoc,
  globalLayer,
  projectLayer,
  queueWrite,
  repoLayer,
} from "./yamlQueue";

export type ActionConfigLayer = "project" | "repo" | "global";

type ActionDoc = ReturnType<typeof YAML.parseDocument>;

function layerFor(projectName: string, layer: ActionConfigLayer): ConfigLayer {
  if (layer === "repo") return repoLayer(projectName);
  if (layer === "global") return globalLayer;
  return projectLayer(projectName);
}

export const ACTION_SECTIONS = ["actions", "terminals"] as const;
export type ActionSection = (typeof ACTION_SECTIONS)[number];

// The UI surface merges `actions:` and `terminals:` (see ResolvedActions),
// so edit/delete must look in both sections to find any displayed entry.
export function findActionSection(doc: ReturnType<typeof YAML.parseDocument>, key: string) {
  for (const section of ACTION_SECTIONS) {
    const node = doc.get(section, true);
    if (YAML.isMap(node) && node.has(key)) return { section, node };
  }
  return null;
}

// True when the entry carries the action's body (cmd, child actions, or the
// scalar-string shorthand for cmd). Thin overrides that only set per-user
// metadata like position aren't definitions — they layer on top of one.
export function hasActionBody(entry: unknown): boolean {
  if (YAML.isScalar(entry)) {
    const value = (entry as YAML.Scalar).value;
    return typeof value === "string" && value.trim() !== "";
  }
  if (YAML.isMap(entry)) {
    return entry.has("cmd") || entry.has("actions");
  }
  return false;
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

// Returns the topmost layer that carries the action's body — the one
// replaceAction will write into. Layers with only thin overrides
// (position, etc.) are skipped, since edits should land where the action
// is actually defined.
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
      const match = findActionSection(doc, key);
      if (!match) continue;
      const entry = match.node.get(key, true);
      if (hasActionBody(entry)) return name;
    } catch {
      continue;
    }
  }
  return null;
}

// Normalizes an action entry node to a plain object. The scalar-string
// shorthand (`key: some command`) expands to `{ cmd: <value> }`; a mapping is
// returned as-is so unmanaged fields (env, inputs, position, ...) survive.
export function actionEntryToPayload(
  entry: unknown,
): Record<string, unknown> | null {
  if (YAML.isScalar(entry)) {
    const value = (entry as YAML.Scalar).value;
    if (typeof value === "string" && value.trim() !== "") return { cmd: value };
    return null;
  }
  if (YAML.isMap(entry)) {
    return (entry as YAML.YAMLMap).toJSON() as Record<string, unknown>;
  }
  return null;
}

// Reads the action's full body from the topmost layer that carries it, using
// the same layer-selection rule as findActionSource. Feeds the YAML editor a
// complete payload so a save doesn't drop fields the form never surfaced.
export async function readActionPayload(
  projectName: string,
  key: string,
): Promise<Record<string, unknown> | null> {
  for (const layer of actionLayers(projectName)) {
    try {
      const content = await layer.read();
      const doc = YAML.parseDocument(content || "{}");
      const match = findActionSection(doc, key);
      if (!match) continue;
      const entry = match.node.get(key, true);
      if (!hasActionBody(entry)) continue;
      return actionEntryToPayload(entry);
    } catch {
      continue;
    }
  }
  return null;
}

// Applies a form-derived patch onto a base payload without discarding unknown
// fields: removes precede sets, mirroring replaceAction's in-place semantics so
// the editor's whole-payload save preserves env/inputs/position.
export function mergeActionPayload(
  base: Record<string, unknown> | null,
  patch: ActionPatch,
): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...(base ?? {}) };
  for (const key of patch.remove) delete merged[key];
  for (const [key, value] of Object.entries(patch.set)) merged[key] = value;
  return merged;
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
// wizard doesn't manage (env, inputs, ...) survive an edit. Skips layers
// whose entry is just a thin override (no cmd / actions) so edits land
// on the canonical definition, not on top of a position-only override.
export async function replaceAction(projectName: string, key: string, patch: ActionPatch) {
  await editFirstLayer(actionLayers(projectName), (doc) => {
    const match = findActionSection(doc, key);
    if (!match) return false;
    const entry = match.node.get(key, true);
    if (!YAML.isMap(entry) || !hasActionBody(entry)) return false;
    for (const [k, v] of Object.entries(patch.set)) entry.set(k, v);
    for (const k of patch.remove) entry.delete(k);
    return true;
  });
}

// Whole-payload replacement for the YAML editor: drops every existing field
// on the entry and writes only what the user supplied. Same source-layer
// rule as replaceAction.
export async function replaceActionPayload(projectName: string, key: string, payload: Record<string, unknown>) {
  await editFirstLayer(actionLayers(projectName), (doc) => {
    const match = findActionSection(doc, key);
    if (!match) return false;
    const entry = match.node.get(key, true);
    if (!hasActionBody(entry)) return false;
    match.node.set(key, payload);
    return true;
  });
}

// Relocates an action entry from one doc to another, carrying its full node
// (and any unmanaged fields) as-is and preserving its section: a `terminals:`
// entry lands under `terminals:` in the target, not `actions:`. Throws — before
// mutating either doc — if the target already defines the key with a body, so a
// collision leaves both docs untouched.
export function moveActionBetweenDocs(
  sourceDoc: ActionDoc,
  targetDoc: ActionDoc,
  key: string,
) {
  const source = findActionSection(sourceDoc, key);
  if (!source) {
    throw new Error(`Couldn't find "${key}" in its config to move it.`);
  }
  const collision = findActionSection(targetDoc, key);
  if (collision && hasActionBody(collision.node.get(key, true))) {
    throw new Error(
      `An action named "${key}" already exists in that config. Remove or rename it there first.`,
    );
  }

  const entry = source.node.get(key, true);
  let targetSection = targetDoc.get(source.section, true);
  if (!YAML.isMap(targetSection)) {
    targetSection = targetDoc.createNode({});
    targetDoc.set(source.section, targetSection);
  }
  (targetSection as YAML.YAMLMap).set(key, entry);

  source.node.delete(key);
  if (source.node.items.length === 0) sourceDoc.delete(source.section);
}

// Serializes work across the given queue keys in a stable order so two files
// can be edited without racing other writers and without deadlocking when the
// keys coincide (project and repo share one).
function lockLayers<T>(keys: string[], fn: () => Promise<T>): Promise<T> {
  const distinct = [...new Set(keys)].sort();
  return distinct.reduceRight<() => Promise<T>>(
    (next, queueKey) => () => queueWrite(queueKey, next),
    fn,
  )();
}

// Moves an action's definition from one config layer to another, carrying the
// whole entry along. The caller applies any pending field edits afterward via
// the normal save path, which now finds the entry in its new home. Fails
// without touching either layer when the target already defines the key.
export async function moveAction(
  projectName: string,
  key: string,
  from: ActionConfigLayer,
  to: ActionConfigLayer,
) {
  if (from === to) return;
  const src = layerFor(projectName, from);
  const dst = layerFor(projectName, to);
  await lockLayers([src.queueKey, dst.queueKey], async () => {
    const srcDoc = YAML.parseDocument((await src.read()) || "{}");
    const dstDoc = YAML.parseDocument((await dst.read()) || "{}");
    moveActionBetweenDocs(srcDoc, dstDoc, key);
    await dst.save(String(dstDoc));
    await src.save(String(srcDoc));
  });
}
