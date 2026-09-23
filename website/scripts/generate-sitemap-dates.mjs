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

// Drafts, research notes and social cards don't change what a page says.
const isContent = (name) =>
  !name.endsWith(".md") &&
  !name.startsWith("opengraph-image") &&
  name !== "_research";

// Shared components whose copy renders on a route as if it were its own.
const SHARED = [{ prefix: "/vs/", paths: [join(websiteDir, "components", "vs")] }];

// Nested route dirs are excluded so e.g. /vs/* edits don't restamp /vs.
const contentPathsFor = (dir) => {
  if (dir === appDir) {
    return [join(appDir, "page.tsx"), join(websiteDir, "components", "home")];
  }
  const route = routeFor(dir);
  const shared = SHARED.filter(({ prefix }) => route.startsWith(prefix)).flatMap(
    ({ paths }) => paths,
  );
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => isContent(entry.name))
    .filter((entry) => entry.isFile() || !hasRouteWithin(join(dir, entry.name)))
    .map((entry) => join(dir, entry.name))
    .concat(shared);
};

// Pages that render their own "Last updated" line keep that date.
const OVERRIDES = {
  "/privacy": "2026-09-23",
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
