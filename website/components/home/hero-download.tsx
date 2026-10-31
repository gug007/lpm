"use client";

import { useRelease } from "@/components/release-context";
import type { DownloadSource } from "@/lib/analytics";
import {
  detectedOs,
  isDownloadPlatform,
  primaryDownload,
  usePlatform,
} from "@/lib/use-platform";
import { DownloadSplitButton } from "./download-split-button";
import { HeroTrustLine } from "./hero-trust-line";
import { NoDownloadCard } from "./no-download-card";

// Detection only exists after hydration. The Apple Silicon button is both the
// server markup and the most-likely detected branch, so the swap after
// detection almost never changes the box; the min-height only has to absorb
// the no-download card phones and tablets get.
const SHELL =
  "flex w-full flex-col items-center justify-center gap-4 min-h-[144px] sm:min-h-[97px]";

type Props = {
  source?: DownloadSource;
  // Mac-targeted pages keep the Mac download on the button for every visitor;
  // Windows and Linux builds stay in its menu.
  macFocus?: boolean;
};

export function HeroDownload({ source = "hero", macFocus = false }: Props) {
  const platform = usePlatform();
  const { release } = useRelease();

  if (
    platform === "ipad" ||
    platform === "unsupported" ||
    platform === "linux-arm"
  ) {
    return (
      <div className={SHELL}>
        <NoDownloadCard linuxArm={platform === "linux-arm"} />
      </div>
    );
  }

  const os = detectedOs(platform);
  const offMac = os === "windows" || os === "linux";
  const primary = primaryDownload(macFocus && offMac ? null : platform);

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
