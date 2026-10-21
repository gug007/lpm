import type { Terminal } from "@xterm/xterm";

// macOS IMEs (WeChat, Apple Pinyin) commit Shift+punctuation as
// beforeinput/input *before* the keyCode-229 keydown. xterm's _inputEvent drops
// that input whenever a keydown was seen since the last keyup — and the Shift
// keydown counts — while the later 229 keydown snapshots the textarea after the
// insert, so its diff is empty and nothing reaches the PTY.
// Upstream: https://github.com/xtermjs/xterm.js/pull/6200
export function isModifierOnlyKey(e: KeyboardEvent): boolean {
  return (
    e.keyCode === 16 ||
    e.keyCode === 17 ||
    e.keyCode === 18 ||
    e.keyCode === 91 ||
    e.keyCode === 92 ||
    e.keyCode === 93 ||
    e.keyCode === 224 ||
    e.key === "Meta"
  );
}

export function installImeShiftFix(term: Terminal): () => void {
  const textarea = term.textarea;
  if (!textarea) return () => {};

  // Mirrors xterm's _keyDownSeen, which every keydown sets and every keyup clears.
  let keyDownSeen = false;
  let lastKeyDownModifierOnly = false;

  const onKeyDown = (e: KeyboardEvent) => {
    keyDownSeen = true;
    lastKeyDownModifierOnly = isModifierOnlyKey(e);
  };
  const onKeyUp = () => {
    keyDownSeen = false;
  };
  const onInput = (e: Event) => {
    const ev = e as InputEvent;
    if (ev.inputType !== "insertText" || !ev.data || ev.isComposing) return;
    // Uncomposed input bypasses the gate — xterm already forwards it.
    if (!ev.composed) return;
    if (term.options.screenReaderMode) return;
    if (!keyDownSeen || !lastKeyDownModifierOnly) return;
    term.input(ev.data, true);
  };

  textarea.addEventListener("keydown", onKeyDown, true);
  textarea.addEventListener("keyup", onKeyUp, true);
  textarea.addEventListener("input", onInput, true);
  return () => {
    textarea.removeEventListener("keydown", onKeyDown, true);
    textarea.removeEventListener("keyup", onKeyUp, true);
    textarea.removeEventListener("input", onInput, true);
  };
}
