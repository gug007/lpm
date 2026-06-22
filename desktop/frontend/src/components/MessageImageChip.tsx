import { useEffect, useRef, useState } from "react";
import { ImageIcon } from "./icons";
import { ImagePreviewPopover } from "./ImagePreviewPopover";
import { IMAGE_CHIP_CLASS, IMAGE_CHIP_THUMB_CLASS } from "./composerEditor";
import { useImageDataUrl } from "./imageDataUrl";

interface MessageImageChipProps {
  index: number;
  path: string;
}

export function MessageImageChip({ index, path }: MessageImageChipProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const { url } = useImageDataUrl(path);

  // The preview is pinned to the hover-time rect, so scrolling the (virtualized)
  // history list or resizing the window would leave it floating — dismiss on both.
  useEffect(() => {
    if (!anchor) return;
    const clear = () => setAnchor(null);
    const scroller = ref.current?.closest("[data-history-scroll]");
    scroller?.addEventListener("scroll", clear);
    window.addEventListener("resize", clear);
    return () => {
      scroller?.removeEventListener("scroll", clear);
      window.removeEventListener("resize", clear);
    };
  }, [anchor]);

  // Read-only mirror of the composer chip's resting look (thumbnail avatar +
  // "Image N"); the row owns the click, so this stays a plain span.
  return (
    <>
      <span
        ref={ref}
        onMouseEnter={() => setAnchor(ref.current?.getBoundingClientRect() ?? null)}
        onMouseLeave={() => setAnchor(null)}
        className={`mx-0.5 ${IMAGE_CHIP_CLASS}`}
      >
        <span className={`${IMAGE_CHIP_THUMB_CLASS} flex items-center justify-center text-[var(--text-muted)]`}>
          {url ? (
            <img src={url} alt="" draggable={false} className="absolute inset-0 h-full w-full object-cover" />
          ) : (
            <ImageIcon size={12} />
          )}
        </span>
        Image {index}
      </span>
      {anchor && <ImagePreviewPopover path={path} anchor={anchor} />}
    </>
  );
}
