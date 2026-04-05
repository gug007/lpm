import { useEffect, useRef } from "react";

/**
 * Fires `handler` when a mousedown occurs outside the returned ref's element.
 *
 * Pass `enabled: false` to pause the listener without unmounting the caller —
 * useful for popovers/menus that only need the listener while open.
 *
 * The handler is stored in a ref, so callers don't need to memoize it.
 */
export function useOutsideClick<T extends HTMLElement = HTMLElement>(
  handler: (event: MouseEvent) => void,
  enabled: boolean = true,
) {
  const ref = useRef<T>(null);
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    if (!enabled) return;
    const onMouseDown = (event: MouseEvent) => {
      const el = ref.current;
      if (el && !el.contains(event.target as Node)) {
        handlerRef.current(event);
      }
    };
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [enabled]);

  return ref;
}
