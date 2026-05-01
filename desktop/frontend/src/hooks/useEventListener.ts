import { useEffect, useRef } from "react";

type EventTargetLike = Window | Document | HTMLElement | MediaQueryList;

// Handler is stored in a ref so callers don't need to memoize it — the
// listener only re-attaches when eventName, target, or enabled changes.
export function useEventListener<K extends keyof WindowEventMap>(
  eventName: K,
  handler: (event: WindowEventMap[K]) => void,
  target?: Window,
  enabled?: boolean,
  capture?: boolean,
): void;
export function useEventListener<K extends keyof DocumentEventMap>(
  eventName: K,
  handler: (event: DocumentEventMap[K]) => void,
  target: Document,
  enabled?: boolean,
  capture?: boolean,
): void;
export function useEventListener<K extends keyof HTMLElementEventMap>(
  eventName: K,
  handler: (event: HTMLElementEventMap[K]) => void,
  target: HTMLElement,
  enabled?: boolean,
  capture?: boolean,
): void;
export function useEventListener<K extends keyof MediaQueryListEventMap>(
  eventName: K,
  handler: (event: MediaQueryListEventMap[K]) => void,
  target: MediaQueryList,
  enabled?: boolean,
  capture?: boolean,
): void;
export function useEventListener(
  eventName: string,
  handler: (event: Event) => void,
  target: EventTargetLike = window,
  enabled: boolean = true,
  capture: boolean = false,
): void {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    if (!enabled || !target) return;
    const listener = (event: Event) => handlerRef.current(event);
    target.addEventListener(eventName, listener, capture);
    return () => target.removeEventListener(eventName, listener, capture);
  }, [eventName, target, enabled, capture]);
}
