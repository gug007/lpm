import { releaseAsset } from "./links";

export type MacDownloadPlatform = "mac-arm" | "mac-intel";
export type LinuxDownloadPlatform = "linux-deb" | "linux-rpm" | "linux-appimage";
export type DownloadPlatform =
  | MacDownloadPlatform
  | "windows-x64"
  | LinuxDownloadPlatform;
export type DesktopOs = "macos" | "windows" | "linux";

export type DownloadEntry = {
  platform: DownloadPlatform;
  os: DesktopOs;
  filename: string;
  href: string;
  label: string;
  choiceLabel: string;
  choiceDescription: string;
  ariaLabel: string;
};

function entry(
  platform: DownloadPlatform,
  os: DesktopOs,
  filename: string,
  copy: Pick<
    DownloadEntry,
    "label" | "choiceLabel" | "choiceDescription" | "ariaLabel"
  >,
): DownloadEntry {
  return { platform, os, filename, href: releaseAsset(filename), ...copy };
}

export const DOWNLOAD_ENTRIES: Record<DownloadPlatform, DownloadEntry> = {
  "mac-arm": entry("mac-arm", "macos", "lpm-desktop-macos-arm64.dmg", {
    label: "Download for macOS (Apple Silicon)",
    choiceLabel: "Apple Silicon",
    choiceDescription: "For M-series Macs",
    ariaLabel: "Download lpm for Apple Silicon M-series Macs",
  }),
  "mac-intel": entry("mac-intel", "macos", "lpm-desktop-macos-amd64.dmg", {
    label: "Download for macOS (Intel)",
    choiceLabel: "Intel",
    choiceDescription: "For x86-64 Macs",
    ariaLabel: "Download lpm for Intel x86-64 Macs",
  }),
  "windows-x64": entry(
    "windows-x64",
    "windows",
    "lpm-desktop-windows-amd64-setup.exe",
    {
      label: "Download for Windows",
      choiceLabel: "Installer (.exe)",
      choiceDescription: "Per-user, no admin rights",
      ariaLabel: "Download the lpm beta installer for 64-bit Windows 11",
    },
  ),
  "linux-deb": entry("linux-deb", "linux", "lpm-desktop-linux-amd64.deb", {
    label: "Download for Linux (.deb)",
    choiceLabel: ".deb",
    choiceDescription: "Debian and Ubuntu family",
    ariaLabel: "Download the lpm beta .deb package for 64-bit x86 Linux",
  }),
  "linux-rpm": entry("linux-rpm", "linux", "lpm-desktop-linux-amd64.rpm", {
    label: "Download for Linux (.rpm)",
    choiceLabel: ".rpm",
    choiceDescription: "rpm systems with glibc 2.35+",
    ariaLabel:
      "Download the lpm beta .rpm package for 64-bit x86 Linux with glibc 2.35 or newer",
  }),
  "linux-appimage": entry(
    "linux-appimage",
    "linux",
    "lpm-desktop-linux-amd64.AppImage",
    {
      label: "Download for Linux (AppImage)",
      choiceLabel: "AppImage",
      choiceDescription: "One portable file",
      ariaLabel: "Download the lpm beta AppImage for 64-bit x86 Linux",
    },
  ),
};

export function entryForFilename(filename: string): DownloadEntry | undefined {
  return Object.values(DOWNLOAD_ENTRIES).find(
    (entry) => entry.filename === filename,
  );
}

export const DOWNLOAD_OS_ORDER: DesktopOs[] = ["macos", "windows", "linux"];

export const OS_NAMES: Record<DesktopOs, string> = {
  macos: "macOS",
  windows: "Windows",
  linux: "Linux",
};

export const DOWNLOADS_BY_OS: Record<DesktopOs, DownloadEntry[]> = {
  macos: [DOWNLOAD_ENTRIES["mac-arm"], DOWNLOAD_ENTRIES["mac-intel"]],
  windows: [DOWNLOAD_ENTRIES["windows-x64"]],
  linux: [
    DOWNLOAD_ENTRIES["linux-deb"],
    DOWNLOAD_ENTRIES["linux-rpm"],
    DOWNLOAD_ENTRIES["linux-appimage"],
  ],
};

export const OS_REQUIREMENTS: Record<DesktopOs, string> = {
  macos: "12 or later",
  windows: "11, x64",
  linux: "x86-64, Ubuntu 22.04 or newer",
};

// ".dmg", ".exe", ".AppImage": what a download button says it hands over.
export function fileType(entry: DownloadEntry): string {
  return entry.filename.slice(entry.filename.lastIndexOf("."));
}

// The table's short name for a build: the Windows installer is just ".exe".
export function shortChoiceLabel(entry: DownloadEntry): string {
  return entry.choiceLabel.replace(/^Installer \((.+)\)$/, "$1");
}

export function isBetaOs(os: DesktopOs): boolean {
  return os !== "macos";
}

export type ReleaseSummary = {
  version: string;
  publishedAt: string | null;
  sizes: Partial<Record<DownloadPlatform, number>>;
};

export function formatSize(bytes: number): string {
  return `${(bytes / 1_000_000).toFixed(1)} MB`;
}

// A download button's second line: the build, then its size and version once
// the release has loaded.
export function downloadDetails(
  entry: DownloadEntry,
  release: ReleaseSummary | null,
): string {
  const size = release?.sizes[entry.platform];
  return [
    entry.choiceLabel,
    size !== undefined && formatSize(size),
    release && `v${release.version}`,
  ]
    .filter(Boolean)
    .join(" · ");
}

export function formatReleaseDate(value: string | null): string | null {
  if (!value) return null;
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(value));
}

export const GIT_FOR_WINDOWS_URL = "https://git-scm.com/downloads/win";

export const CHECKSUM_COMMANDS: {
  os: DesktopOs;
  label: string;
  command: string;
}[] = [
  { os: "macos", label: "macOS", command: "shasum -a 256 <file>" },
  {
    os: "windows",
    label: "Windows (PowerShell)",
    command: "Get-FileHash <file> -Algorithm SHA256",
  },
  { os: "linux", label: "Linux", command: "sha256sum <file>" },
];
