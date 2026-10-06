import { isMac } from "./platform";

export type KeyEventLike = Pick<
  KeyboardEvent,
  "key" | "code" | "ctrlKey" | "metaKey" | "shiftKey" | "altKey"
> & { getModifierState?: (key: string) => boolean };

const ASCII_LETTER = /^[a-z]$/i;
const PRINTABLE_ASCII = /^[\x20-\x7e]$/;

export function isAsciiLetter(key: string): boolean {
  return ASCII_LETTER.test(key);
}

// The letter a chord names: the reported key on Latin layouts, the physical key
// on layouts that report their own letters (Cyrillic, Greek…).
export function chordLetter(e: Pick<KeyboardEvent, "key" | "code">): string | null {
  if (isAsciiLetter(e.key)) return e.key.toLowerCase();
  if (e.key.length === 1 && !PRINTABLE_ASCII.test(e.key) && /^Key[A-Z]$/.test(e.code ?? "")) {
    return e.code.slice(3).toLowerCase();
  }
  return null;
}

// Windows layouts type characters with AltGr, which arrives as Ctrl+Alt: "@",
// "€", "ą"… must reach the field or terminal, never fire a Ctrl+Alt chord. A
// plain Latin letter is still a chord: on an AltGr layout Windows flags every
// Ctrl+Alt press as AltGraph, so the flag alone can't tell them apart.
export function isAltGraphChar(e: KeyEventLike): boolean {
  if (!e.ctrlKey || !e.altKey || e.metaKey || e.key.length !== 1) return false;
  if (isAsciiLetter(e.key)) return false;
  if (e.getModifierState?.("AltGraph")) return true;
  return !PRINTABLE_ASCII.test(e.key);
}

// ⌘ on macOS, Ctrl elsewhere. Only for digits, punctuation and named keys —
// a letter chord moves to Ctrl+Shift off macOS (see keys.ts toPhysical).
export function hasPrimaryMod(
  e: Pick<KeyboardEvent, "ctrlKey" | "metaKey">,
  mac: boolean = isMac,
): boolean {
  return mac ? e.metaKey && !e.ctrlKey : e.ctrlKey && !e.metaKey;
}
