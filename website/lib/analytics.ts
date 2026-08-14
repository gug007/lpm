import { APP_STORE_URL, RELEASES_URL } from "@/lib/links";
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
  | "checksums"
  | "best-mac-hero"
  | "best-mac-cta"
  | "mac-devs-hero"
  | "mac-devs-cta"
  | "git-terminal-hero"
  | "git-terminal-cta"
  | "ssh-hero"
  | "ssh-cta"
  | "project-sidebar-hero"
  | "project-sidebar-cta"
  | "review-hero"
  | "review-cta"
  | "worktree-alt-hero"
  | "worktree-alt-cta"
  | "worktree-agents-hero"
  | "worktree-agents-cta"
  | "best-cc-hero"
  | "best-cc-cta"
  | "cc-accounts-hero"
  | "cc-accounts-cta"
  | "connect-agents-hero"
  | "connect-agents-cta"
  | "linux-host-hero"
  | "linux-host-cta"
  | "statusline-hero"
  | "statusline-cta"
  | "token-usage-hero"
  | "token-usage-cta"
  | "mobile-cta";

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
  | "home-cta"
  | "mac-hero"
  | "mac-cta"
  | "mac-devs-hero"
  | "mac-devs-cta"
  | "git-terminal-hero"
  | "git-terminal-cta"
  | "ssh-hero"
  | "ssh-cta"
  | "project-sidebar-cta"
  | "review-hero"
  | "review-cta"
  | "worktree-alt-cta"
  | "worktree-agents-cta"
  | "best-cc-hero"
  | "best-cc-cta"
  | "cc-accounts-hero"
  | "cc-accounts-cta"
  | "connect-agents-hero"
  | "connect-agents-cta"
  | "token-usage-cta"
  | "linux-host-cta"
  | "mobile-cta"
  | "vs-hero"
  | "vs-cta"
  | "download-releases"
  | "downloads-releases";

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

export type AppStoreSource = "mobile-hero" | "mobile-cta";

export function trackAppStoreVisit(source: AppStoreSource): void {
  if (typeof window === "undefined" || !window.gtag) return;
  window.gtag("event", "app_store_visit", {
    source,
    link_url: APP_STORE_URL,
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
