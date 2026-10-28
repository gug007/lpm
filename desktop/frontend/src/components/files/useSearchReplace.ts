import { useCallback, useMemo, useState } from "react";
import { ReplaceInFiles, UndoReplace } from "../../../bridge/commands";
import { count } from "../../count";
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

const skippedList = (skipped: Skipped[]) =>
  skipped.length ? skipped.map((s) => `${s.path}: ${s.reason}`).join("\n") : undefined;

// Replace from the Search view: one match, one file, or every file listed.
// A file with unsaved edits in the editor is left alone, since the editor
// would go on holding text the disk no longer has.
export function useSearchReplace(search: FilesSearchModel, dirtyPaths: ReadonlySet<string>) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const { root, token, query, options, replace, refresh, state, history } = search;
  const { remember } = history;
  const files = state.result?.files;
  // What a Replace all changes, and the files it leaves as they are.
  const [changing, unsaved] = useMemo(() => {
    const all = files ?? [];
    return [all.filter((f) => !dirtyPaths.has(f.path)), all.filter((f) => dirtyPaths.has(f.path)).map((f) => f.path)];
  }, [files, dirtyPaths]);

  const undo = useCallback(async () => {
    try {
      const out = (await UndoReplace(root, token)) as UndoOutcome;
      const description = skippedList(out.skipped);
      if (out.restored) toast(`Put back ${count(out.restored, "file", "files")}`, { description });
      else toast.error("Nothing was put back", { description });
    } catch (err) {
      toast.error(String(err));
    }
    void refresh();
  }, [root, token, refresh]);

  const run = useCallback(
    async (paths: string[], at?: LineMatch) => {
      if (paths.length === 0) return;
      remember();
      setBusy(true);
      try {
        const out = (await ReplaceInFiles(root, query, options, replace, paths, at ?? null, token)) as ReplaceOutcome;
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
        void refresh();
      }
    },
    [remember, root, query, options, replace, token, undo, refresh],
  );

  // Whether the file has unsaved edits, said so when it does.
  const unsavedFirst = useCallback(
    (path: string) => {
      if (!dirtyPaths.has(path)) return false;
      toast.error(`Save ${basename(path)} first`, { description: "It has unsaved edits in the editor." });
      return true;
    },
    [dirtyPaths],
  );

  const replaceMatch = useCallback(
    (path: string, match: LineMatch) => {
      if (!unsavedFirst(path)) void run([path], match);
    },
    [unsavedFirst, run],
  );

  const replaceFile = useCallback(
    (path: string) => {
      if (!unsavedFirst(path)) void run([path]);
    },
    [unsavedFirst, run],
  );

  return {
    busy,
    confirming,
    changing,
    unsaved,
    replaceMatch,
    replaceFile,
    requestAll: () => {
      if (changing.length > 0) setConfirming(true);
    },
    cancelAll: () => setConfirming(false),
    confirmAll: () => {
      setConfirming(false);
      void run(changing.map((f) => f.path));
    },
  };
}
