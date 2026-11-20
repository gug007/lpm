// Active computers from the ping database, as tables.
//   npm run report               the deployed database
//   npm run report -- --local    the one `npm run dev` writes to
import { execFileSync } from "node:child_process";
import { reports } from "../src/queries.ts";

const where = process.argv.includes("--local") ? "--local" : "--remote";
const all = Object.entries(reports(new Date().toISOString().slice(0, 10)));
const out = execFileSync(
  "npx",
  ["wrangler", "d1", "execute", "lpm-ping", where, "--json", "--command", all.map(([, sql]) => sql).join(";\n")],
  { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] },
);

JSON.parse(out).forEach(({ results }, i) => {
  console.log(`\n${all[i][0]}`);
  if (results.length) console.table(results);
  else console.log("  (none yet)");
});
