export type Platform = "macos" | "linux" | "windows";

declare global {
  interface Window {
    __LPM_PLATFORM__?: Platform;
  }
}

export function detectPlatform(
  userAgent: string,
  navigatorPlatform: string,
): Platform {
  const probe = `${navigatorPlatform} ${userAgent}`;
  if (/Windows|\bWin(32|64)\b/.test(probe)) return "windows";
  if (/Mac|iPhone|iPad|iPod|Darwin/.test(probe)) return "macos";
  return "linux";
}

function resolvePlatform(): Platform {
  if (typeof window === "undefined") return "macos";
  const forced = window.__LPM_PLATFORM__;
  if (forced === "macos" || forced === "linux" || forced === "windows") {
    return forced;
  }
  const nav = window.navigator;
  return detectPlatform(nav?.userAgent ?? "", nav?.platform ?? "");
}

export const platform: Platform = resolvePlatform();
export const isMac = platform === "macos";
export const isLinux = platform === "linux";
export const isWindows = platform === "windows";

export function applyPlatformClass(root: HTMLElement = document.documentElement) {
  root.classList.add(`platform-${platform}`);
  root.dataset.platform = platform;
}

export function fileManagerName(p: Platform = platform): string {
  if (p === "macos") return "Finder";
  if (p === "windows") return "File Explorer";
  return "Files";
}
