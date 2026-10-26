import { REPO_URL } from "@/lib/links";
import releases from "./releases.json";

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

const RELEASES: Release[] = releases;

// releases.json is newest first, so each day's first release is its latest and
// the day reads as one entry under that version.
export const CHANGELOG_DAYS: ChangelogDay[] = [
  ...Map.groupBy(RELEASES, (release) => release.date),
].map(([date, dayReleases]) => ({ date, releases: dayReleases }));

export const RELEASE_COUNT = RELEASES.length;

export function releaseTagUrl(version: string): string {
  return `${REPO_URL}/releases/tag/v${version}`;
}
