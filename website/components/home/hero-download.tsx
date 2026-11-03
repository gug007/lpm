"use client";

import { useRelease } from "@/components/release-context";
import type { DownloadSource } from "@/lib/analytics";
import { DOWNLOADS_BY_OS, type DesktopOs } from "@/lib/downloads";
import {
  detectedOs,
  isDownloadPlatform,
  isMobilePlatform,
  primaryDownload,
  usePlatform,
} from "@/lib/use-platform";
import { DownloadSplitButton } from "./download-split-button";
import { HeroTrustLine } from "./hero-trust-line";
import { NoDownloadCard } from "./no-download-card";
import { SendLinkCta } from "./send-link-cta";

// Detection only exists after hydration, so the server markup is the
// focused system's button (Apple Silicon by default). On a phone the swap to
// the send-link prompt keeps about the same height, and the min-height covers
// the shorter ARM Linux card.
const SHELL =
  "flex w-full flex-col items-center justify-center gap-4 min-h-[144px] sm:min-h-[97px]";

type Props = {
  source?: DownloadSource;
  // A page about one system keeps that system's download on the button for
  // every visitor; the other builds stay in its menu.
  focus?: DesktopOs;
};

export function HeroDownload({ source = "hero", focus }: Props) {
  const platform = usePlatform();
  const { release } = useRelease();

  if (isMobilePlatform(platform)) {
    return (
      <div className={SHELL}>
        <SendLinkCta />
        <HeroTrustLine os={null} />
      </div>
    );
  }

  if (platform === "linux-arm") {
    return (
      <div className={SHELL}>
        <NoDownloadCard />
      </div>
    );
  }

  const primary =
    focus && detectedOs(platform) !== focus
      ? DOWNLOADS_BY_OS[focus][0]
      : primaryDownload(platform);

  return (
    <div className={SHELL}>
      <DownloadSplitButton
        primary={primary}
        detected={isDownloadPlatform(platform) ? platform : null}
        release={release}
        source={source}
        className="px-6 py-2 text-[15px] sm:px-7 sm:text-[16px]"
      />
      <HeroTrustLine os={primary.os} />
    </div>
  );
}
