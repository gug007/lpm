"use client";

import Link from "next/link";
import { trackDownload, type DownloadSource } from "@/lib/analytics";
import {
  DOWNLOAD_ENTRIES,
  DOWNLOADS_BY_OS,
  GIT_FOR_WINDOWS_URL,
  type DownloadEntry,
} from "@/lib/downloads";
import { DotRow } from "./dot-row";
import { SafetyLink } from "./safety-link";

type Props = {
  primary: DownloadEntry;
  source: DownloadSource;
  className: string;
  otherSystems?: boolean;
};

// Mac visitors get the other architecture; Windows visitors the one thing
// lpm needs first; Linux visitors the other package formats. Off macOS the
// signature badge has no place, so the safety link joins this row.
export function DownloadAlternates({
  primary,
  source,
  className,
  otherSystems = true,
}: Props) {
  const link = `${className} text-gray-500 transition-colors hover:text-gray-900 dark:text-gray-400 dark:hover:text-white`;
  const track = (entry: DownloadEntry) => () =>
    trackDownload({ source, platform: entry.platform, href: entry.href });

  if (primary.os === "macos") {
    const alternate =
      primary.platform === "mac-arm"
        ? DOWNLOAD_ENTRIES["mac-intel"]
        : DOWNLOAD_ENTRIES["mac-arm"];
    return (
      <DotRow
        items={[
          <a
            key={alternate.platform}
            href={alternate.href}
            aria-label={alternate.ariaLabel}
            onClick={track(alternate)}
            className={link}
          >
            {alternate.platform === "mac-intel"
              ? "Intel Mac? Get the x86-64 build"
              : "Apple Silicon Mac? Get the arm64 build"}
          </a>,
          otherSystems && (
            <Link
              key="others"
              href="/#download"
              prefetch={false}
              aria-label="Downloads for Windows and Linux"
              className={link}
            >
              Windows &amp; Linux
            </Link>
          ),
        ]}
      />
    );
  }

  const tail = [
    <Link key="others" href="/#download" prefetch={false} className={link}>
      Other systems
    </Link>,
    <SafetyLink key="safety" className={link} />,
  ];

  if (primary.os === "windows") {
    return (
      <DotRow
        stackOnMobile
        items={[
          <a
            key="git"
            href={GIT_FOR_WINDOWS_URL}
            target="_blank"
            rel="noopener noreferrer"
            className={link}
          >
            Needs Git for Windows
          </a>,
          ...tail,
        ]}
      />
    );
  }

  const others = DOWNLOADS_BY_OS.linux.filter(
    ({ platform }) => platform !== primary.platform,
  );
  return (
    <DotRow
      stackOnMobile
      items={[
        ...others.map((entry) => (
          <a
            key={entry.platform}
            href={entry.href}
            aria-label={entry.ariaLabel}
            onClick={track(entry)}
            className={link}
          >
            Get the {entry.choiceLabel}
          </a>
        )),
        ...tail,
      ]}
    />
  );
}
