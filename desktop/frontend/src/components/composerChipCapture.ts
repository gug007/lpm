// Reading a chip's source again from its card: more or fewer log lines, a
// fresh capture, a narrower diff, a commit without its patch, a pull request
// without its description or discussion. Each returns the new text with what
// it is, for the chip to stand for instead.

import { GetServiceLogs } from "../../bridge/commands";
import { commitBlock, diffBlock, fencedBlock, pullRequestBlock } from "../mentionGitCapture";
import type { MentionItem } from "../mentions";
import { basename } from "../path";
import { plural } from "../projectArchive";
import { useAppStore } from "../store/app";
import { captureInteractivePaneLog } from "./InteractivePane";
import {
  blockBody,
  blockSpec,
  commitInfo,
  computerSpec,
  lineCount,
  logSpec,
  onlyErrorLines,
  parseBlock,
  threadDetail,
  threadInfo,
  trimLogBody,
  type Captured,
  type ChipSource,
  type ChipSpec,
} from "./composerChips";

export interface ChipEnv {
  projectName: string;
  cwd: string;
}

const PASTE_CHIP_MIN_LINES = 20;
const QUOTE_CHIP_MIN_LINES = 6;

const now = () => Math.floor(Date.now() / 1000);

export function terminalChip(label: string, body: string, source: ChipSource): Captured {
  return {
    text: fencedBlock("terminal output", body),
    spec: { ...logSpec("terminal", label, body), source: { ...source, capturedAt: now() } },
  };
}

export function serviceChip(service: string, body: string, source: ChipSource): Captured {
  return {
    text: fencedBlock(`${service} service logs`, body),
    spec: { ...logSpec("service", service, body), source: { ...source, capturedAt: now() } },
  };
}

// A paste long enough to stand as a chip. A shorter one stays text.
export function pasteChip(text: string): Captured | null {
  const lines = lineCount(text.replace(/\n+$/, ""));
  return lines > PASTE_CHIP_MIN_LINES ? { text, spec: { kind: "paste", label: "Pasted text", detail: plural(lines, "line") } } : null;
}

export function quoteChip(text: string): Captured | null {
  const lines = lineCount(text);
  return lines >= QUOTE_CHIP_MIN_LINES ? { text, spec: { kind: "quote", label: "Quote", detail: plural(lines, "line") } } : null;
}

// The chip an "@" pick that inserts a short reference becomes: a file, folder,
// changed file, branch, or a folder on another computer.
export function referenceChip(item: MentionItem): Captured | null {
  switch (item.kind) {
    case "file":
    case "changed": {
      const slash = item.insert.lastIndexOf("/");
      return {
        text: `@${item.insert}`,
        spec: {
          kind: "file",
          label: basename(item.insert),
          detail: slash > 0 ? item.insert.slice(0, slash) : undefined,
          source: { path: item.insert },
        },
      };
    }
    case "dir": {
      const path = item.insert.replace(/\/+$/, "");
      return { text: `@${item.insert}`, spec: { kind: "dir", label: path, source: { path } } };
    }
    case "branch":
      return { text: `@${item.insert}`, spec: { kind: "branch", label: item.insert } };
    case "computer": {
      const place = item.detail ?? "";
      const at = place.indexOf(":");
      if (at === -1) return null;
      return { text: item.insert, spec: computerSpec(place.slice(0, at), place.slice(at + 1), item.label) };
    }
  }
  return null;
}

export function gitChip(text: string): Captured | null {
  const block = parseBlock(`${text.trimEnd()}\n`);
  const spec = block && blockSpec(block.heading, block.body);
  return spec ? { text, spec } : null;
}

export function readTerminal(spec: ChipSpec, lines: number): Captured {
  const source = spec.source ?? {};
  // The capture's limit is scrollback beyond the visible screen, so keep the
  // last `lines` of it to give exactly the count picked.
  const body = trimLogBody(captureInteractivePaneLog(source.terminalId ?? "", lines))
    .split("\n")
    .slice(-lines)
    .join("\n");
  if (!body) throw new Error("That terminal has no output now");
  return terminalChip(spec.label, body, { ...source, lines });
}

// The running service's pane, for logs recognized in a draft by name alone.
function paneIndexOf(projectName: string, service: string): number | undefined {
  const project = useAppStore.getState().projects.find((p) => p.name === projectName);
  const at = project?.services.findIndex((s) => s.name === service) ?? -1;
  return at >= 0 ? at : undefined;
}

export async function serviceLogBody(projectName: string, pane: number, lines: number): Promise<string> {
  const out = await GetServiceLogs(projectName, pane, lines);
  return typeof out === "string" ? trimLogBody(out) : "";
}

export async function readService(env: ChipEnv, spec: ChipSpec, lines: number, onlyErrors: boolean): Promise<Captured> {
  const source = spec.source ?? {};
  const service = spec.label;
  const pane = paneIndexOf(env.projectName, service) ?? source.paneIndex;
  if (pane === undefined) throw new Error(`${service} isn't running`);
  const all = await serviceLogBody(env.projectName, pane, lines);
  const body = onlyErrors ? onlyErrorLines(all) : all;
  if (!body) throw new Error(onlyErrors ? "No errors or warnings in these lines" : `No logs for ${service}`);
  return serviceChip(service, body, { ...source, paneIndex: pane, lines, onlyErrors });
}

// `files` out of `all`, the ones the chip had to choose from.
export async function readDiff(env: ChipEnv, spec: ChipSpec, files: string[], all: string[]): Promise<Captured> {
  const text = await diffBlock(env.cwd, files);
  if (!text) throw new Error("No uncommitted changes in those files");
  const detail = files.length === all.length ? plural(files.length, "file") : `${files.length} of ${plural(all.length, "file")}`;
  return { text, spec: { ...spec, detail, source: { ...spec.source, files, allFiles: all } } };
}

export async function readCommit(env: ChipEnv, spec: ChipSpec, withDiff: boolean): Promise<Captured> {
  const sha = spec.source?.sha ?? spec.label;
  const text = await commitBlock(env.cwd, sha, withDiff);
  return { text, spec: { ...spec, detail: commitInfo(blockBody(text)).subject, source: { ...spec.source, sha, withDiff } } };
}

export async function readPullRequest(env: ChipEnv, spec: ChipSpec, description: boolean, discussion: boolean): Promise<Captured> {
  const text = await pullRequestBlock(env.cwd, { description, discussion });
  const detail = threadDetail(threadInfo(blockBody(text)), discussion);
  return { text, spec: { ...spec, detail, source: { ...spec.source, description, discussion } } };
}
