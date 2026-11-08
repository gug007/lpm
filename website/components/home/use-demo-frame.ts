"use client";

import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type Ref,
  type RefObject,
} from "react";
import {
  SOURCE,
  type AppMessage,
  type HostMessage,
  type TourStepWire,
} from "./demo-protocol";
import type { Tour, TourHandle, TourState, TourStep } from "./tour";

type Args = {
  iframeRef: RefObject<HTMLIFrameElement | null>;
  tour?: Tour;
  parked: boolean;
  tourRef?: Ref<TourHandle>;
  onTour?: (state: TourState) => void;
  onStage: (stage: number) => void;
  // The visitor took the wheel: the frame drops its prompts.
  onInteract: () => void;
};

function isAppMessage(data: unknown): data is AppMessage {
  return (
    typeof data === "object" &&
    data !== null &&
    (data as { source?: unknown }).source === SOURCE
  );
}

// The copy stays on this side of the frame: the app only plays the steps.
function toWire(step: TourStep): TourStepWire {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { title, body, leadMs, hint, ...wire } = step;
  return wire;
}

// Hands the page's tour to the app in the frame, lands its opening steps, cues
// the rest as the frame parks in view, and reports back how far it has got.
// Returns whether the app is ready to be shown (booted, with the opening steps
// done) and how far along that is, from 0 to 1.
export function useDemoFrame({
  iframeRef,
  tour,
  parked,
  tourRef,
  onTour,
  onStage,
  onInteract,
}: Args) {
  const [ready, setReady] = useState(false);
  const [downloaded, setDownloaded] = useState(0);
  const [opened, setOpened] = useState(!tour?.opening);
  const hooksRef = useRef({ onTour, onStage, onInteract });
  // Read when the app asks for it rather than on every render: a page hands
  // the same tour in for the life of the frame.
  const tourConfigRef = useRef(tour);
  // The opening tour is cued once. A step run from the list, or motion turned
  // down, spends it too, so parking the frame later never replays it.
  const armedRef = useRef(false);
  const playingRef = useRef(false);
  // A step clicked while the app is still booting runs as soon as it can.
  const pendingRunRef = useRef<number | null>(null);

  useLayoutEffect(() => {
    hooksRef.current = { onTour, onStage, onInteract };
    tourConfigRef.current = tour;
  });

  const post = useCallback(
    (message: HostMessage) =>
      iframeRef.current?.contentWindow?.postMessage(
        message,
        window.location.origin,
      ),
    [iframeRef],
  );

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.source !== iframeRef.current?.contentWindow) return;
      if (!isAppMessage(event.data)) return;
      const message = event.data;
      if (message.type === "progress") {
        setDownloaded(message.fraction);
        return;
      }
      if (message.type === "state") {
        const { stage, playing } = message;
        playingRef.current = playing;
        if (stage >= (tourConfigRef.current?.opening ?? 0)) setOpened(true);
        hooksRef.current.onStage(stage);
        hooksRef.current.onTour?.({ stage, playing });
        return;
      }
      setReady(true);
      const script = tourConfigRef.current;
      if (!script) return;
      post({ source: SOURCE, type: "tour", steps: script.steps.map(toWire) });
      if (script.opening) {
        post({ source: SOURCE, type: "land", index: script.opening - 1 });
      }
      const pending = pendingRunRef.current;
      pendingRunRef.current = null;
      if (pending !== null) {
        post({ source: SOURCE, type: "run", index: pending });
      } else if (
        !armedRef.current &&
        !script.invite &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ) {
        armedRef.current = true;
        post({ source: SOURCE, type: "settle" });
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [iframeRef, post]);

  // Parking the frame cues the tour, unless it waits for the visitor. Scrolling
  // away mid-tour lands what it was heading for, so the visitor comes back to
  // a finished demo rather than a project half set up.
  useEffect(() => {
    if (!ready || !tourConfigRef.current) return;
    if (parked && !armedRef.current && !tourConfigRef.current.invite) {
      armedRef.current = true;
      playingRef.current = true;
      post({ source: SOURCE, type: "play" });
    } else if (!parked && playingRef.current) {
      playingRef.current = false;
      post({ source: SOURCE, type: "settle" });
    }
  }, [ready, parked, post]);

  // A click in the window moves focus into the frame, which is all this page
  // sees of it. The pointer has to be over the frame, so the app focusing its
  // own composer mid-tour does not count.
  useEffect(() => {
    const onBlur = () => {
      const iframe = iframeRef.current;
      if (iframe && document.activeElement === iframe && iframe.matches(":hover"))
        hooksRef.current.onInteract();
    };
    window.addEventListener("blur", onBlur);
    return () => window.removeEventListener("blur", onBlur);
  }, [iframeRef]);

  useImperativeHandle(
    tourRef,
    () => ({
      run: (index: number) => {
        hooksRef.current.onInteract();
        armedRef.current = true;
        if (ready) post({ source: SOURCE, type: "run", index });
        else pendingRunRef.current = index;
      },
    }),
    [ready, post],
  );

  return {
    shown: ready && opened,
    // The download is most of the wait, but the app still has to boot after it.
    progress: ready ? 0.95 : downloaded * 0.9,
  };
}
