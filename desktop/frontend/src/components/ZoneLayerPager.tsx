import type { ReactNode } from "react";
import type { ZoneLayerView } from "../actionsLayoutModel";
import { usePrefersReducedMotion } from "../hooks/usePrefersReducedMotion";

export const SLIDE_MS = 340;
const SLIDE = `transform ${SLIDE_MS}ms cubic-bezier(.22,.8,.24,1), opacity ${SLIDE_MS}ms`;

interface ZoneLayerPagerProps {
  layers: ZoneLayerView[];
  openKey: string;
  renderPage: (layer: ZoneLayerView, open: boolean) => ReactNode;
}

// Every page shares one grid cell, as wide as the widest page, so switching
// layers slides the pages sideways without the zone changing width.
export function ZoneLayerPager({ layers, openKey, renderPage }: ZoneLayerPagerProps) {
  const reduceMotion = usePrefersReducedMotion();
  const open = Math.max(
    0,
    layers.findIndex((layer) => layer.key === openKey),
  );
  return (
    <div className="relative grid h-full overflow-hidden">
      {layers.map((layer, index) => {
        const isOpen = index === open;
        return (
          <div
            key={layer.key}
            data-zone-layer={layer.key}
            inert={!isOpen}
            aria-hidden={isOpen ? undefined : true}
            className="h-full min-w-0"
            style={{
              gridArea: "1 / 1",
              transform: `translateX(calc(${index - open} * (100% + 16px)))`,
              transition: reduceMotion ? "none" : SLIDE,
              opacity: isOpen ? undefined : 0.12,
            }}
          >
            {renderPage(layer, isOpen)}
          </div>
        );
      })}
    </div>
  );
}
