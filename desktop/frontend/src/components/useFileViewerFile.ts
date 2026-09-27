import { useEffect, useMemo, useState } from "react";
import { GitShowPrefix } from "../../bridge/commands";
import { basename, relTo } from "../path";
import { isPeerRoot, stripMarker } from "../peer/markers";
import { isSourceImage, mediaKind } from "./fileMedia";
import { useChangedFiles } from "./files/useChangedFiles";
import { useDiffView, type HeadText } from "./files/useDiffView";
import { useFileBuffer } from "./files/useFileBuffer";

// Only these have a HEAD side worth comparing; a new file is all additions.
const HAS_HEAD = new Set(["modified", "renamed", "deleted"]);

const STATUS_LABEL: Record<string, string> = {
  modified: "Modified",
  renamed: "Renamed",
  deleted: "Deleted",
  added: "New",
  untracked: "New",
};

// A file under the terminal's project is read through that root, which is what
// the watcher, git and SSH routing key on; any other file through its folder.
// A folder that is a paired host's bare `/` or `~` keeps the separator its
// marker needs to route there.
export function viewerLocation(absPath: string, projectRoot: string) {
  const rel = projectRoot ? relTo(absPath, projectRoot) : absPath;
  if (rel !== absPath) return { root: projectRoot, rel };
  const cut = absPath.lastIndexOf("/");
  const dir = cut > 0 ? absPath.slice(0, cut) : "/";
  return { root: isPeerRoot(`${dir}/`) && !isPeerRoot(dir) ? `${dir}/` : dir, rel: basename(absPath) };
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

function readError(message: string): string {
  if (/os error 2\b/.test(message)) return "This file doesn't exist";
  if (/os error 13\b/.test(message)) return "No permission to read this file";
  if (/^not a file/.test(message)) return "This is a folder, not a file";
  return message;
}

// Everything the viewer shows about one file: its text through the Files tab's
// buffer (binary and size verdicts, compare-and-swap saves, following the disk),
// and its git status with the HEAD text a diff needs.
export function useFileViewerFile(absPath: string, projectRoot: string) {
  const { root, rel } = useMemo(() => viewerLocation(absPath, projectRoot), [absPath, projectRoot]);
  const kind = mediaKind(absPath);
  const readsText = kind === null || (kind === "image" && isSourceImage(absPath));

  const buffer = useFileBuffer(root, readsText);
  const { open } = buffer;
  useEffect(() => {
    if (readsText) void open(rel);
  }, [open, rel, readsText]);

  const prefix = useRepoPrefix(root, readsText);
  const repoPath = typeof prefix === "string" ? prefix + rel : null;
  const changes = useChangedFiles(root, readsText);
  const status =
    repoPath && changes.status === "ready"
      ? changes.files.find((f) => f.path === repoPath)?.status
      : undefined;
  const diffView = useDiffView(
    root,
    repoPath ?? rel,
    status && HAS_HEAD.has(status) ? status : undefined,
    readsText,
  );
  const { setWanted } = diffView;
  useEffect(() => setWanted(true), [setWanted]);

  const file = buffer.file;
  const deleted = status === "deleted";
  const text = !!file && !file.loading && !file.error && !file.binary && !file.tooLarge;
  const head: HeadText | null = diffView.diff?.head ?? null;
  const fileLoading = !file || file.loading;
  const gitPending = prefix === undefined || changes.status === "loading" || head?.status === "loading";
  // Git only holds the first showing back: a file that turns modified while
  // open keeps its editor, and gains a Diff option once HEAD arrives.
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    if (readsText && !fileLoading && !gitPending) setSettled(true);
  }, [readsText, fileLoading, gitPending]);
  const loading = readsText && (fileLoading || (!settled && gitPending));
  const original = head?.status === "ready" && (text || deleted) ? head.original : null;

  return {
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
