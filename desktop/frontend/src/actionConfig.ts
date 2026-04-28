import YAML from "yaml";
import {
  ReadConfig,
  ReadGlobalConfig,
  SaveConfig,
  SaveGlobalConfig,
} from "../wailsjs/go/main/App";

// Serialize read-modify-write per project (and a single queue for global)
// so concurrent callers can't interleave reads and clobber each other.
const writeQueues = new Map<string, Promise<unknown>>();
const GLOBAL_KEY = "__global__";

function queueWrite<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = writeQueues.get(key) ?? Promise.resolve();
  const next = prev.catch(() => undefined).then(fn);
  writeQueues.set(key, next);
  return next;
}

// The displayed action list merges `actions:` and `terminals:` (backend
// ResolvedActions). This walks both so edit/delete work for entries declared
// under either section.
function findActionSection(doc: ReturnType<typeof YAML.parseDocument>, key: string) {
  for (const section of ["actions", "terminals"] as const) {
    const node = doc.get(section, true);
    if (YAML.isMap(node) && node.has(key)) return { section, node };
  }
  return null;
}

async function tryDeleteAction(
  read: () => Promise<string>,
  save: (content: string) => Promise<unknown>,
  key: string,
): Promise<boolean> {
  const content = await read();
  const doc = YAML.parseDocument(content || "{}");
  const match = findActionSection(doc, key);
  if (!match) return false;
  match.node.delete(key);
  if (match.node.items.length === 0) doc.delete(match.section);
  await save(String(doc));
  return true;
}

export function appendAction(projectName: string, key: string, payload: Record<string, unknown>) {
  return queueWrite(projectName, async () => {
    const content = await ReadConfig(projectName);
    const doc = YAML.parseDocument(content || "{}");
    let actions = doc.get("actions", true);
    if (!YAML.isMap(actions)) {
      actions = doc.createNode({});
      doc.set("actions", actions);
    }
    if (YAML.isMap(actions)) actions.set(key, payload);
    await SaveConfig(projectName, String(doc));
  });
}

// Per-project entries take precedence in the merge, so try the project YAML
// first; if the key only lives in the shared global config, fall through
// and delete it there. When both configs define the same key, removing the
// project entry lets the global fallback take over — by design, since the
// user is acting on the project view.
export function deleteAction(projectName: string, key: string) {
  return queueWrite(projectName, async () => {
    const removed = await tryDeleteAction(
      () => ReadConfig(projectName),
      (content) => SaveConfig(projectName, content),
      key,
    );
    if (removed) return;
    await queueWrite(GLOBAL_KEY, () =>
      tryDeleteAction(ReadGlobalConfig, SaveGlobalConfig, key).then(() => undefined),
    );
  });
}

export interface ActionPatch {
  set: Record<string, unknown>;
  remove: readonly string[];
}

// Patch in place rather than overwriting, so user-authored fields the wizard
// doesn't manage (cwd, env, inputs, ...) survive an edit.
async function tryReplaceAction(
  read: () => Promise<string>,
  save: (content: string) => Promise<unknown>,
  key: string,
  patch: ActionPatch,
): Promise<boolean> {
  const content = await read();
  const doc = YAML.parseDocument(content || "{}");
  const match = findActionSection(doc, key);
  if (!match) return false;
  const entry = match.node.get(key, true);
  if (!YAML.isMap(entry)) return false;
  for (const [k, v] of Object.entries(patch.set)) entry.set(k, v);
  for (const k of patch.remove) entry.delete(k);
  await save(String(doc));
  return true;
}

export function replaceAction(projectName: string, key: string, patch: ActionPatch) {
  return queueWrite(projectName, async () => {
    const updated = await tryReplaceAction(
      () => ReadConfig(projectName),
      (content) => SaveConfig(projectName, content),
      key,
      patch,
    );
    if (updated) return;
    await queueWrite(GLOBAL_KEY, () =>
      tryReplaceAction(ReadGlobalConfig, SaveGlobalConfig, key, patch).then(() => undefined),
    );
  });
}
