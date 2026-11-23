// What the new.js of lesson and of short share: the slug, the demo projects a
// lesson starts on, and the three files it is made of.
const fs = require("fs");
const path = require("path");

const PORTS = { storefront: 5173, "client-portal": 3000, "docs-site": 4321, "auth-service": 4000 };

const slugOf = (title) =>
  title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 6)
    .join("-");

const projectsOf = (list = "storefront") => list.split(",").map((p) => p.trim()).filter(Boolean);

// The kit a beats.js works with and the setup hook that seeds `projects`.
const kitLine = `const kit = require(${JSON.stringify(path.join(__dirname, "kit"))});`;
function setupBeat(projects) {
  const seed = projects.map((name) => `    kit.writeProject(lpmDir, workspace, { name: ${JSON.stringify(name)}, port: ${PORTS[name] || 3000} });`);
  return `  async setup({ lpmDir, workspace, settings }) {
    kit.neutralShell(lpmDir, workspace);
${seed.join("\n")}
    settings({ defaultProjectDirectory: \`\${workspace}/Projects\`, projectOrder: ${JSON.stringify(projects)} });
  },`;
}

function refuseExisting(dir, force) {
  if (!fs.existsSync(dir) || force) return;
  console.error(`${dir} exists; pass --force to rewrite its lesson.json, beats.js and take.sh`);
  process.exit(1);
}

// `skill` is the folder of the skill whose take.sh records the lesson.
function writeLesson(dir, { lesson, beats, skill }) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "lesson.json"), `${JSON.stringify(lesson, null, 2)}\n`);
  fs.writeFileSync(path.join(dir, "beats.js"), beats);
  fs.writeFileSync(path.join(dir, "take.sh"), `#!/bin/sh\nexec ${JSON.stringify(path.join(skill, "scripts", "take.sh"))} "$(dirname "$0")" "$@"\n`, { mode: 0o755 });
}

module.exports = { slugOf, projectsOf, kitLine, setupBeat, refuseExisting, writeLesson };
