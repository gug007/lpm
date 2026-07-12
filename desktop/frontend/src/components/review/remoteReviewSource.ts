import { PeerSend } from "../../../bridge/commands";
import { peerRequest, nextReqId } from "../../store/peerRequest";
import type { PeerFrame } from "../../store/peers";
import type { ReviewMode, ReviewSource, FileDiffResult } from "./reviewSource";

export interface RemoteGitSummary {
  isRepo: boolean;
  branch: string;
  detached: boolean;
  hasUpstream: boolean;
  ahead: number;
  behind: number;
  defaultBranch: string;
  ghCli: boolean;
  files: { path: string; status: string; staged: boolean }[];
}

const SUMMARY_TIMEOUT = 15000;
const DIFFS_TIMEOUT = 20000;
const SHIP_TIMEOUT = 60000; // push/pull/PR/AI are network/AI-bound

function match(t: string, project: string, extra?: (f: PeerFrame) => boolean) {
  return (f: PeerFrame) => f.t === t && f.project === project && (!extra || extra(f));
}

function ensureOk(reply: PeerFrame): PeerFrame {
  if (reply.ok === false) throw new Error((reply.error as string) || "That didn't work on the other Mac.");
  return reply;
}

// Read a remote project's changed files + branch summary. Backed by the `git`
// message; shape mirrors the desktop git status the review pane expects.
export async function remoteGitSummary(peerId: string, project: string): Promise<RemoteGitSummary> {
  const r = (await peerRequest(peerId, { t: "git", project }, match("git", project), SUMMARY_TIMEOUT)) as PeerFrame;
  ensureOk(r);
  return {
    isRepo: r.isRepo !== false,
    branch: (r.branch as string) ?? "",
    detached: !!r.detached,
    hasUpstream: !!r.hasUpstream,
    ahead: (r.ahead as number) ?? 0,
    behind: (r.behind as number) ?? 0,
    defaultBranch: (r.defaultBranch as string) ?? "",
    ghCli: !!r.ghCli,
    files: ((r.files as RemoteGitSummary["files"]) ?? []).map((f) => ({
      path: f.path,
      status: f.status,
      staged: !!f.staged,
    })),
  };
}

// A ReviewSource map (one per mode) that feeds the local Monaco review pool from
// remote git data. Only "working" is meaningful for a peer (base/staged aren't in
// the protocol), so they alias the working source; the remote UI offers working
// only. Read-only (`editable:false`) so the pane never attempts a local save.
export function makeRemoteReviewSource(peerId: string, project: string): Record<ReviewMode, ReviewSource> {
  const fetchDiffs = async (
    _root: string,
    files: { path: string; status?: string }[],
  ): Promise<Record<string, FileDiffResult>> => {
    if (files.length === 0) return {};
    const reqId = nextReqId();
    const r = (await peerRequest(
      peerId,
      { t: "gitDiffs", project, reqId, files: files.map((f) => ({ path: f.path, status: f.status })) },
      (f) => f.t === "gitDiffs" && (f as PeerFrame).reqId === reqId,
      DIFFS_TIMEOUT,
    )) as PeerFrame;
    if (r.ok === false) return {};
    return (r.diffs as Record<string, FileDiffResult>) ?? {};
  };

  const working: ReviewSource = {
    label: "Working tree",
    editable: false,
    listChanged: async () => {
      const s = await remoteGitSummary(peerId, project);
      return s.isRepo ? s.files : [];
    },
    fetchDiff: async (root, path, _base, status) => {
      const map = await fetchDiffs(root, [{ path, status }]);
      return map[path] ?? {};
    },
    fetchDiffs: (root, files) => fetchDiffs(root, files),
  };

  return { working, base: working, staged: working };
}

// Ship ops — each throws on error so the caller toasts in product terms.
export async function remoteGitCommit(peerId: string, project: string, message: string, files: string[]): Promise<void> {
  ensureOk(await peerRequest(peerId, { t: "gitCommit", project, message, files }, match("gitCommit", project), SHIP_TIMEOUT));
}

export async function remoteGitPush(peerId: string, project: string): Promise<void> {
  ensureOk(await peerRequest(peerId, { t: "gitPush", project }, match("gitPush", project), SHIP_TIMEOUT));
}

export async function remoteGitPull(peerId: string, project: string): Promise<void> {
  ensureOk(await peerRequest(peerId, { t: "gitPull", project }, match("gitPull", project), SHIP_TIMEOUT));
}

export async function remoteGitGenMessage(peerId: string, project: string, files: string[]): Promise<string> {
  const r = ensureOk(
    await peerRequest(peerId, { t: "gitGenMessage", project, files }, match("gitGenMessage", project), SHIP_TIMEOUT),
  );
  return (r.message as string) ?? "";
}

export function remoteGitWatch(peerId: string, project: string): void {
  void PeerSend(peerId, { t: "gitWatch", project });
}

export function remoteGitUnwatch(peerId: string, project: string): void {
  void PeerSend(peerId, { t: "gitUnwatch", project });
}
