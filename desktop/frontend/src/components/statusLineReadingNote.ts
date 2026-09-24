import type { CustomSpec } from "./statusLineTypes";

export function statusLineReadingNote(spec: CustomSpec): string | null {
  const ids = new Set(spec.segments.map((segment) => segment.id));
  const limits = [ids.has("five") && "5-hour", ids.has("seven") && "weekly"]
    .filter(Boolean)
    .join(" and ");
  const parts: string[] = [];
  if (ids.has("ctx")) parts.push("Context shows how much is left");
  if (limits) {
    const verb = ids.has("five") && ids.has("seven") ? "show" : "shows";
    parts.push(
      `${limits} usage ${verb} how much of the limit is used, turning yellow at 50% and red at 80%`,
    );
  }
  if (ids.has("cost")) parts.push("cost is an estimate at list prices");
  if (parts.length === 0) return null;
  const note = parts.join(" · ");
  return `${note.charAt(0).toUpperCase()}${note.slice(1)}.`;
}
