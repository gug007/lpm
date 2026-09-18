import type { ChangedFile, DiffLine } from "../projects";
import { AUTH_SERVICE } from "./auth-service";
import { DOCS_SITE } from "./docs-site";
import { generateContent } from "./generate";
import { ML_PIPELINE } from "./ml-pipeline";
import { MOBILE_APP } from "./mobile-app";
import { SAAS_APP } from "./saas-app";
import type { ProjectFiles } from "./types";

export type { ProjectFiles };

// Matches DEFAULT_LISTING in interactive-terminal.tsx, so a project the visitor
// adds answers `ls` and the Files tab with the same names.
const FALLBACK: ProjectFiles = {
  paths: ["scripts/dev.sh", "src/index.ts", "tests/index.test.ts"],
  content: {
    "README.md": `# A new project

lpm found this folder and read its package.json. Everything below is the
starting point it wrote — edit it, or replace it with your own.

## Running it

\`\`\`bash
npm install
npm run dev
\`\`\`
`,
    "package.json": `{
  "name": "new-project",
  "private": true,
  "version": "0.1.0",
  "scripts": {
    "dev": "node src/index.ts",
    "test": "node --test tests/"
  }
}
`,
  },
};

const BY_PROJECT: Record<string, ProjectFiles> = {
  "saas-app": SAAS_APP,
  "auth-service": AUTH_SERVICE,
  "docs-site": DOCS_SITE,
  "ml-pipeline": ML_PIPELINE,
  "mobile-app": MOBILE_APP,
};

// A duplicate is `<source>-2` and a worktree `<source>-wt`, either of which can
// pick up a further `-2`. They are copies of the same tree, so they answer the
// Files tab the way `ls` does — from the project they were cut from.
const sourceOf = (projectName: string) => projectName.replace(/(?:-(?:\d+|wt))+$/, "");

const YMD = (() => {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
})();

// The one migration `bin/rails db:migrate` reports as pending, stamped from the
// same day the action's output is.
const DATED: Record<string, string[]> = {
  "saas-app": [`db/migrate/${YMD}090100_add_index_to_users.rb`],
};

export interface ProjectTree {
  paths: string[];
  read: (path: string) => string;
}

// Rebuilds the file as HEAD has it, by putting each hunk's "-" side back. A
// copy declares a clean working tree, so it must not show edits the source has
// not committed yet.
function atHead(content: string, diff: readonly DiffLine[]): string {
  const lines = content.split("\n");
  let hunkAdded: string[] = [];
  let hunkRemoved: string[] = [];
  const flush = () => {
    if (hunkAdded.length === 0) return;
    const at = indexOfBlock(lines, hunkAdded);
    if (at >= 0) lines.splice(at, hunkAdded.length, ...hunkRemoved);
    hunkAdded = [];
    hunkRemoved = [];
  };
  for (const line of diff) {
    if (line.t === "hunk") {
      flush();
      continue;
    }
    const text = line.text.slice(1);
    if (line.t !== "del") hunkAdded.push(text);
    if (line.t !== "add") hunkRemoved.push(text);
  }
  flush();
  return lines.join("\n");
}

function indexOfBlock(lines: readonly string[], block: readonly string[]): number {
  for (let i = 0; i + block.length <= lines.length; i++) {
    if (block.every((line, j) => lines[i + j] === line)) return i;
  }
  return -1;
}

/** The project's tree, and a reader for any path in it.
 *
 *  A duplicate or a worktree is a fresh copy of a clean tree — it declares no
 *  uncommitted work, so it must not show edits the source has not committed:
 *  files added this session are missing from it, and modified ones read as
 *  HEAD has them. The source project itself always shows its working tree;
 *  committing clears the git decorations, not the edits. */
export function projectTree(
  projectName: string,
  changed: readonly ChangedFile[],
): ProjectTree {
  const source = sourceOf(projectName);
  const isCopy = source !== projectName;
  const files = BY_PROJECT[source] ?? FALLBACK;
  const named = Object.keys(files.content);
  const diffs = new Map(changed.map((file) => [file.path, file]));
  const byPath = new Map(Object.entries(files.content));

  const all = [...named, ...files.paths, ...(DATED[source] ?? [])];
  const paths = isCopy
    ? all.filter((path) => diffs.get(path)?.status !== "added")
    : all;

  return {
    paths,
    read(path: string): string {
      const content = byPath.get(path) ?? generateContent(path);
      const file = isCopy ? diffs.get(path) : undefined;
      return file?.status === "modified" ? atHead(content, file.diff) : content;
    },
  };
}
