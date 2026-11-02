// Tabs here that their host is moving to a new terminal of its own (a Claude
// account switch it runs), by the tab's current terminal id. A later listing
// brings the new terminal, which takes the tab's place.
const WAIT_MS = 10_000;
const waiting = new Map<string, (newId: string | null) => void>();

// Resolves with the terminal that took `oldId`'s place, or null when none did
// in time.
export function expectHostSwap(oldId: string): Promise<string | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => settleHostSwap(oldId, null), WAIT_MS);
    waiting.set(oldId, (newId) => {
      clearTimeout(timer);
      waiting.delete(oldId);
      resolve(newId);
    });
  });
}

// `newId` took the tab's place; null when it isn't coming.
export function settleHostSwap(oldId: string, newId: string | null): void {
  waiting.get(oldId)?.(newId);
}
