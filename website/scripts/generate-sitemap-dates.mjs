import { execFileSync } from "node:child_process";
import { readdirSync, writeFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const websiteDir = dirname(dirname(fileURLToPath(import.meta.url)));
const appDir = join(websiteDir, "app");
const outFile = join(websiteDir, "lib", "sitemap-dates.json");

const git = (args) =>
  execFileSync("git", args, { cwd: websiteDir, encoding: "utf8" }).trim();

const routeDirs = [];
const walk = (dir) => {
  const entries = readdirSync(dir, { withFileTypes: true });
  if (entries.some((entry) => entry.isFile() && entry.name === "page.tsx")) {
    routeDirs.push(dir);
  }
  for (const entry of entries) {
    if (entry.isDirectory()) walk(join(dir, entry.name));
  }
};
walk(appDir);

const routeFor = (dir) => {
  const rel = relative(appDir, dir);
  return rel === "" ? "/" : `/${rel.split(sep).join("/")}`;
};

const hasRouteWithin = (dir) =>
  readdirSync(dir, { withFileTypes: true }).some((entry) =>
    entry.isFile()
      ? entry.name === "page.tsx"
      : hasRouteWithin(join(dir, entry.name)),
  );

// Nested route dirs are excluded so e.g. /vs/* edits don't restamp /vs.
const contentPathsFor = (dir) => {
  if (dir === appDir) {
    return [join(appDir, "page.tsx"), join(websiteDir, "components", "home")];
  }
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() || !hasRouteWithin(join(dir, entry.name)))
    .map((entry) => join(dir, entry.name));
};

// Pages that render their own "Last updated" line keep that date.
const OVERRIDES = {
  "/privacy": "2026-08-13",
  "/terms": "2026-04-17",
};

const now = new Date();
const today = [
  now.getFullYear(),
  String(now.getMonth() + 1).padStart(2, "0"),
  String(now.getDate()).padStart(2, "0"),
].join("-");

const dateFor = (dir) => {
  const paths = contentPathsFor(dir).map((p) => relative(websiteDir, p));
  if (git(["status", "--porcelain", "--", ...paths]) !== "") return today;
  const committed = git(["log", "-1", "--format=%cs", "--", ...paths]);
  if (!committed) {
    throw new Error(`No git history for sitemap route paths: ${paths.join(", ")}`);
  }
  return committed;
};

const dates = Object.fromEntries(
  routeDirs
    .map((dir) => {
      const route = routeFor(dir);
      return [route, OVERRIDES[route] ?? dateFor(dir)];
    })
    .sort(([a], [b]) => a.localeCompare(b)),
);

writeFileSync(outFile, `${JSON.stringify(dates, null, 2)}\n`);
console.log(
  `Wrote ${Object.keys(dates).length} route dates to ${relative(websiteDir, outFile)}`,
);
