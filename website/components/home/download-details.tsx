"use client";

import type { DownloadSource } from "@/lib/analytics";
import type { DownloadEntry } from "@/lib/downloads";
import { DotRow } from "./dot-row";
import { DownloadAlternates } from "./download-alternates";
import { DownloadNote } from "./download-note";
import { SafetyLink } from "./safety-link";
import { SignatureBadge } from "./signature-badge";

const SAFETY_LINK =
  "text-[11px] text-gray-500 underline decoration-gray-300 underline-offset-4 transition-colors hover:text-gray-900 dark:text-gray-400 dark:decoration-gray-600 dark:hover:text-white";

type Props = {
  primary: DownloadEntry;
  source: DownloadSource;
  linkClassName: string;
  rowGap: string;
  otherSystems?: boolean;
};

// Two rows for every system, each short enough for one line from sm up, so
// the swap after platform detection keeps the hero's height and never leaves
// a separator hanging at a line end.
export function DownloadDetails({
  primary,
  source,
  linkClassName,
  rowGap,
  otherSystems,
}: Props) {
  return (
    <div className={`flex flex-col items-center ${rowGap}`}>
      <DownloadAlternates
        primary={primary}
        source={source}
        className={linkClassName}
        otherSystems={otherSystems}
      />
      {primary.os === "macos" ? (
        <DotRow
          stackOnMobile
          items={[
            <SignatureBadge key="signature" />,
            <SafetyLink key="safety" className={SAFETY_LINK} />,
          ]}
        />
      ) : (
        <DownloadNote os={primary.os} withRequirement />
      )}
    </div>
  );
}
