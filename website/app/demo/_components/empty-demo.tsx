"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { EMPTY_TOUR } from "@/components/demo/tour";
import { DownloadLink } from "@/components/download-link";

const FRAME =
  "overflow-hidden rounded-xl bg-[#1a1a1a] ring-1 ring-white/[0.16] shadow-[0_1px_0_0_rgba(0,0,0,0.8),0_24px_60px_-20px_rgba(0,0,0,0.9)]";

const DEMO_HEIGHT = "min(720px, calc(100vh - 230px))";

const DemoApp = dynamic(
  () => import("@/components/demo/demo-app").then((m) => m.DemoApp),
  {
    ssr: false,
    loading: () => <FramePlaceholder />,
  },
);

function FramePlaceholder() {
  return (
    <div
      aria-hidden="true"
      className={`flex h-[var(--demo-h)] items-center justify-center ${FRAME}`}
      style={{ "--demo-h": DEMO_HEIGHT } as React.CSSProperties}
    >
      <span className="text-[13px] text-[#5c5c5c]">Loading demo…</span>
    </div>
  );
}

function DesktopOnlyPrompt() {
  return (
    <div
      data-on-dark
      className={`flex flex-col items-center gap-3 px-5 py-10 text-center ${FRAME}`}
    >
      <p className="max-w-xs text-[13px] leading-relaxed text-[#919191]">
        lpm is a macOS app with a multi-pane terminal workspace. Open this page
        on your computer to try the interactive demo.
      </p>
      <DownloadLink className="inline-flex min-h-11 items-center rounded-lg bg-[#e5e5e5] px-4 py-2 text-[13px] font-medium text-[#1a1a1a] transition-all duration-100 hover:opacity-85 active:scale-[0.97]">
        Get lpm for Mac
      </DownloadLink>
    </div>
  );
}

// The window opens on nothing at all: no projects, no automations, no tour
// playing. Whatever ends up in it, the visitor put there.
export function EmptyDemo() {
  // null until the media query is read on the client, so the first paint
  // matches the server HTML at every width.
  const [isDesktop, setIsDesktop] = useState<boolean | null>(null);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const update = () => setIsDesktop(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  return (
    <div data-nosnippet className="mx-auto w-full max-w-[1040px]">
      {isDesktop !== true && (
        <div className={isDesktop === null ? "md:hidden" : undefined}>
          <DesktopOnlyPrompt />
        </div>
      )}
      {isDesktop !== false && (
        <div className={isDesktop === null ? "hidden md:block" : undefined}>
          {isDesktop ? (
            <DemoApp
              heightCss={DEMO_HEIGHT}
              heightCssSm={DEMO_HEIGHT}
              tour={EMPTY_TOUR}
              seedProjects={[]}
              seedJobs={[]}
            />
          ) : (
            <FramePlaceholder />
          )}
        </div>
      )}
    </div>
  );
}
