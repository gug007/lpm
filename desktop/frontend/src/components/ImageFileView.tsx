import { useEffect, useRef, useState } from "react";
import { fitScale, scaledSize, type Size } from "./imageFit";
import type { ImagePreview } from "./imagePreview";

const PAD_PX = 24;

// max-w-none: the base stylesheet caps every image at the container width,
// which would clamp a zoomed-in image's width while its height keeps growing —
// stretching it off its aspect ratio and leaving nothing to pan horizontally.
const IMG_CLASS =
  "image-alpha-grid m-auto block max-w-none shrink-0 select-none rounded-md ring-1 ring-[var(--border)]";

interface ImageFileViewProps {
  preview: ImagePreview;
}

export function ImageFileView({ preview }: ImageFileViewProps) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<Size | null>(null);

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    // Border box, not contentRect: a scrollbar appearing under a zoomed-in image
    // would otherwise shrink the measured box and re-drive the fit.
    const measure = () => {
      const r = el.getBoundingClientRect();
      setBox({
        w: Math.max(0, r.width - PAD_PX * 2),
        h: Math.max(0, r.height - PAD_PX * 2),
      });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const { setFit, natural, scale } = preview;
  useEffect(() => {
    setFit(fitScale(natural, box));
  }, [setFit, natural, box]);

  const sized = natural ? scaledSize(natural, scale) : null;
  const imgStyle = sized
    ? { width: `${sized.w}px`, height: `${sized.h}px` }
    : { width: `${Math.round(scale * 100)}%`, height: "auto" as const };

  return (
    <div ref={boxRef} className="flex h-full w-full overflow-auto p-6">
      {preview.error ? (
        <div className="m-auto max-w-md px-4 text-center">
          <div className="text-[13px] text-[var(--accent-red)]">{preview.error}</div>
          <div className="mt-1 text-[12px] text-[var(--text-muted)]">
            Try opening it in another app.
          </div>
        </div>
      ) : !preview.dataUrl ? (
        <div className="m-auto text-[13px] text-[var(--text-muted)]">Loading…</div>
      ) : (
        <img
          src={preview.dataUrl}
          alt=""
          draggable={false}
          onLoad={preview.onImgLoad}
          onError={preview.onImgError}
          style={imgStyle}
          className={IMG_CLASS}
        />
      )}
    </div>
  );
}
