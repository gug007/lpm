import type { ScheduledPrompt } from "../store/sendLater";

export interface MarkCounts {
  scheduled: number;
  waiting: number;
  missed: number;
}

// How many waiting prompts match, by state, packed into a string so a store
// selector returns the same value until one of the counts changes.
export function markKey(items: ScheduledPrompt[], match: (item: ScheduledPrompt) => boolean): string {
  let scheduled = 0;
  let waiting = 0;
  let missed = 0;
  for (const item of items) {
    if (!match(item)) continue;
    if (item.state === "due") waiting++;
    else if (item.state === "missed") missed++;
    else scheduled++;
  }
  return scheduled + waiting + missed === 0 ? "" : `${scheduled}:${waiting}:${missed}`;
}

export function parseMarkKey(key: string): MarkCounts | null {
  if (!key) return null;
  const [scheduled, waiting, missed] = key.split(":").map(Number);
  return { scheduled, waiting, missed };
}
