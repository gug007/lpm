import { CHANGELOG_PATH, REPO_URL } from "./links";

export type Release = {
  version: string;
  date: string;
  beta?: boolean;
  notes?: string;
};

export type ChangelogDay = {
  date: string;
  releases: Release[];
};

export type ChangelogMonth = {
  month: string;
  releases: number;
  // Null for months older than RECENT_DAYS: they load when opened.
  days: ChangelogDay[] | null;
};

export type ChangelogTopic = {
  id: string;
  label: string;
  pattern: RegExp;
};

const RECENT_DAYS = 30;
const DAY_MS = 86_400_000;

export const CHANGELOG_DATA_PATH = `${CHANGELOG_PATH}/data`;

export const TOPICS: ChangelogTopic[] = [
  { id: "iphone", label: "iPhone", pattern: /\b(iPhone|iPad|phone|lpm Link)\b/i },
  { id: "agents", label: "Claude Code & Codex", pattern: /\b(Claude|Codex|agents?)\b/i },
  { id: "automations", label: "Automations", pattern: /\bautomations?\b/i },
  { id: "git", label: "Git", pattern: /\b(Git|commits?|branch(es)?|merge|worktrees?|pull requests?|diffs?)\b/i },
  { id: "cli", label: "CLI", pattern: /\bCLI\b|`lpm\b/ },
  { id: "platforms", label: "Windows & Linux", pattern: /\b(Windows|Linux)\b/ },
];

const monthFmt = new Intl.DateTimeFormat("en-US", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

// Releases cut on the same day read as one entry under the newest of them.
export function changelogDays(releases: Release[]): ChangelogDay[] {
  return [...Map.groupBy(releases, (release) => release.date)].map(
    ([date, dayReleases]) => ({ date, releases: dayReleases }),
  );
}

export function changelogMonths(days: ChangelogDay[]): ChangelogMonth[] {
  const cutoff = Date.parse(days[0].date) - RECENT_DAYS * DAY_MS;
  return [...daysByMonth(days)].map(([month, monthDays]) => ({
    month,
    releases: releaseCount(monthDays),
    days: Date.parse(monthDays[0].date) >= cutoff ? monthDays : null,
  }));
}

export const daysByMonth = (days: ChangelogDay[]): Map<string, ChangelogDay[]> =>
  Map.groupBy(days, (day) => monthOf(day.date));

export const releaseCount = (days: ChangelogDay[]): number =>
  days.reduce((sum, day) => sum + day.releases.length, 0);

export const releasesText = (count: number): string =>
  `${count} ${count === 1 ? "release" : "releases"}`;

export const monthOf = (date: string): string => date.slice(0, 7);

export const monthLabel = (month: string): string =>
  monthFmt.format(new Date(`${month}-01T00:00:00Z`));

export const monthPath = (month: string): string => `${CHANGELOG_PATH}/${month}`;

export function releaseTagUrl(version: string): string {
  return `${REPO_URL}/releases/tag/v${version}`;
}

export function dayMatches(
  day: ChangelogDay,
  query: string,
  topic: ChangelogTopic | null,
): boolean {
  const text = day.releases
    .map(({ version, notes }) => `v${version} ${notes ?? ""}`)
    .join(" ");
  if (topic && !topic.pattern.test(text)) return false;
  return !query || text.toLowerCase().includes(query.toLowerCase());
}
