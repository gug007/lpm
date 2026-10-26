import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const websiteDir = dirname(dirname(fileURLToPath(import.meta.url)));
const repoDir = dirname(websiteDir);
const releasesFile = join(websiteDir, "app", "changelog", "_components", "releases.json");

const run = (cmd, args) =>
  execFileSync(cmd, args, { cwd: repoDir, encoding: "utf8" }).trim();

// Newest first. GitHub owns each release's date and beta flag; the notes are ours.
const published = JSON.parse(
  run("gh", [
    "release",
    "list",
    "--exclude-drafts",
    "--limit",
    "100",
    "--json",
    "tagName,publishedAt,isPrerelease",
  ]),
);

const entries = new Map(
  JSON.parse(readFileSync(releasesFile, "utf8")).map((r) => [r.version, r]),
);

// The website, the phone apps and the share relay ship on their own.
const APP_PATHS = [".", ":!website", ":!mobile", ":!relay"];

const added = [];
published.forEach((release, i) => {
  const version = release.tagName.replace(/^v/, "");
  const notes = entries.get(version)?.notes;
  if (!entries.has(version)) {
    const previous = published[i + 1]?.tagName;
    const range = previous ? `${previous}..${release.tagName}` : release.tagName;
    added.push({
      version,
      commits: run("git", ["log", "--no-merges", "--format=- %s", range, "--", ...APP_PATHS]),
    });
  }
  entries.set(version, {
    version,
    date: release.publishedAt.slice(0, 10),
    ...(release.isPrerelease ? { beta: true } : {}),
    ...(notes ? { notes } : {}),
  });
});

const newestFirst = (a, b) =>
  b.date.localeCompare(a.date) ||
  b.version.localeCompare(a.version, "en", { numeric: true });

writeFileSync(
  releasesFile,
  `${JSON.stringify([...entries.values()].sort(newestFirst), null, 2)}\n`,
);

if (added.length === 0) {
  console.log("Every published release is in the changelog.");
} else {
  console.log(`Added ${added.length} release(s). Write a short "notes" line for each:\n`);
  for (const { version, commits } of added) {
    console.log(`v${version}\n${commits || "- (no app changes)"}\n`);
  }
}
