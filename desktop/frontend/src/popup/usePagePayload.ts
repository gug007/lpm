import { useEffect, useMemo } from "react";
import { pushOf, type PopupPayload } from "./popupTypes";

// The payload a page loads with, taken once per page; each one after it goes to
// `push`, which is null until the page can take it.
export function usePagePayload(
  html: string,
  base: string | undefined,
  payload: PopupPayload,
  push: ((next: ReturnType<typeof pushOf>) => void) | null,
): PopupPayload {
  const first = useMemo(() => payload, [html, base]);
  useEffect(() => {
    if (push && payload !== first) push(pushOf(payload));
  }, [payload, first, push]);
  return first;
}
