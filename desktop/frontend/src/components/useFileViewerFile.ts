import { useEffect, useMemo, useState } from "react";
import { GitShowPrefix } from "../../bridge/commands";
import { basename, folderAbove, relTo } from "../path";
import { stripMarker } from "../peer/markers";
import { isSourceImage, mediaKind } from "./fileMedia";
import { useChangedFiles } from "./files/useChangedFiles";
import { useDiffView, type HeadText } from "./files/useDiffView";
import { useFileBuffer } from "./files/useFileBuffer";

// Only these have a HEAD side worth comparing; a new file is all additions.
const HAS_HEAD = new Set(["modified", "renamed", "deleted", "conflicted"]);

const STATUS_LABEL: Record<string, string> = {
  modified: "Modified",
  renamed: "Renamed",
  deleted: "Deleted",
  added: "New",
  untracked: "New",
  conflicted: "Conflicted",
};

// A file under the terminal's project is read through that root, which is what
// the watcher, git and SSH routing key on; any other file through its folder.
// One on an SSH host is only reached through its project, so a file outside it
// goes by its absolute path there.
export function viewerLocation(absPath: string, projectRoot: string, onHost = false) {
  const rel = projectRoot ? relTo(absPath, projectRoot) : absPath;
  if (rel !== absPath) return { root: projectRoot, rel };
  if (onHost) return { root: projectRoot, rel: stripMarker(absPath) };
  return { root: folderAbove(absPath) ?? absPath, rel: basename(absPath) };
}

// Where the root sits in its repo: git reports repo-root-relative paths.
// Undefined while asking, null outside a repo. A host too old to answer is
// taken to be at its repo's top, as before this was asked.
function useRepoPrefix(root: string, active: boolean): string | null | undefined {
  const [prefix, setPrefix] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    if (!active) return;
    let live = true;
    GitShowPrefix(root).then(
      (p: unknown) => live && setPrefix(typeof p === "string" ? p : ""),
      (err: unknown) => live && setPrefix(/not a git repository/i.test(String(err)) ? null : ""),
    );
    return () => {
      live = false;
    };
  }, [root, active]);
  return prefix;
}

// This computer's own errors carry their number; an SSH host's are what its
// `head` said.
export function readError(message: string): string {
  if (/os error 2\b|: No such file or directory$/.test(message)) return "This file doesn't exist";
  if (/os error 13\b|: Permission denied$/.test(message)) return "No permission to read this file";
  if (/^not a file|: Is a directory$/.test(message)) return "This is a folder, not a file";
  // A connected computer's lpm from before it read past an SSH project's folder.
  if (/^path escapes the project/.test(message)) return "Update lpm on that computer to open this file";
  return message;
}

// Everything the viewer shows about one file: its text through the Files tab's
// buffer (binary and size verdicts, compare-and-swap saves, following the disk),
// and its git status with the HEAD text a diff needs.
export function useFileViewerFile(absPath: string, projectRoot: string, onHost = false) {
  const { root, rel } = useMemo(
    () => viewerLocation(absPath, projectRoot, onHost),
    [absPath, projectRoot, onHost],
  );
  const kind = mediaKind(absPath);
  const readsText = kind === null || (kind === "image" && isSourceImage(absPath));

  const buffer = useFileBuffer(root, readsText);
  const { open } = buffer;
  useEffect(() => {
    if (readsText) void open(rel);
  }, [open, rel, readsText]);

  // The project's repo says nothing of a host's file outside it.
  const tracked = readsText && !(onHost && rel.startsWith("/"));
  const prefix = useRepoPrefix(root, tracked);
  const repoPath = tracked && typeof prefix === "string" ? prefix + rel : null;
  const changes = useChangedFiles(root, tracked);
  const status =
    repoPath && changes.status === "ready"
      ? changes.files.find((f) => f.path === repoPath)?.status
      : undefined;
  const diffView = useDiffView(
    root,
    repoPath ?? rel,
    status && HAS_HEAD.has(status) ? status : undefined,
    tracked,
  );
  const { setWanted } = diffView;
  useEffect(() => setWanted(true), [setWanted]);

  const file = buffer.file;
  const deleted = status === "deleted";
  const text = !!file && !file.loading && !file.error && !file.binary && !file.tooLarge;
  const head: HeadText | null = diffView.diff?.head ?? null;
  const fileLoading = !file || file.loading;
  const gitPending =
    tracked && (prefix === undefined || changes.status === "loading" || head?.status === "loading");
  // Git only holds the first showing back: a file that turns modified while
  // open keeps its editor, and gains a Diff option once HEAD arrives.
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    if (readsText && !fileLoading && !gitPending) setSettled(true);
  }, [readsText, fileLoading, gitPending]);
  const loading = readsText && (fileLoading || (!settled && gitPending));
  const original = head?.status === "ready" && (text || deleted) ? head.original : null;

  return {
    root,
    rel,
    kind,
    buffer,
    loading,
    text,
    deleted,
    original,
    statusLabel: status ? (STATUS_LABEL[status] ?? null) : null,
    error: file?.error ? readError(file.error) : null,
    label: rel.includes("/") ? rel : stripMarker(absPath),
  };
}
