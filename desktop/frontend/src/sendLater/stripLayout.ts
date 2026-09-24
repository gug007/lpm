import type { ScheduledPrompt } from "../store/sendLater";
import { toX, type TimelineScale } from "./timeline";

export interface StripGroup {
  // Where the dot sits, 0 to 1. Waiting and missed prompts sit at now; one
  // later than the line reaches is pinned to its right end.
  x: number;
  pinned: boolean;
  items: ScheduledPrompt[];
  // Room in pixels from the dot to the next group's dot (or the line's end).
  room: number;
}

// Dots closer than this fold into one, whose card lists them all.
const MIN_DOT_GAP = 14;
// Room the pinned group's label needs to the left of the line's end.
const PIN_LABEL_ROOM = 110;

export function layoutStrip(items: ScheduledPrompt[], scale: TimelineScale, widthPx: number): StripGroup[] {
  const placed = items
    .map((item) => {
      const atNow = item.state !== "scheduled";
      const pinned = !atNow && item.dueAt > scale.end;
      return { item, x: atNow ? 0 : pinned ? 1 : toX(scale, item.dueAt), pinned };
    })
    .sort((a, b) => a.x - b.x || a.item.dueAt - b.item.dueAt);
  const groups: StripGroup[] = [];
  for (const p of placed) {
    const last = groups[groups.length - 1];
    if (last && (p.x - last.x) * widthPx < MIN_DOT_GAP) {
      last.items.push(p.item);
      // A dot this close to the line's end joins the pin there rather than
      // sitting on top of it.
      if (p.pinned) {
        last.pinned = true;
        last.x = 1;
      }
      continue;
    }
    groups.push({ x: p.x, pinned: p.pinned, items: [p.item], room: 0 });
  }
  // The pin's label reads leftward from the line's end; a dot inside that
  // stretch would sit under it, so it joins the pin instead.
  const pin = groups[groups.length - 1];
  while (pin?.pinned && groups.length > 1 && (1 - groups[groups.length - 2].x) * widthPx < PIN_LABEL_ROOM) {
    const [before] = groups.splice(groups.length - 2, 1);
    pin.items.unshift(...before.items);
  }
  groups.forEach((g, i) => {
    const next = groups[i + 1];
    // A pin's label reads leftward from the end, so the room before it stops
    // where that label starts.
    g.room = next?.pinned
      ? Math.max(0, (1 - g.x) * widthPx - PIN_LABEL_ROOM)
      : ((next ? next.x : 1) - g.x) * widthPx;
  });
  return groups;
}
