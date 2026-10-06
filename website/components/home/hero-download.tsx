"use client";

import type { DownloadSource } from "@/lib/analytics";
import { detectedOs, primaryDownload, usePlatform } from "@/lib/use-platform";
import { DownloadDetails } from "./download-details";
import { NoDownloadCard } from "./no-download-card";
import { PrimaryDownload } from "./primary-download";

// Detection only exists after hydration. The Apple Silicon pill is both the
// server markup and the most-likely detected branch, so the swap after
// detection almost never changes the box; the min-height only has to absorb
// the rarer branches (the Intel, Windows and Linux swaps, the no-download card).
const SHELL =
  "flex w-full flex-col items-center justify-center gap-3 min-h-[172px] sm:min-h-[124px]";

type Props = {
  source?: DownloadSource;
  // Mac-targeted pages keep the Mac download for every visitor; Windows and
  // Linux visitors get a link to their builds instead of a swapped button.
  macFocus?: boolean;
};

export function HeroDownload({ source = "hero", macFocus = false }: Props) {
  const platform = usePlatform();

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
      <PrimaryDownload
        entry={primary}
        source={source}
        className="px-7 py-3.5 text-[17px] sm:px-8 sm:py-4"
      />
      <DownloadDetails
        primary={primary}
        source={source}
        linkClassName="text-xs font-medium"
        rowGap="gap-3"
        otherSystems={!macFocus || offMac}
      />
    </div>
  );
}
