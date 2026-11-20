// How a full disk refuses a write: Unix, Windows, a quota, SQLite. It is the
// computer's state and no fault of the app's, so the person is told
// (storageFullNotice.ts) and it stays out of crash reports.
const STORAGE_FULL =
  /No space left on device|not enough space on the disk|Disk quota exceeded|database or disk is full/i;

export function isStorageFull(reason: unknown): boolean {
  const text = reason instanceof Error ? reason.message : typeof reason === "string" ? reason : "";
  return STORAGE_FULL.test(text);
}
