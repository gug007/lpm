import type { KeyboardEvent as ReactKeyboardEvent } from "react";

// WebKit (the macOS webview) fires compositionend *before* the keydown of the
// Enter that commits an IME candidate, so that keydown already reports
// isComposing === false and would be taken as a submit. keyCode 229 still marks
// it as a key the IME consumed.
export function isImeComposing(e: KeyboardEvent | ReactKeyboardEvent): boolean {
  const native = "nativeEvent" in e ? e.nativeEvent : e;
  return native.isComposing || native.keyCode === 229;
}
