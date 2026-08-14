import type { AgentStep } from "./agent-script";

type ToolStep = Extract<AgentStep, { kind: "tool" }>;

// Script steps are written once, in neutral terms ("Grep", "4 matches"), and
// translated here into whatever each CLI actually prints for that operation —
// Claude Code says `Search(pattern: "…") ⎿ Found 4 matches`, Codex says
// `• Explored └ Search …`.

const COUNT = /^(\d[\d,]*)\s+\w+$/;
const DIFF = /^\+(\d+)(?:\s+-(\d+))?$/;

function basename(path: string): string {
  const slash = path.lastIndexOf("/");
  return slash === -1 ? path : path.slice(slash + 1);
}

function globRoot(pattern: string): string {
  const dir = pattern
    .split("/")
    .filter((segment) => !segment.includes("*"))
    .join("/");
  return dir || ".";
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

export type ClaudeTool = { name: string; arg: string; result: string };

function claudeEdit(path: string, result: string): string {
  const diff = DIFF.exec(result);
  if (!diff) return result;
  const added = Number(diff[1]);
  const removed = Number(diff[2] ?? 0);
  const parts = [plural(added, "addition")];
  if (removed > 0) parts.push(plural(removed, "removal"));
  return `Updated ${basename(path)} with ${parts.join(" and ")}`;
}

function claudeWrite(path: string, result: string): string {
  const diff = DIFF.exec(result);
  if (!diff) return result;
  if (diff[2]) return claudeEdit(path, result);
  return `Wrote ${plural(Number(diff[1]), "line")} to ${basename(path)}`;
}

export function claudeTool(step: ToolStep): ClaudeTool {
  const { label, arg, result } = step;
  switch (label) {
    case "Read":
      return { name: "Read", arg, result: COUNT.test(result) ? `Read ${result}` : result };
    case "Grep":
    case "Glob":
      return {
        name: "Search",
        arg: `pattern: "${arg}"`,
        result: COUNT.test(result) ? `Found ${result}` : result,
      };
    case "Edit":
      return { name: "Update", arg, result: claudeEdit(arg, result) };
    case "Write":
      return { name: "Write", arg, result: claudeWrite(arg, result) };
    default:
      return { name: label, arg, result };
  }
}

export type CodexTool =
  | { kind: "explored"; detail: string }
  | { kind: "ran"; head: string; detail: string }
  | { kind: "edited"; head: string; tag: string };

export function codexTool(step: ToolStep): CodexTool {
  const { label, arg, result } = step;
  switch (label) {
    case "Read":
      return { kind: "explored", detail: `Read ${basename(arg)}` };
    case "Grep":
      return { kind: "explored", detail: `Search ${arg}` };
    case "Glob":
      return { kind: "explored", detail: `List ${globRoot(arg)}` };
    case "Edit":
      return { kind: "edited", head: `Edited ${basename(arg)}`, tag: codexTag(result) };
    case "Write":
      return { kind: "edited", head: `Added ${basename(arg)}`, tag: codexTag(result) };
    default:
      return { kind: "ran", head: arg, detail: result };
  }
}

function codexTag(result: string): string {
  return DIFF.test(result) ? result : "";
}

// Codex renders the verb of an explored line in its accent colour and leaves
// the target plain; splitting here keeps that markup out of the component.
export function splitVerb(detail: string): [string, string] {
  const space = detail.indexOf(" ");
  return space === -1 ? [detail, ""] : [detail.slice(0, space), detail.slice(space + 1)];
}
