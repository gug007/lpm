import { RELEASES_URL } from "@/lib/links";
import type { MacDownloadPlatform } from "@/lib/use-platform";

declare global {
  interface Window {
    gtag?: (command: string, event: string, params?: Record<string, unknown>) => void;
  }
}

export type DownloadPlatform = MacDownloadPlatform;
export type DownloadSource =
  | "hero"
  | "downloads"
  | "project-sidebar-hero"
  | "project-sidebar-cta";

type TrackDownloadParams = {
  source: DownloadSource;
  platform: DownloadPlatform;
  href: string;
};

export function trackDownload({
  source,
  platform,
  href,
}: TrackDownloadParams): void {
  if (typeof window === "undefined" || !window.gtag) return;
  window.gtag("event", "app_download", {
    source,
    platform,
    download_placement: source,
    download_architecture: platform,
    link_url: href,
    file_name: new URL(href).pathname.split("/").pop(),
  });
}

export type GithubLinkSource =
  | "mac-hero"
  | "mac-cta"
  | "vs-hero"
  | "vs-cta"
  | "download-releases";

type TrackGithubVisitParams = {
  source: GithubLinkSource;
  href: string;
};

export function trackGithubVisit({
  source,
  href,
}: TrackGithubVisitParams): void {
  if (typeof window === "undefined" || !window.gtag) return;
  window.gtag("event", "github_visit", {
    source,
    link_url: href,
    // The releases page serves the same .dmg as the download buttons, so this
    // link is a real download path that never reaches trackDownload.
    is_release_path: href.startsWith(RELEASES_URL),
  });
}

// The project-sidebar walkthrough reports which steps a visitor actually
// reaches. Fixed values only — never a project name, width, or free text.
export type SidebarWalkthroughAction =
  | "start"
  | "organize"
  | "complete"
  | "select"
  | "resize"
  | "collapse";

export function trackSidebarWalkthrough(
  action: SidebarWalkthroughAction,
): void {
  if (typeof window === "undefined" || !window.gtag) return;
  window.gtag("event", "sidebar_walkthrough", { action });
}
