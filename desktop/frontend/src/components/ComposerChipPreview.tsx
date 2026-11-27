import { useRef } from "react";
import { createPortal } from "react-dom";
import { useAnchoredPosition } from "../hooks/useAnchoredPosition";
import { ComposerChipDetails } from "./ComposerChipDetails";
import { CHIP_KINDS, type ChipSpec } from "./composerChips";

interface ComposerChipPreviewProps {
  text: string;
  spec: ChipSpec;
  anchor: DOMRect;
}

export function ComposerChipPreview({ text, spec, anchor }: ComposerChipPreviewProps) {
  const ref = useRef<HTMLDivElement>(null);
  const { style } = useAnchoredPosition(ref, anchor);
  return createPortal(
    <div
      ref={ref}
      role="tooltip"
      style={style}
      className="pointer-events-none fixed z-[9999] flex w-[340px] flex-col gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-2.5 shadow-[0_8px_24px_rgba(0,0,0,0.22)]"
    >
      <ComposerChipDetails text={text} spec={spec} full={false} />
      <div className="text-[11px] text-[var(--text-muted)]">{CHIP_KINDS[spec.kind].hint}</div>
    </div>,
    document.body,
  );
}
