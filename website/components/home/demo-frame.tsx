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
  // What covers the frame until the app inside it has booted.
  placeholder?: ReactNode;
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
}: Props) {
  const frameRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [loaded, setLoaded] = useState(false);
  const parked = useParked(frameRef);
  const pill = useTourHint(tour);
  // Up until the visitor does anything in the window or the step list.
  const [invited, setInvited] = useState(Boolean(tour?.invite));
  const opening = tour?.opening ?? 0;
  const ready = useDemoFrame({
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
  // An empty workspace has no tour to take, so loading is enough.
  const shown = ready || (!tour && loaded);
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
        onLoad={() => setLoaded(true)}
        className="block h-full w-full border-0"
      />
      {!shown && (
        <div
          aria-hidden="true"
          className="absolute inset-0 flex items-center justify-center bg-[#1a1a1a]"
        >
          {placeholder ?? (
            <span className="text-[13px] text-[#5c5c5c]">Loading demo…</span>
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
    </div>
  );
}
