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
const COMPACT_SHELL = "flex flex-col items-center gap-3";

const BUTTON = "px-6 py-2 text-[15px] sm:px-7 sm:text-[16px]";
const COMPACT_BUTTON = "px-5 py-1.5 text-[14px]";

type Props = {
  source?: DownloadSource;
  // A page about one system keeps that system's download on the button for
  // every visitor; the other builds stay in its menu.
  focus?: DesktopOs;
  // For a row that names the release itself: the button alone, with no trust
  // line and no reserved height.
  compact?: boolean;
};

export function HeroDownload({ source = "hero", focus, compact = false }: Props) {
  const platform = usePlatform();
  const { release } = useRelease();
  const shell = compact ? COMPACT_SHELL : SHELL;

  if (isMobilePlatform(platform)) {
    return (
      <div className={shell}>
        <SendLinkCta />
        {!compact && <HeroTrustLine os={null} />}
      </div>
    );
  }

  if (platform === "linux-arm") {
    return (
      <div className={shell}>
        <NoDownloadCard />
      </div>
    );
  }

  const primary =
    focus && detectedOs(platform) !== focus
      ? DOWNLOADS_BY_OS[focus][0]
      : primaryDownload(platform);

  return (
    <div className={shell}>
      <DownloadSplitButton
        primary={primary}
        detected={isDownloadPlatform(platform) ? platform : null}
        release={release}
        source={source}
        className={compact ? COMPACT_BUTTON : BUTTON}
      />
      {!compact && <HeroTrustLine os={primary.os} />}
    </div>
  );
}
