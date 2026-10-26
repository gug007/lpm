"use client";

import { useEffect, useRef, useState } from "react";
import { SOURCE, type AppMessage, type HostMessage } from "@/components/home/demo-protocol";

const PREVIEW_URL = "/demo-app/index.html?config=preview";
const SEND_DELAY_MS = 200;
// Covers the app until it has drawn the first config it was sent.
const REVEAL_MS = 150;

type Props = {
  // The last config that parsed; the app keeps showing it while the editor
  // holds a broken one.
  yaml: string;
  error: string | null;
  // Mounts the app, which boots the whole desktop UI, only while it's needed.
  active: boolean;
};

// The desktop app's own window for one project, built against the demo
// backend, showing the config being edited as if it had just been saved.
export function AppPreview({ yaml, error, active }: Props) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [ready, setReady] = useState(false);
  const [shown, setShown] = useState(false);
  if (!active && (ready || shown)) {
    setReady(false);
    setShown(false);
  }

  useEffect(() => {
    if (!active) return;
    const onMessage = (e: MessageEvent) => {
      const message = e.data as AppMessage | null;
      if (e.source !== iframeRef.current?.contentWindow || message?.source !== SOURCE) return;
      if (message.type === "ready") setReady(true);
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [active]);

  useEffect(() => {
    if (!ready) return;
    const send = setTimeout(() => {
      const message: HostMessage = { source: SOURCE, type: "config", yaml };
      iframeRef.current?.contentWindow?.postMessage(message, window.location.origin);
    }, shown ? SEND_DELAY_MS : 0);
    const reveal = shown ? undefined : setTimeout(() => setShown(true), REVEAL_MS);
    return () => {
      clearTimeout(send);
      clearTimeout(reveal);
    };
  }, [ready, yaml, shown]);

  return (
    <div data-on-dark className="relative h-full bg-[#1a1a1a]">
      {active && (
        <iframe
          ref={iframeRef}
          src={PREVIEW_URL}
          title="lpm, showing this config"
          className="block h-full w-full border-0"
        />
      )}
      {!shown && (
        <div
          aria-hidden="true"
          className="absolute inset-0 flex items-center justify-center bg-[#1a1a1a] text-[13px] text-[#5c5c5c]"
        >
          Loading lpm…
        </div>
      )}
      {error && (
        <div
          role="status"
          className="absolute inset-x-0 bottom-0 border-t border-red-900 bg-[#2a1215] px-4 py-2.5 font-mono text-[11px] text-red-300"
        >
          {error} — showing the last config that worked.
        </div>
      )}
    </div>
  );
}
