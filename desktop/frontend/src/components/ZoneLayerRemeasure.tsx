import { useEffect, useRef } from "react";
import { useDndContext } from "@dnd-kit/core";
import { usePrefersReducedMotion } from "../hooks/usePrefersReducedMotion";
import { SLIDE_MS } from "./ZoneLayerPager";

interface ZoneLayerRemeasureProps {
  openKey: string;
  // The open layer's drop area, buttons and nest drops.
  ids: string[];
}

// dnd-kit measures a layer opened mid-drag as it starts sliding in, a page
// off to the side; once it lands, its drop targets are measured again. Its
// own component: useDndContext re-renders on every pointer move.
export function ZoneLayerRemeasure({ openKey, ids }: ZoneLayerRemeasureProps) {
  const { measureDroppableContainers } = useDndContext();
  const latest = useRef({ measureDroppableContainers, ids });
  latest.current = { measureDroppableContainers, ids };
  const reduceMotion = usePrefersReducedMotion();
  useEffect(() => {
    const timer = setTimeout(
      () => latest.current.measureDroppableContainers(latest.current.ids),
      reduceMotion ? 0 : SLIDE_MS + 20,
    );
    return () => clearTimeout(timer);
  }, [openKey, reduceMotion]);
  return null;
}
