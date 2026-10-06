import { describe, expect, it } from "vitest";
import { hotkeyDefs } from "./hotkeys";
import { toPhysical } from "./keys";
import {
  isSystemShortcut,
  parseShortcut,
  physicalChordId,
  reservedShortcuts,
} from "./shortcutParse";

// The composer's own tab chords (TerminalComposer ⌘⇧T / ⌘⇧W) aren't reserved
// for actions, but they are built-in keys all the same.
const COMPOSER_CHORDS = ["cmd+shift+t", "cmd+shift+w"];

function builtInChords(mac: boolean): string[] {
  const all = [
    ...reservedShortcuts(mac),
    ...COMPOSER_CHORDS,
    ...hotkeyDefs(mac).map((def) => def.default),
  ];
  return [...new Set(all)];
}

const LETTER = /^[a-z]$/;

// Stored combos are canonical strings, where "cmd++" names the + key.
function parseCanonical(raw: string) {
  if (!raw.endsWith("++")) return parseShortcut(raw);
  const parsed = parseShortcut(`${raw.slice(0, -1)}x`);
  return parsed && { ...parsed, key: "+" };
}

describe("built-in chords on Linux and Windows", () => {
  const chords = builtInChords(false).map((raw) => {
    const parsed = parseCanonical(raw);
    if (!parsed) throw new Error(`unparseable built-in chord ${raw}`);
    return { raw, parsed, physical: toPhysical(parsed, false) };
  });

  it("map to distinct physical chords", () => {
    const seen = new Map<string, string>();
    for (const { raw, physical } of chords) {
      const id = physicalChordId(physical);
      expect(seen.get(id), `${raw} collides with ${seen.get(id)} on ${id}`).toBeUndefined();
      seen.set(id, raw);
    }
  });

  it("never take plain Ctrl+letter or Alt+letter from the terminal", () => {
    for (const { raw, physical: p } of chords) {
      if (!LETTER.test(p.key)) continue;
      const plainCtrl = p.ctrl && !p.shift && !p.alt;
      const plainAlt = p.alt && !p.ctrl;
      expect(plainCtrl || plainAlt, `${raw} → ${physicalChordId(p)}`).toBe(false);
    }
  });

  it("never use Super/Win or a chord the desktop takes first", () => {
    for (const { raw, parsed, physical } of chords) {
      expect(physical.meta, raw).toBe(false);
      expect(isSystemShortcut(parsed, false), raw).toBe(false);
    }
  });
});

describe("built-in chords on macOS", () => {
  it("keep the reserved set exactly as before", () => {
    const before = [
      "cmd+b", "cmd+t", "cmd+w", "cmd+d", "cmd+shift+d", "cmd+f", "cmd+i",
      "cmd+shift+r", "cmd+shift+m", "cmd+shift+k", "cmd+shift+e", "cmd+p",
      "cmd+=", "cmd++", "cmd+-", "cmd+0", "cmd+shift+v", "cmd+alt+r",
      "cmd+alt+c", "cmd+alt+shift+c", "cmd+alt+arrowup", "cmd+alt+arrowdown",
      "cmd+e", "cmd+shift+n", "cmd+s", "cmd+shift+l", "cmd+shift+s",
      "cmd+shift+p", "cmd+,", "cmd+c", "cmd+v", "cmd+x", "cmd+a", "cmd+z",
      "cmd+shift+z", "cmd+q", "cmd+m", "cmd+h", "cmd+n", "cmd+o",
      "cmd+enter", "alt+enter",
      ...Array.from({ length: 9 }, (_, i) => `cmd+${i + 1}`),
    ];
    expect(new Set(reservedShortcuts(true))).toEqual(new Set(before));
  });

  it("keep every chord on ⌘ as authored", () => {
    for (const raw of builtInChords(true)) {
      const parsed = parseCanonical(raw)!;
      const p = toPhysical(parsed, true);
      expect(p, raw).toEqual({
        key: parsed.key,
        ctrl: false,
        meta: !!parsed.meta,
        shift: !!parsed.shift,
        alt: !!parsed.alt,
      });
      expect(isSystemShortcut(parsed, true)).toBe(false);
    }
  });

  it("keep the macOS hotkey defaults", () => {
    expect(Object.fromEntries(hotkeyDefs(true).map((d) => [d.id, d.default]))).toEqual({
      toggleAgentOverview: "cmd+shift+a",
      tabSwitchNext: "cmd+alt+arrowright",
      tabSwitchPrev: "cmd+alt+arrowleft",
      renameProject: "cmd+r",
      deleteProject: "cmd+shift+backspace",
    });
  });
});
