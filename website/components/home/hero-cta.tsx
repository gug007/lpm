"use client";

import type { ReactNode } from "react";
import { Play } from "lucide-react";
import { AppStoreButton } from "@/components/app-store-button";
import { useRelease } from "@/components/release-context";
import type { AppStoreSource, DownloadSource } from "@/lib/analytics";
import { DEMO_ANCHOR, LESSONS_ANCHOR } from "@/lib/links";
import {
  isDownloadPlatform,
  isMobilePlatform,
  primaryDownload,
  usePlatform,
} from "@/lib/use-platform";
import { DownloadSplitButton } from "./download-split-button";
import { HeroTrustLine } from "./hero-trust-line";
import { HeroPlatforms } from "./hero-platforms";
import { formatLength, OVERVIEW_LESSON } from "./lesson-data";
import { NoDownloadCard } from "./no-download-card";
import { SendLinkButton } from "./send-link-button";

// The homepage keeps the demo frame in the first viewport, so this row reserves
// its height: platform detection only runs after hydration and must not shove
// the frame down mid-load.
const SHELL =
  "flex w-full flex-col items-center gap-4 min-h-[208px] sm:min-h-[122px]";

const SECONDARY =
  "items-center justify-center gap-2 rounded-full border border-gray-300 px-6 py-[13px] text-[15px] font-medium text-gray-700 transition-colors duration-200 hover:border-gray-400 hover:text-gray-900 dark:border-gray-700 dark:text-gray-300 dark:hover:border-gray-500 dark:hover:text-white";

// From md up the interactive demo already sits under the hero, so the second
// button offers what isn't on screen yet: the three-minute video. Narrower
// windows play that video in the demo's place.
function TourLink() {
  return (
    <>
      <a href={DEMO_ANCHOR} className={`inline-flex md:hidden ${SECONDARY}`}>
        <Play className="h-3.5 w-3.5" aria-hidden />
        Watch the demo
      </a>
      <a href={LESSONS_ANCHOR} className={`hidden md:inline-flex ${SECONDARY}`}>
        <Play className="h-3.5 w-3.5" aria-hidden />
        Watch the 3-minute tour
        <span className="font-mono text-[13px] tabular-nums opacity-70">
          {formatLength(OVERVIEW_LESSON.seconds)}
        </span>
      </a>
    </>
  );
}

// Pages that pass an App Store source turn the phone and tablet branch into a
// way to get the desktop app onto the visitor's computer, with the iPhone
// companion second, instead of a no-download dead end.
export function HeroCta({
  source = "hero",
  secondary,
  appStoreSource,
}: {
  source?: DownloadSource;
  secondary?: ReactNode;
  appStoreSource?: AppStoreSource;
}) {
  const platform = usePlatform();
  const { release, downloads } = useRelease();
  const onMobile = isMobilePlatform(platform);
  const trust = <HeroTrustLine os={null} downloads={downloads} />;

  if (onMobile && appStoreSource) {
    return (
      <div className={SHELL}>
        <div className="flex w-full flex-col items-center gap-2">
          <SendLinkButton variant="primary" label="Send lpm to my computer" />
          <p className="text-pretty text-center text-[13px] text-gray-500 dark:text-gray-400">
            AirDrop it to your Mac, or message the link to yourself.
          </p>
        </div>
        <AppStoreButton source={appStoreSource} variant="outline" />
        {trust}
      </div>
    );
  }

  if (onMobile || platform === "linux-arm") {
    return (
      <div className={SHELL}>
        <NoDownloadCard linuxArm={platform === "linux-arm"} />
        {trust}
      </div>
    );
  }

  const primary = primaryDownload(platform);

  return (
    <div className={SHELL}>
      <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
        <DownloadSplitButton
          primary={primary}
          detected={isDownloadPlatform(platform) ? platform : null}
          release={release}
          source={source}
          className="px-6 py-2 text-[15px] sm:px-7 sm:text-[16px]"
        />
        {secondary ?? <TourLink />}
      </div>
      <HeroPlatforms primary={primary} />
      <HeroTrustLine os={primary.os} downloads={downloads} />
    </div>
  );
}
