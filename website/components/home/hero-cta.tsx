"use client";

import type { ReactNode } from "react";
import { Play } from "lucide-react";
import { AppStoreButton } from "@/components/app-store-button";
import { GooglePlayButton } from "@/components/google-play-button";
import { useRelease } from "@/components/release-context";
import type { AppStoreSource, DownloadSource } from "@/lib/analytics";
import { DEMO_ANCHOR, LESSONS_ANCHOR } from "@/lib/links";
import {
  isDownloadPlatform,
  isMobilePlatform,
  primaryDownload,
  useIsAndroid,
  usePlatform,
} from "@/lib/use-platform";
import { DownloadSplitButton } from "./download-split-button";
import { HeroTrustLine } from "./hero-trust-line";
import { formatLength, OVERVIEW_LESSON } from "./lesson-data";
import { NoDownloadCard } from "./no-download-card";
import { SendLinkCta } from "./send-link-cta";

// The homepage keeps the demo frame in the first viewport, so this row reserves
// its height: platform detection only runs after hydration and must not shove
// the frame down mid-load.
const SHELL =
  "flex w-full flex-col items-center gap-4 min-h-[208px] sm:min-h-[91px]";

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

// Phones and tablets can't install lpm, so they send the link on to a
// computer; pages that pass an App Store source offer the phone companion
// second, from the store that phone uses.
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
  const { release } = useRelease();
  const onMobile = isMobilePlatform(platform);
  const android = useIsAndroid();
  const trust = <HeroTrustLine os={null} />;

  if (onMobile) {
    return (
      <div className={SHELL}>
        <SendLinkCta />
        {appStoreSource &&
          (android ? (
            <GooglePlayButton source={appStoreSource} variant="outline" />
          ) : (
            <AppStoreButton source={appStoreSource} variant="outline" />
          ))}
        {trust}
      </div>
    );
  }

  if (platform === "linux-arm") {
    return (
      <div className={SHELL}>
        <NoDownloadCard />
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
      <HeroTrustLine os={primary.os} withPlatforms />
    </div>
  );
}
