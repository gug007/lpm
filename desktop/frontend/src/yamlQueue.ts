import YAML from "yaml";
import {
  ReadConfig,
  ReadGlobalConfig,
  ReadRepoConfig,
  SaveConfig,
  SaveGlobalConfig,
  SaveRepoConfig,
} from "../wailsjs/go/main/App";

const queues = new Map<string, Promise<unknown>>();
const GLOBAL_QUEUE_KEY = "__global__";

export function queueWrite<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = queues.get(key) ?? Promise.resolve();
  const next = prev.catch(() => undefined).then(fn);
  queues.set(key, next);
  return next;
}

export interface ConfigLayer {
  read: () => Promise<string>;
  save: (content: string) => Promise<unknown>;
  queueKey: string;
}

export function projectLayer(projectName: string): ConfigLayer {
  return {
    read: () => ReadConfig(projectName),
    save: (content) => SaveConfig(projectName, content),
    queueKey: projectName,
  };
}

// Repo layer (`<root>/.lpm.yml`) is unavailable for SSH/rootless projects —
// the backend errors instead of returning empty. Treat that as "not in this
// layer" so callers can fall through to the next layer cleanly.
export function repoLayer(projectName: string): ConfigLayer {
  return {
    read: async () => {
      try {
        return await ReadRepoConfig(projectName);
      } catch {
        return "";
      }
    },
    save: (content) => SaveRepoConfig(projectName, content),
    queueKey: projectName,
  };
}

export const globalLayer: ConfigLayer = {
  read: ReadGlobalConfig,
  save: SaveGlobalConfig,
  queueKey: GLOBAL_QUEUE_KEY,
};

type Doc = ReturnType<typeof YAML.parseDocument>;

function editLayer(layer: ConfigLayer, mutate: (doc: Doc) => void) {
  return queueWrite(layer.queueKey, async () => {
    const content = await layer.read();
    const doc = YAML.parseDocument(content || "{}");
    mutate(doc);
    await layer.save(String(doc));
  });
}

export function editProjectDoc(projectName: string, mutate: (doc: Doc) => void) {
  return editLayer(projectLayer(projectName), mutate);
}

// Reads-mutates-writes each layer in order, saving only when `attempt`
// reports a change. When `stopOnFirst`, exits as soon as one layer is saved.
async function walkLayers(
  layers: readonly ConfigLayer[],
  attempt: (doc: Doc) => boolean,
  stopOnFirst: boolean,
): Promise<boolean> {
  let any = false;
  for (const layer of layers) {
    const changed = await queueWrite(layer.queueKey, async () => {
      const content = await layer.read();
      const doc = YAML.parseDocument(content || "{}");
      if (!attempt(doc)) return false;
      await layer.save(String(doc));
      return true;
    });
    if (changed) {
      any = true;
      if (stopOnFirst) return true;
    }
  }
  return any;
}

// Walks layers in merge order; the first one whose `attempt` returns true is
// saved and the walk stops. Used for "edit the entry where it actually lives"
// flows so a repo or global definition gets updated in place.
export function editFirstLayer(
  layers: readonly ConfigLayer[],
  attempt: (doc: Doc) => boolean,
): Promise<boolean> {
  return walkLayers(layers, attempt, true);
}

// Visits every layer; layers that report no change aren't saved. Used when
// the same logical update may need to apply across layers (e.g. stripping
// stale references that can live anywhere).
export async function editAllLayers(
  layers: readonly ConfigLayer[],
  attempt: (doc: Doc) => boolean,
): Promise<void> {
  await walkLayers(layers, attempt, false);
}
