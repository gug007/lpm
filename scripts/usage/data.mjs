// What the Usage button shows, read from the ping Worker's database (ping/).
//   node scripts/usage/data.mjs            the page's data, as JSON
//   node scripts/usage/data.mjs --label    desktop computers seen today
// Add --local to read the database `npm run dev` in ping/ writes to.
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { build } from "./model.mjs";
import { queries, todayQuery } from "./queries.mjs";

const root = join(import.meta.dirname, "..", "..");
const ping = join(root, "ping");
const wrangler = join(ping, "node_modules", "wrangler", "bin", "wrangler.js");
const where = process.argv.includes("--local") ? "--local" : "--remote";
const today = new Date().toISOString().slice(0, 10);

function fail(message) {
  console.error(message);
  process.exit(1);
}

function query(sqls) {
  if (!existsSync(wrangler)) fail("wrangler isn't installed: run npm install in ping/.");
  try {
    const out = execFileSync(
      process.execPath,
      [wrangler, "d1", "execute", "lpm-ping", where, "--json", "--command", sqls.join(";\n")],
      { cwd: ping, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 14000, maxBuffer: 32 * 1024 * 1024 },
    );
    return JSON.parse(out).map((result) => result.results);
  } catch (error) {
    const said = `${error.stdout ?? ""}\n${error.stderr ?? ""}`;
    const line = said.split("\n").map((l) => l.replace(/^[✘▲\s]*(\[ERROR\]\s*)?/, "").trim()).find(Boolean);
    fail(/auth|login|token/i.test(said) ? "wrangler isn't signed in: run npx wrangler login in ping/." : line || String(error.message));
  }
}

function releases() {
  try {
    const tags = execFileSync("git", ["for-each-ref", "--format=%(refname:short) %(creatordate:unix)", "refs/tags/v*"], { cwd: root, encoding: "utf8" });
    return tags.split("\n").flatMap((line) => {
      const [, version, at] = /^v(\d+\.\d+\.\d+) (\d+)$/.exec(line) ?? [];
      return version ? [{ version, day: new Date(at * 1000).toISOString().slice(0, 10) }] : [];
    });
  } catch {
    return [];
  }
}

if (process.argv.includes("--label")) {
  const [[row]] = query([todayQuery(today)]);
  console.log(`${row.n} today`);
  process.exit(0);
}

const sql = queries(today);
const results = query(Object.values(sql));
const read = Object.fromEntries(Object.keys(sql).map((name, i) => [name, results[i]]));
console.log(JSON.stringify(build({ today, releases: releases(), ...read })));
