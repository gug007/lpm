import { useLayoutEffect, useState } from "react";
import { useSonner } from "sonner";
import { TOAST_EDGE, toastFloor } from "../toasterOffset";

/** Where the main toaster sits, measured while a toast shows: the composer
 *  under it can come and go with the selected tab, or open under a toast that
 *  is already up (running an action opens its terminal). */
export function useToastOffset(dockInset: number) {
  const { toasts } = useSonner();
  const showing = toasts.some((t) => !t.toasterId);
  const right = dockInset + TOAST_EDGE;
  const [bottom, setBottom] = useState(TOAST_EDGE);

  useLayoutEffect(() => {
    if (!showing) return;
    const measure = () => setBottom(toastFloor(right));
    measure();
    let frame = 0;
    const remeasure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    const observer = new MutationObserver(remeasure);
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("resize", remeasure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", remeasure);
      cancelAnimationFrame(frame);
    };
  }, [showing, right]);

  return { right, bottom };
}
