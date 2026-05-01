import { useEffect, useState } from "react";
import { registerFileDropHandler } from "../../fileDrop";
import { TerminalDropOverlay } from "./TerminalDropOverlay";

interface DropTarget {
  rect: DOMRect;
  count: number;
}

function countDraggedFiles(dt: DataTransfer): number {
  let n = 0;
  for (const item of dt.items) {
    if (item.kind === "file") n++;
  }
  return n;
}

function findTerminalAt(x: number, y: number): HTMLElement | null {
  return (
    document
      .elementFromPoint(x, y)
      ?.closest<HTMLElement>("[data-terminal-id]") ?? null
  );
}

export function TerminalDropOverlayHost() {
  const [target, setTarget] = useState<DropTarget | null>(null);

  useEffect(() => {
    let lastId: string | null = null;
    const clear = () => {
      lastId = null;
      setTarget(null);
    };

    const onDragOver = (e: DragEvent) => {
      const dt = e.dataTransfer;
      if (!dt || !dt.types.includes("Files")) return;
      e.preventDefault();
      dt.dropEffect = "copy";
      const el = findTerminalAt(e.clientX, e.clientY);
      const id = el?.dataset.terminalId ?? null;
      // dragover fires ~60/s; only commit a re-render when the targeted
      // pane changes. Same id ⇒ same rect.
      if (id === lastId) return;
      lastId = id;
      setTarget(
        el ? { rect: el.getBoundingClientRect(), count: countDraggedFiles(dt) } : null,
      );
    };

    // relatedTarget === null means the cursor left the document entirely.
    const onDragLeave = (e: DragEvent) => {
      if (e.relatedTarget === null) clear();
    };

    document.addEventListener("dragenter", onDragOver);
    document.addEventListener("dragover", onDragOver);
    document.addEventListener("dragleave", onDragLeave);
    document.addEventListener("drop", clear);

    // Wails consumes the OS-level drop, so the document drop event above
    // often never fires. Hook the Wails registry as the authoritative
    // "drop landed" signal and pass it through (return false).
    const cleanupWails = registerFileDropHandler(
      "terminal-overlay-reset",
      () => {
        clear();
        return false;
      },
    );

    return () => {
      document.removeEventListener("dragenter", onDragOver);
      document.removeEventListener("dragover", onDragOver);
      document.removeEventListener("dragleave", onDragLeave);
      document.removeEventListener("drop", clear);
      cleanupWails();
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
      <TerminalDropOverlay fileCount={target.count} />
    </div>
  );
}
