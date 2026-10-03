import { useLayoutEffect, useRef, useState } from "react";
import type { PdfPage } from "./pdfEngine";
import { PdfPageView } from "./PdfPageView";
import { fitScale } from "./pdfScale";

// Matches the p-6 around the pages.
const PAD_PX = 24;

interface PdfPagesProps {
  pages: PdfPage[];
  zoom: number;
}

export function PdfPages({ pages, zoom }: PdfPagesProps) {
  const [box, setBox] = useState<HTMLDivElement | null>(null);
  const [available, setAvailable] = useState(0);
  // Where the middle of the view sits, as a fraction of everything scrollable.
  const middle = useRef(0);

  useLayoutEffect(() => {
    if (!box) return;
    const measure = () => setAvailable(box.clientWidth - 2 * PAD_PX);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(box);
    return () => ro.disconnect();
  }, [box]);

  // A zoom or a resize keeps the same spot of the document in the middle of
  // the view, and the pages centred across it, as Preview does.
  useLayoutEffect(() => {
    if (!box) return;
    box.scrollTop = middle.current * box.scrollHeight - box.clientHeight / 2;
    box.scrollLeft = (box.scrollWidth - box.clientWidth) / 2;
  }, [box, zoom, available]);

  const onScroll = () => {
    if (box && box.scrollHeight > 0) {
      middle.current = (box.scrollTop + box.clientHeight / 2) / box.scrollHeight;
    }
  };

  // The vertical scrollbar stays: one that came and went would change the width
  // the pages fit to, so their height, so whether it is needed.
  return (
    <div ref={setBox} onScroll={onScroll} className="h-full w-full overflow-x-auto overflow-y-scroll">
      <div className="flex w-max min-w-full flex-col items-center gap-4 p-6">
        {available > 0 &&
          pages.map((page, i) => (
            <PdfPageView key={i} page={page} scale={fitScale(page.width, available) * zoom} root={box} />
          ))}
      </div>
    </div>
  );
}
