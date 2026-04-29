import YAML from "yaml";
import { ReadConfig, SaveConfig } from "../wailsjs/go/main/App";

// Serialize read-modify-write per project so concurrent callers can't
// interleave reads and clobber each other.
const queues = new Map<string, Promise<unknown>>();

export function queueWrite<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = queues.get(key) ?? Promise.resolve();
  const next = prev.catch(() => undefined).then(fn);
  queues.set(key, next);
  return next;
}

// editProjectDoc parses the project YAML, runs `mutate` on the parsed
// document, and writes the result back. The whole cycle runs inside the
// per-project queue so concurrent edits are serialized.
export function editProjectDoc(
  projectName: string,
  mutate: (doc: ReturnType<typeof YAML.parseDocument>) => void,
) {
  return queueWrite(projectName, async () => {
    const content = await ReadConfig(projectName);
    const doc = YAML.parseDocument(content || "{}");
    mutate(doc);
    await SaveConfig(projectName, String(doc));
  });
}
