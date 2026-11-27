import type { ChipSpec } from "../components/composerChips";

// Per terminal, the texts its composer inserted as chips (pastes, quotes, files,
// branches, captured logs with where they came from), keyed by the exact text.
// It outlives the composer, which is remounted per terminal, so a draft rebuilt
// after a switch, a recall or an undo shows the same chips again. In memory
// only: after a restart such a text is recognized by its shape or stays text.

// Each key is a whole paste or capture, so the oldest go by size as well as by
// count; the newest always stays.
const LIMIT = 200;
const MAX_CHARS = 2_000_000;

interface Remembered {
  texts: Map<string, ChipSpec>;
  chars: number;
}

const byTerminal = new Map<string, Remembered>();

export function rememberChip(terminalId: string, text: string, spec: ChipSpec): void {
  if (!text) return;
  let kept = byTerminal.get(terminalId);
  if (!kept) {
    kept = { texts: new Map(), chars: 0 };
    byTerminal.set(terminalId, kept);
  }
  const { texts } = kept;
  if (texts.delete(text)) kept.chars -= text.length;
  texts.set(text, spec);
  kept.chars += text.length;
  while (texts.size > 1 && (texts.size > LIMIT || kept.chars > MAX_CHARS)) {
    const oldest: string = texts.keys().next().value!;
    texts.delete(oldest);
    kept.chars -= oldest.length;
  }
}

export function forgetChips(terminalId: string): void {
  byTerminal.delete(terminalId);
}

export function rememberedChips(terminalId: string): Map<string, ChipSpec> {
  return byTerminal.get(terminalId)?.texts ?? new Map();
}
