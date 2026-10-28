import { useCallback, useState } from "react";
import { ReplaceInFiles, UndoReplace } from "../../../bridge/commands";
import { toast } from "../../notifications/toast";
import { basename } from "../../path";
import type { LineMatch } from "./fileSearch";
import type { FilesSearchModel } from "./useFilesSearch";

const UNDO_MS = 8000;

interface Skipped {
  path: string;
  reason: string;
}

interface ReplaceOutcome {
  replaced: number;
  files: number;
  skipped: Skipped[];
  undoable: boolean;
}

interface UndoOutcome {
  restored: number;
  skipped: Skipped[];
}

const count = (n: number, one: string, many: string) => `${n.toLocaleString()} ${n === 1 ? one : many}`;
const skippedList = (skipped: Skipped[]) =>
  skipped.length ? skipped.map((s) => `${s.path}: ${s.reason}`).join("\n") : undefined;

// Replace from the Search view: one match, one file, or every file listed.
// A file with unsaved edits in the editor is left alone, since the editor
// would go on holding text the disk no longer has.
export function useSearchReplace(search: FilesSearchModel, dirtyPaths: ReadonlySet<string>) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const { root, token, query, options, replace, refresh, state, history } = search;
  const files = state.result?.files ?? [];

  const undo = useCallback(async () => {
    try {
      const out = (await UndoReplace(root, token)) as UndoOutcome;
      const description = skippedList(out.skipped);
      if (out.restored) toast(`Put back ${count(out.restored, "file", "files")}`, { description });
      else toast.error("Nothing was put back", { description });
    } catch (err) {
      toast.error(String(err));
    }
    refresh();
  }, [root, token, refresh]);

  const run = useCallback(
    async (paths: string[], at?: Pick<LineMatch, "line" | "col">) => {
      if (paths.length === 0) return;
      history.remember();
      setBusy(true);
      try {
        const place = at ? { line: at.line, col: at.col } : null;
        const out = (await ReplaceInFiles(root, query, options, replace, paths, place, token)) as ReplaceOutcome;
        const description = skippedList(out.skipped);
        if (out.replaced === 0) {
          toast.error(out.skipped.length ? "Nothing was replaced" : "No matches are left to replace", { description });
        } else {
          toast.success(`Replaced ${count(out.replaced, "match", "matches")} in ${count(out.files, "file", "files")}`, {
            description,
            ...(out.undoable && {
              duration: UNDO_MS,
              action: { label: "Undo", onClick: () => void undo() },
            }),
          });
        }
      } catch (err) {
        toast.error(`Couldn't replace: ${String(err)}`);
      } finally {
        setBusy(false);
        refresh();
      }
    },
    [history, root, query, options, replace, token, undo, refresh],
  );

  const unsavedFirst = (path: string) => {
    if (!dirtyPaths.has(path)) return false;
    toast.error(`Save ${basename(path)} first`, { description: "It has unsaved edits in the editor." });
    return true;
  };

  return {
    busy,
    confirming,
    // Paths that stay as they are in a Replace all.
    unsaved: files.filter((f) => dirtyPaths.has(f.path)).map((f) => f.path),
    replaceMatch: (path: string, match: LineMatch) => {
      if (!unsavedFirst(path)) void run([path], match);
    },
    replaceFile: (path: string) => {
      if (!unsavedFirst(path)) void run([path]);
    },
    requestAll: () => {
      if (files.length > 0) setConfirming(true);
    },
    cancelAll: () => setConfirming(false),
    confirmAll: () => {
      setConfirming(false);
      void run(files.map((f) => f.path).filter((path) => !dirtyPaths.has(path)));
    },
  };
}
