import { chordLabel, keyName, type Chord } from "./keys";
import { isMac } from "./platform";

type Mods = Omit<Chord, "key">;

const macMods = (m: Mods) => (m.meta ? "⌘" : "") + (m.alt ? "⌥" : "") + (m.shift ? "⇧" : "");

// Return as the hints have always drawn it on macOS ("↵", where keys.ts draws
// "↩"), in words elsewhere: "⌘↵" / "Ctrl+Enter".
export function enterHint(mods: Mods = {}, glyph = "↵", mac: boolean = isMac): string {
  return mac ? macMods(mods) + glyph : chordLabel({ ...mods, key: "Enter" }, false);
}

// A ⌘ chord whose handler also takes plain Ctrl off macOS (a text field's
// own save, Monaco's CtrlCmd bindings): "⌘S" / "Ctrl+S".
export function primaryHint(key: string, mac: boolean = isMac): string {
  return mac ? `⌘${keyName(key, true)}` : `Ctrl+${keyName(key, false)}`;
}
