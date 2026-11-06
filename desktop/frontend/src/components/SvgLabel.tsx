import { useMemo, useState, type ReactNode } from "react";
import { labelImage } from "../labelImage";
import { popupTheme } from "../popup/popupTheme";
import { useResolvedTheme } from "../theme";

// A button's `labelSvg`, drawn as an image filling the button edge to edge;
// `fallback` when the markup can't be drawn.
export function SvgLabel({ markup, alt, fallback }: { markup: string; alt: string; fallback: ReactNode }) {
  const mode = useResolvedTheme();
  const src = useMemo(() => labelImage(markup, popupTheme()), [markup, mode]);
  const [broken, setBroken] = useState<string | null>(null);
  if (!src || broken === src) return fallback;
  return (
    <span className="flex h-full max-w-[240px] overflow-hidden rounded-[inherit]">
      {/* A text baseline like the buttons beside it: a row lines buttons up
          on their baselines, and an image's is its bottom edge. */}
      <span aria-hidden className="w-0 self-center">
        {"​"}
      </span>
      <img src={src} alt={alt} draggable={false} onError={() => setBroken(src)} className="block h-full w-auto" />
    </span>
  );
}
