import { useEffect, useRef } from "react";
import { useOverlay } from "../store/overlay";

export function useOutsideClick<T extends HTMLElement = HTMLElement>(
  handler: (event: MouseEvent) => void,
  enabled: boolean = true,
) {
  const ref = useRef<T>(null);
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  // An open dropdown/popover parks the in-pane browser webview so it can't
  // cover it (the webview floats above the React DOM).
  useOverlay(enabled);

  useEffect(() => {
    if (!enabled) return;
    const onMouseDown = (event: MouseEvent) => {
      const el = ref.current;
      if (!el || el.contains(event.target as Node)) return;
      // A popover may host a portaled modal (rendered to document.body, outside
      // this boundary). Its overlay/backdrop is part of the layer stack, not the
      // page behind the popover, so dismissing the modal must not close its host.
      if ((event.target as Element)?.closest?.("[data-modal-overlay]")) return;
      handlerRef.current(event);
    };
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [enabled]);

  return ref;
}
