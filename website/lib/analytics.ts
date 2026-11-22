import type { DownloadPlatform } from "@/lib/downloads";
import { APP_STORE_URL, PLAY_STORE_URL, RELEASES_URL } from "@/lib/links";

declare global {
  interface Window {
    gtag?: (command: string, event: string, params?: Record<string, unknown>) => void;
  }
}

export type { DownloadPlatform } from "@/lib/downloads";
export type DownloadSource =
  | "hero"
  | "demo-done"
  | "home-cta"
  | "lessons-cta"
  | "lessons-latest"
  | "lesson-cta"
  | "docs-latest"
  | "changelog-latest"
  | "changelog-footer"
  | "stats-footer"
  | "config-cta"
  | "docs-install"
  | "downloads"
  | "checksums"
  | "best-mac-hero"
  | "best-mac-cta"
  | "mac-devs-hero"
  | "mac-devs-cta"
  | "windows-devs-hero"
  | "windows-devs-cta"
  | "linux-devs-hero"
  | "linux-devs-cta"
  | "git-terminal-hero"
  | "git-terminal-cta"
  | "ssh-hero"
  | "ssh-cta"
  | "project-sidebar-hero"
  | "project-sidebar-cta"
  | "review-hero"
  | "review-cta"
  | "worktree-alt-hero"
  | "worktree-alt-list"
  | "worktree-alt-mid"
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
  | "mac-mini-hero"
  | "mac-mini-cta"
  | "statusline-hero"
  | "statusline-mid"
  | "statusline-cta"
  | "skills-hero"
  | "skills-cta"
  | "token-usage-hero"
  | "token-usage-mid"
  | "token-usage-cta"
  | "limit-calculator-cta"
  | "features-hero"
  | "features-cta"
  | "automations-hero"
  | "automations-cta"
  | "parallel-hero"
  | "parallel-cta"
  | "share-hero"
  | "share-cta"
  | "port-cta"
  | "not-found"
  | "join"
  | "mobile-hero"
  | "mobile-cta"
  | "vs-hub-hero"
  | "vs-hub-cta"
  | "vs-tmux-hero"
  | "vs-tmux-cta"
  | "vs-iterm2-hero"
  | "vs-iterm2-cta"
  | "vs-cmux-hero"
  | "vs-cmux-cta"
  | "vs-compose-hero"
  | "vs-compose-cta"
  | "vs-foreman-hero"
  | "vs-foreman-cta"
  | "vs-overmind-hero"
  | "vs-overmind-cta"
  | "vs-pm2-hero"
  | "vs-pm2-cta";

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
  // Never send a param named `source`: GA4 reads it as the session's traffic
  // source and splits the visit into an "Unassigned" session.
  window.gtag("event", "app_download", {
    platform,
    download_placement: source,
    download_architecture: platform,
    link_url: href,
    file_name: new URL(href).pathname.split("/").pop(),
  });
}

export type GithubLinkSource =
  | "home-cta"
  | "home-contributors"
  | "mac-hero"
  | "mac-cta"
  | "mac-devs-hero"
  | "mac-devs-cta"
  | "windows-devs-hero"
  | "windows-devs-cta"
  | "linux-devs-hero"
  | "linux-devs-cta"
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
  | "features-cta"
  | "automations-cta"
  | "parallel-cta"
  | "share-hero"
  | "share-cta"
  | "port-cta"
  | "linux-host-cta"
  | "mac-mini-cta"
  | "mobile-cta"
  | "vs-hero"
  | "vs-cta"
  | "download-releases"
  | "downloads-releases"
  | "download-star";

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
    placement: source,
    link_url: href,
    // The releases page serves the same installers as the download buttons, so
    // this link is a real download path that never reaches trackDownload.
    is_release_path: href.startsWith(RELEASES_URL),
  });
}

export type AppStoreSource =
  | "mobile-hero"
  | "mobile-cta"
  | "home-devices"
  | "home-hero"
  | "features"
  | "automations";

export function trackAppStoreVisit(source: AppStoreSource): void {
  if (typeof window === "undefined" || !window.gtag) return;
  window.gtag("event", "app_store_visit", {
    placement: source,
    link_url: APP_STORE_URL,
  });
}

export function trackPlayStoreVisit(source: AppStoreSource): void {
  if (typeof window === "undefined" || !window.gtag) return;
  window.gtag("event", "play_store_visit", {
    placement: source,
    link_url: PLAY_STORE_URL,
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

export type TokenUsageDemoAction =
  | "pace-preset"
  | "pace-window"
  | "pace-slider"
  | "pace-reset-link"
  | "reset-scenario"
  | "reset-schedule"
  | "reset-advance"
  | "stats-period"
  | "stats-provider"
  | "stats-mode"
  | "stats-sort"
  | "stats-session"
  | "stats-chart";

export function trackTokenUsageDemo(action: TokenUsageDemoAction): void {
  if (typeof window === "undefined" || !window.gtag) return;
  window.gtag("event", "token_usage_demo", { action });
}

// "watch" is choosing the video over a slow load.
export type DemoAction = "window" | "step" | "replay" | "watch";

const demoReported = new Set<string>();

// Once per action on each page, however often the visitor repeats it.
export function trackDemo(action: DemoAction): void {
  if (typeof window === "undefined" || !window.gtag) return;
  const key = `${window.location.pathname} ${action}`;
  if (demoReported.has(key)) return;
  demoReported.add(key);
  window.gtag("event", "app_demo", { action });
}

// Where a sent link leads: the download section, or the page it was sent
// from, for a demo the phone can't run.
export type SendTarget = "download" | "page";

// "dismissed" is the share sheet closed without sending.
export type SendLinkResult = "shared" | "dismissed" | "copied" | "failed";

export function trackSendLink(target: SendTarget, result: SendLinkResult): void {
  if (typeof window === "undefined" || !window.gtag) return;
  window.gtag("event", "send_link", { link_target: target, result });
}
