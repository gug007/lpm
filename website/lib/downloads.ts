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

export function isBetaOs(os: DesktopOs): boolean {
  return os !== "macos";
}

export const GIT_FOR_WINDOWS_URL = "https://git-scm.com/downloads/win";
