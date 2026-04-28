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

async function tryDeleteAction(
  read: () => Promise<string>,
  save: (content: string) => Promise<unknown>,
  key: string,
): Promise<boolean> {
  const content = await read();
  const doc = YAML.parseDocument(content || "{}");
  // The displayed action list merges `actions:` and `terminals:` (backend
  // ResolvedActions). Try both sections so right-click delete works for
  // entries declared under either.
  let removed = false;
  for (const section of ["actions", "terminals"] as const) {
    const node = doc.get(section, true);
    if (!YAML.isMap(node) || !node.has(key)) continue;
    node.delete(key);
    if (node.items.length === 0) doc.delete(section);
    removed = true;
    break;
  }
  if (!removed) return false;
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
