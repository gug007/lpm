import { useCallback, useEffect, useRef, useState } from "react";
import { ActionPopup } from "../../bridge/commands";
import type { PopupContent } from "./popupTypes";

function sameResult(a: PopupContent, b: PopupContent): boolean {
  return a.updatedAt === b.updatedAt && a.refreshError === b.refreshError;
}

export interface ActionPopupState {
  content: PopupContent | null;
  loading: boolean;
  // Why the popup couldn't be asked for at all (the project or its Mac gone).
  failure: string | null;
  refresh: () => void;
}

// An action's popup while its card is open: what it showed last comes back at
// once, and one older than the config's `cache` is made again behind it; again
// on the config's interval, and on demand. A slow answer that lands after the
// card closed, or after a newer one, is dropped.
export function useActionPopup(project: string, action: string, open: boolean): ActionPopupState {
  const [content, setContent] = useState<PopupContent | null>(null);
  const [loading, setLoading] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const latest = useRef(0);
  const loadingRef = useRef(loading);
  loadingRef.current = loading;

  const load = useCallback(
    (fresh: boolean) => {
      const id = ++latest.current;
      setLoading(true);
      ActionPopup(project, action, fresh).then(
        (next: PopupContent | null) => {
          if (id !== latest.current) return;
          if (!next) {
            setLoading(false);
            setFailure("No popup came back.");
            return;
          }
          // The same result again (a tick within `cache`) leaves the page as it is.
          setContent((shown) => (shown && sameResult(shown, next) ? shown : next));
          setFailure(null);
          if (!fresh && next.stale) load(true);
          else setLoading(false);
        },
        (err: unknown) => {
          if (id !== latest.current) return;
          setLoading(false);
          setFailure(String(err));
        },
      );
    },
    [project, action],
  );

  useEffect(() => {
    if (!open) {
      latest.current++;
      setLoading(false);
      return;
    }
    load(false);
  }, [open, load]);

  const every = content?.refresh ?? 0;
  useEffect(() => {
    if (!open || every <= 0) return;
    const timer = window.setInterval(() => {
      if (!loadingRef.current && !document.hidden) load(false);
    }, every * 1000);
    return () => window.clearInterval(timer);
  }, [open, every, load]);

  const refresh = useCallback(() => load(true), [load]);
  return { content, loading, failure, refresh };
}
