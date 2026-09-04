"use client";

import { useEffect, useRef } from "react";

/** What a dialog owes the keyboard: it takes focus when it opens, hands it back
 *  to whatever opened it on close, and Escape dismisses it — the same contract
 *  the app's own modals keep. */
export function useDialogFocus<T extends HTMLElement>(onClose: () => void) {
  const focusRef = useRef<T | null>(null);
  const returnFocusRef = useRef<Element | null>(null);

  useEffect(() => {
    returnFocusRef.current = document.activeElement;
    focusRef.current?.focus({ preventScroll: true });
    return () => {
      const trigger = returnFocusRef.current;
      if (trigger instanceof HTMLElement && trigger.isConnected) trigger.focus();
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return focusRef;
}
