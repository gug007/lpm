// The commit message being written in each project, kept on this computer so
// closing the Commit dialog doesn't lose it.
const KEY = "lpm:commit-drafts:v1";
const KEEP_MS = 14 * 24 * 60 * 60 * 1000;

export interface CommitDraft {
  message: string;
  savedAt: number;
}

type Saved = Record<string, CommitDraft>;

function isDraft(value: unknown): value is CommitDraft {
  const d = value as CommitDraft | null;
  return !!d && typeof d.message === "string" && typeof d.savedAt === "number";
}

function readSaved(now: number): Saved {
  try {
    const raw: unknown = JSON.parse(window.localStorage.getItem(KEY) ?? "{}");
    if (!raw || typeof raw !== "object") return {};
    return Object.fromEntries(
      Object.entries(raw).filter(([, d]) => isDraft(d) && d.message.trim() && now - d.savedAt < KEEP_MS),
    );
  } catch {
    return {};
  }
}

function write(saved: Saved): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(saved));
  } catch {
    /* a convenience only */
  }
}

export function commitDraft(projectPath: string, now = Date.now()): CommitDraft | null {
  return readSaved(now)[projectPath] ?? null;
}

export function saveCommitDraft(projectPath: string, message: string, now = Date.now()): void {
  const saved = readSaved(now);
  if (message.trim()) saved[projectPath] = { message, savedAt: now };
  else delete saved[projectPath];
  write(saved);
}

export function clearCommitDraft(projectPath: string): void {
  saveCommitDraft(projectPath, "");
}
