import type { Release } from "./changelog-days";
import { fetchAllReleases } from "./github-stats";
import history from "./changelog.json";

const HISTORY = new Map<string, Release>(history.map((r) => [r.version, r]));

const newestFirst = (a: Release, b: Release) =>
  b.date.localeCompare(a.date) ||
  b.version.localeCompare(a.version, "en", { numeric: true });

// GitHub owns each release's date and beta flag, and the notes of releases newer
// than changelog.json, which release.sh has Claude write. changelog.json keeps
// the older, hand-written notes and stands in when GitHub can't be reached.
export async function getChangelogReleases(): Promise<Release[]> {
  const published = await fetchAllReleases().catch(() => null);
  const releases = new Map(HISTORY);
  for (const release of published ?? []) {
    if (!release.published_at) continue;
    const version = release.tag_name.replace(/^v/, "");
    const known = HISTORY.get(version);
    releases.set(version, {
      version,
      date: release.published_at.slice(0, 10),
      beta: release.prerelease,
      notes: known ? known.notes : release.body?.trim() || undefined,
    });
  }
  return [...releases.values()].sort(newestFirst);
}
