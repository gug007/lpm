"use client";

import { useRef, useState, type ReactNode, type Ref } from "react";
import { DemoHintPill } from "./demo-hint-pill";
import { DemoInvite } from "./demo-invite";
import { WINDOW_FRAME } from "./demo-window";
import type { Tour, TourHandle, TourState } from "./tour";
import { useDemoFrame } from "./use-demo-frame";
import { useParked } from "./use-parked";
import { useHintExpiry, useTourHint } from "./use-tour-hint";

type Props = {
  height: string;
  // Opens the sample workspace and plays this tour on it. Without one the
  // frame opens an empty workspace, like a fresh install.
  tour?: Tour;
  // The step list beside the frame reads the tour's progress through onTour
  // and runs steps through tourRef.
  tourRef?: Ref<TourHandle>;
  onTour?: (state: TourState) => void;
  // What covers the frame until the app inside it has booted, given how far
  // along that is, from 0 to 1.
  placeholder?: (progress: number) => ReactNode;
  // Takes over the window while the app carries on underneath.
  cover?: ReactNode;
};

function appUrl(tour?: Tour) {
  if (!tour) return "/demo-app/index.html";
  const omit = tour.omitProjects?.length
    ? `&omit=${tour.omitProjects.join(",")}`
    : "";
  return `/demo-app/index.html?seed=sample${omit}`;
}

// The desktop app's own UI, built from desktop/frontend against an in-memory
// backend (see scripts/build-demo-app.mjs), so it never drifts from the app.
export function DemoFrame({
  height,
  tour,
  tourRef,
  onTour,
  placeholder,
  cover,
}: Props) {
  const frameRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const parked = useParked(frameRef) && !cover;
  const pill = useTourHint(tour);
  // Up until the visitor does anything in the window or the step list.
  const [invited, setInvited] = useState(Boolean(tour?.invite));
  const opening = tour?.opening ?? 0;
  const { shown, progress } = useDemoFrame({
    iframeRef,
    tour,
    parked,
    tourRef,
    onTour,
    onStage: (stage) => {
      pill.advance(stage);
      if (stage > opening) setInvited(false);
    },
    onInteract: () => {
      pill.hide();
      setInvited(false);
    },
  });
  useHintExpiry(pill, shown && parked);

  return (
    <div
      ref={frameRef}
      data-on-dark
      className={`relative ${WINDOW_FRAME}`}
      style={{ height }}
    >
      <iframe
        ref={iframeRef}
        src={appUrl(tour)}
        title="lpm, running in your browser"
        className="block h-full w-full border-0"
      />
      {!shown && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#1a1a1a]">
          {placeholder?.(progress) ?? (
            <span aria-hidden="true" className="text-[13px] text-[#919191]">
              Loading demo…
            </span>
          )}
        </div>
      )}
      {tour?.invite && (
        <DemoInvite
          iframeRef={iframeRef}
          invite={tour.invite}
          hidden={!shown || !parked || !invited}
        />
      )}
      {pill.hint.text && (
        <DemoHintPill
          hint={pill.hint.text}
          hidden={!shown || !parked || !pill.visible}
        />
      )}
      {cover && <div className="absolute inset-0 z-40">{cover}</div>}
    </div>
  );
}
