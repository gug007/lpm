import { composerDragActive } from "./hooks/useComposerDragMove";

// Follows files dragged in from the file manager: `onOver` with the pointer
// while they are over the window, `onEnd` once they leave or land. Over events
// count only after an Enter, so a stale one fired after a drop is ignored, and
// text dragged out of a composer is no file drag.
export function watchFileDrag(onOver: (x: number, y: number) => void, onEnd: () => void): () => void {
  let active = false;
  const enter = () => {
    active = true;
  };
  const over = (e: Event) => {
    if (!active || composerDragActive()) return;
    const [x, y] = (e as CustomEvent<[number, number]>).detail ?? [];
    if (typeof x === "number" && typeof y === "number") onOver(x, y);
  };
  const end = () => {
    active = false;
    onEnd();
  };
  const listeners: [string, (e: Event) => void][] = [
    ["app:handleDragEnter", enter],
    ["app:handleDragOver", over],
    ["app:handleDragLeave", end],
    ["app:filesDropped", end],
  ];
  for (const [type, fn] of listeners) window.addEventListener(type, fn);
  return () => {
    for (const [type, fn] of listeners) window.removeEventListener(type, fn);
  };
}
