import { useLayoutEffect, useRef } from "react";
import { PreviewStatus } from "./PreviewStatus";
import type { PdfPreview } from "./pdfPreview";

interface PdfFileViewProps {
  pdf: PdfPreview;
}

export function PdfFileView({ pdf }: PdfFileViewProps) {
  const boxRef = useRef<HTMLDivElement>(null);
  const level = pdf.zoom.zoom;

  // Zoom keeps the middle of the page in view, as Preview does.
  useLayoutEffect(() => {
    const box = boxRef.current;
    if (box) box.scrollLeft = (box.scrollWidth - box.clientWidth) / 2;
  }, [level]);

  if (pdf.error || !pdf.src) {
    return (
      <div className="flex h-full w-full p-6">
        <PreviewStatus error={pdf.error} />
      </div>
    );
  }
  // The viewer fits each page to its own width, so zoom is drawn by widening
  // it: the pages re-render sharp at the new size and the box scrolls sideways.
  // <embed>, not <iframe>: the viewer stays part of this document, so keys it
  // doesn't use (Escape, ⌘W, the zoom keys) still reach the modal after a click
  // into the page.
  return (
    <div ref={boxRef} className="h-full w-full overflow-x-auto overflow-y-hidden">
      <embed
        key={pdf.src}
        src={pdf.src}
        type="application/pdf"
        style={{ width: `${level * 100}%` }}
        className="mx-auto block h-full"
      />
    </div>
  );
}
