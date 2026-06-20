import { useRef, useState } from "react";
import { ImageIcon } from "./icons";
import { ImagePreviewPopover } from "./ImagePreviewPopover";

interface MessageImageChipProps {
  index: number;
  path: string;
}

export function MessageImageChip({ index, path }: MessageImageChipProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const [anchor, setAnchor] = useState<DOMRect | null>(null);

  return (
    <>
      <span
        ref={ref}
        onMouseEnter={() => setAnchor(ref.current?.getBoundingClientRect() ?? null)}
        onMouseLeave={() => setAnchor(null)}
        className="mx-0.5 inline-flex items-center gap-1 rounded border border-[var(--border)] bg-[var(--bg-active)] px-1 py-px align-middle text-[11px] text-[var(--text-secondary)]"
      >
        <ImageIcon size={12} />
        Image {index}
      </span>
      {anchor && <ImagePreviewPopover path={path} anchor={anchor} />}
    </>
  );
}
