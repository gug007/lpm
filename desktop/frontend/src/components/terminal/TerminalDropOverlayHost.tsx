import { useEffect, useState } from "react";
import { TerminalDropOverlay } from "./TerminalDropOverlay";

interface DropTarget {
  rect: DOMRect;
}

// v3's native drag interception swallows DOM dragover on macOS. The runtime.js
// shim re-publishes v3's drag callbacks as `app:handleDragEnter/Over/Leave`
// CustomEvents and a `app:filesDropped` event on drop. File count is not
// exposed during the drag, so the overlay shows a generic label.
function terminalAt(x: number, y: number): HTMLElement | null {
  return (
    document
      .elementFromPoint(x, y)
      ?.closest<HTMLElement>("[data-terminal-id]") ?? null
  );
}

export function TerminalDropOverlayHost() {
  const [target, setTarget] = useState<DropTarget | null>(null);

  useEffect(() => {
    // Gate Over events on an explicit Enter so a stale post-drop Over
    // (which v3 sometimes fires after HandlePlatformFileDrop) can't
    // re-show the overlay.
    let dragActive = false;
    let lastId: string | null = null;
    const clear = () => {
      dragActive = false;
      lastId = null;
      setTarget(null);
    };

    const onEnter = () => {
      dragActive = true;
    };
    const onOver = (e: Event) => {
      if (!dragActive) return;
      const [x, y] = (e as CustomEvent<[number, number]>).detail ?? [];
      if (typeof x !== "number" || typeof y !== "number") return;
      const el = terminalAt(x, y);
      const id = el?.dataset.terminalId ?? null;
      if (id === lastId) return;
      lastId = id;
      setTarget(el ? { rect: el.getBoundingClientRect() } : null);
    };

    window.addEventListener("app:handleDragEnter", onEnter);
    window.addEventListener("app:handleDragOver", onOver);
    window.addEventListener("app:handleDragLeave", clear);
    window.addEventListener("app:filesDropped", clear);

    return () => {
      window.removeEventListener("app:handleDragEnter", onEnter);
      window.removeEventListener("app:handleDragOver", onOver);
      window.removeEventListener("app:handleDragLeave", clear);
      window.removeEventListener("app:filesDropped", clear);
    };
  }, []);

  if (!target) return null;
  return (
    <div
      className="pointer-events-none fixed z-40"
      style={{
        left: target.rect.x,
        top: target.rect.y,
        width: target.rect.width,
        height: target.rect.height,
      }}
    >
      <TerminalDropOverlay fileCount={1} />
    </div>
  );
}
