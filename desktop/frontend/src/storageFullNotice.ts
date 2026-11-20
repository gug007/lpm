import { toast } from "./notifications/toast";
import { isStorageFull } from "./storageFull";

const TOAST_ID = "storage-full";
// Saves keep failing while the disk is full: closing the card must not bring
// it straight back.
const QUIET_MS = 10 * 60_000;

let quietUntil = 0;

// A save that nothing else answered for was refused for want of space. The
// file on disk is as it was, so what the person just changed isn't kept.
export function initStorageFullNotice(): void {
  window.addEventListener("unhandledrejection", (event) => {
    if (!isStorageFull(event.reason)) return;
    const now = Date.now();
    if (now < quietUntil) return;
    quietUntil = now + QUIET_MS;
    toast.error("Not enough disk space", {
      id: TOAST_ID,
      description: "lpm couldn't save a change. Free up some space and try again.",
    });
  });
}
