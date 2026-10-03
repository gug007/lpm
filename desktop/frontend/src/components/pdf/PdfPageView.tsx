import { useEffect, useRef, useState, type CSSProperties, type RefObject } from "react";
import type { PdfDrawing, PdfPage } from "./pdfEngine";
import { outputScale } from "./pdfScale";

// While a zoom gesture runs, the page already drawn is stretched to fit, and
// drawn again sharp once the zoom holds still this long.
const REDRAW_DELAY_MS = 150;

// A page is drawn while it is within a screen of being visible, and its pixels
// given back once it leaves that range; a long PDF would otherwise hold every
// page's canvas at once.
function useNearView(ref: RefObject<HTMLElement | null>, root: HTMLElement | null): boolean {
  const [near, setNear] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || !root) return;
    const io = new IntersectionObserver((entries) => setNear(entries[entries.length - 1].isIntersecting), {
      root,
      rootMargin: "100% 0px",
    });
    io.observe(el);
    return () => io.disconnect();
  }, [ref, root]);
  return near;
}

function dropCanvases(slot: HTMLElement) {
  for (const canvas of slot.querySelectorAll("canvas")) {
    canvas.width = 0;
    canvas.height = 0;
    canvas.remove();
  }
}

function release(slot: HTMLElement, page: PdfPage) {
  dropCanvases(slot);
  slot.replaceChildren();
  page.release();
}

const settled = (drawing: PdfDrawing) =>
  drawing.promise.then(
    () => true,
    () => false,
  );

interface PdfPageViewProps {
  page: PdfPage;
  scale: number;
  // The scrolling box the page sits in.
  root: HTMLElement | null;
}

// The drawing and its text layer are swapped in by hand, so React never owns
// the slot's children.
export function PdfPageView({ page, scale, root }: PdfPageViewProps) {
  const slotRef = useRef<HTMLDivElement>(null);
  const near = useNearView(slotRef, root);
  const drawn = useRef(false);
  const width = Math.floor(page.width * scale);
  const height = Math.floor(page.height * scale);

  // The new drawing replaces the stretched one as soon as it's ready; the old
  // text layer keeps lining up with it (it scales with --total-scale-factor)
  // until the new one is built.
  useEffect(() => {
    const slot = slotRef.current;
    if (!slot) return;
    if (!near) {
      if (drawn.current) release(slot, page);
      drawn.current = false;
      return;
    }
    let cancelled = false;
    let drawing: PdfDrawing | null = null;
    const timer = window.setTimeout(
      async () => {
        const canvas = document.createElement("canvas");
        canvas.className = "absolute inset-0 h-full w-full";
        drawing = page.draw(canvas, scale, outputScale(width, height, window.devicePixelRatio));
        if (!(await settled(drawing)) || cancelled) return;
        dropCanvases(slot);
        slot.prepend(canvas);
        drawn.current = true;
        const layer = document.createElement("div");
        layer.className = "textLayer";
        drawing = page.drawText(layer, scale);
        if (!(await settled(drawing)) || cancelled) return;
        slot.querySelector(".textLayer")?.remove();
        slot.append(layer);
      },
      drawn.current ? REDRAW_DELAY_MS : 0,
    );
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      drawing?.cancel();
    };
  }, [near, page, scale, width, height]);

  useEffect(() => {
    const slot = slotRef.current;
    return () => {
      if (slot) release(slot, page);
    };
  }, [page]);

  return (
    <div
      ref={slotRef}
      className="pdf-page relative shrink-0 bg-white shadow-[0_1px_4px_rgb(0_0_0/0.35)]"
      style={{ width, height, "--total-scale-factor": scale } as CSSProperties}
    />
  );
}
