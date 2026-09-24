"use client";

import { useEffect, useRef, type RefObject } from "react";
import { typingSchedule } from "./natural";

// The tour types into a field the way a visitor would — a character at a time,
// then the send — rather than filling it: the visitor is watching the field,
// and text that simply appears reads as a script.
export function useTypedInput(
  inputRef: RefObject<HTMLInputElement | null>,
  setInput: (value: string) => void,
) {
  const typingRef = useRef<number | null>(null);

  const cancelTyping = () => {
    if (typingRef.current === null) return;
    window.clearTimeout(typingRef.current);
    typingRef.current = null;
  };

  useEffect(
    () => () => {
      if (typingRef.current !== null) window.clearTimeout(typingRef.current);
    },
    [],
  );

  // Types the text in, then hands it to `submit`. `instant` skips the typing,
  // for the tour landing its remaining steps as the visitor leaves.
  const typeThen = (
    text: string,
    submit: () => void,
    opts?: { instant?: boolean },
  ) => {
    cancelTyping();
    const send = () => {
      typingRef.current = null;
      setInput("");
      submit();
    };
    if (opts?.instant) return send();
    // Focus follows only a visitor already working in the frame: taking it
    // from the page would send their next scroll key into the demo. And never
    // with a scroll, which would shove the page under them.
    const field = inputRef.current;
    const active = document.activeElement;
    if (field && active && field.closest(".replica-ui")?.contains(active))
      field.focus({ preventScroll: true });
    const { delays, sendMs } = typingSchedule(text);
    let typed = 0;
    const tick = () => {
      typed += 1;
      setInput(text.slice(0, typed));
      typingRef.current = window.setTimeout(
        typed < text.length ? tick : send,
        typed < text.length ? delays[typed] : sendMs,
      );
    };
    typingRef.current = window.setTimeout(tick, delays[0]);
  };

  return {
    typeThen,
    cancelTyping,
    isTyping: () => typingRef.current !== null,
  };
}
