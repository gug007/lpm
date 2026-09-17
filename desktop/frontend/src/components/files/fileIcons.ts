import { SETI_DEFAULT, SETI_DEFS, SETI_EXTENSIONS, SETI_NAMES } from "./setiIconData";

export interface FileIcon {
  glyph: string;
  // Colours per theme; empty means the surrounding text colour.
  dark: string;
  light: string;
}

function iconId(name: string): string {
  const lower = name.toLowerCase();
  const byName = SETI_NAMES[lower];
  if (byName) return byName;
  // The longest dotted suffix wins, so "a.test.js" finds "test.js" before "js".
  for (let dot = lower.indexOf("."); dot >= 0; dot = lower.indexOf(".", dot + 1)) {
    const byExtension = SETI_EXTENSIONS[lower.slice(dot + 1)];
    if (byExtension) return byExtension;
  }
  if (lower.startsWith(".env.")) return SETI_NAMES[".env"] ?? SETI_DEFAULT;
  return SETI_DEFAULT;
}

// The Seti icon VS Code and Cursor show beside this file name.
export function iconForFile(name: string): FileIcon {
  const [glyph, dark, light] = SETI_DEFS[iconId(name)] ?? SETI_DEFS[SETI_DEFAULT];
  return { glyph, dark, light };
}
