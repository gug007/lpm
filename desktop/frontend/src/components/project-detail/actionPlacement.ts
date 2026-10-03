import YAML from "yaml";
import type { ActionPatch } from "../../actionConfig";
import { isFooterDisplay } from "../../types";

// What the placement picker shows: header, footer, or one of the project's
// zones. Legacy values and missing zones read as header.
export function placementOf(display: string, zoneNames: readonly string[]): string {
  if (isFooterDisplay(display)) return "footer";
  if (zoneNames.includes(display)) return display;
  return "header";
}

// The display change a save writes. An untouched placement writes nothing, so
// editing a command never moves the button or copies its spot into the file
// that declares it. A touched one is always written out, the header too, as
// dragging does: a `display` in a lower file can't show through.
export function placementPatch(display: string, touched: boolean): { set?: string } {
  return touched ? { set: display } : {};
}

// The form's patch without placement, for when placement went into a note.
export function withoutPlacement(patch: ActionPatch): ActionPatch {
  const set = { ...patch.set };
  delete set.display;
  return { set, remove: patch.remove.filter((key) => key !== "display") };
}

// The YAML editor and the AI helper see only the declaring file, never a
// placement note in the project file, so placement counts as edited only when
// the returned YAML changed the display it was shown.
export function placementFromYaml(
  prev: { display: string; displayTouched: boolean },
  shownDisplay: unknown,
  nextDisplay: unknown,
  zoneNames: readonly string[],
): { display: string; displayTouched: boolean } {
  if (nextDisplay === shownDisplay) return { display: prev.display, displayTouched: prev.displayTouched };
  return { display: placementOf(typeof nextDisplay === "string" ? nextDisplay : "", zoneNames), displayTouched: true };
}

// When a note took the placement, the declaring file keeps its own display.
export function withDeclaredDisplay(
  payload: Record<string, unknown>,
  declared: Record<string, unknown>,
): Record<string, unknown> {
  const next = { ...payload };
  if ("display" in declared) next.display = declared.display;
  else delete next.display;
  return next;
}

export function yamlDisplay(yaml: string): unknown {
  const parsed: unknown = yaml.trim() ? YAML.parse(yaml) : null;
  return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>).display : undefined;
}
