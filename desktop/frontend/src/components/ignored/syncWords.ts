import { formatBytes } from "../../syncApi";
import type { Direction, SyncDone, SyncProgress } from "./ignoredSyncApi";

/// "A", "A and B", "A, B and C".
export function listNames(names: string[]): string {
  if (names.length < 2) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

export function countOf(n: number, word: string): string {
  return `${n.toLocaleString()} ${word}${n === 1 ? "" : "s"}`;
}

export function doneTitle(direction: Direction, done: SyncDone, from: string, to: string): string {
  const files = countOf(done.files ?? 0, "file");
  return direction === "push" ? `Sent ${files} to ${to}` : `Copied ${files} from ${from}`;
}

export function replacedNote(n: number): string {
  return n ? `${n} replaced, the old ${n === 1 ? "version is" : "versions are"} kept` : "";
}

export function progressLine(p: SyncProgress): string {
  const files = p.totalFiles
    ? `${(p.files ?? 0).toLocaleString()} of ${countOf(p.totalFiles, "file")}`
    : countOf(p.files ?? 0, "file");
  return `${files} · ${formatBytes(p.sent ?? 0)} of ${formatBytes(p.total ?? 0)}`;
}

export function putBack(n: number, where: string): string {
  return `Put back ${countOf(n, "file")} on ${where}`;
}
