import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ReadProjectFile, WriteFileIfUnchanged } from "../../../bridge/commands";
import { useGitChanged } from "../../hooks/useGitChanged";
import { joinAbs } from "../../path";

export interface OpenFile {
  path: string;
  loading: boolean;
  error: string | null;
  binary: boolean;
  tooLarge: boolean;
  size: number;
  // The exact on-disk text the buffer was loaded from (or last saved as): the
  // compare-and-swap baseline and the dirty reference.
  baseline: string;
}

export interface FileConflict {
  path: string;
  theirs: string;
}

interface FileContent {
  content: string;
  binary: boolean;
  tooLarge: boolean;
  size: number;
}

interface DirtyBuffer {
  baseline: string;
  draft: string;
}

const EMPTY_PATHS: ReadonlySet<string> = new Set();

function loadedFile(path: string, res: FileContent): OpenFile {
  return {
    path,
    loading: false,
    error: null,
    binary: !!res.binary,
    tooLarge: !!res.tooLarge,
    size: res.size ?? 0,
    baseline: res.content ?? "",
  };
}

function blankFile(path: string, loading: boolean, error: string | null = null): OpenFile {
  return { path, loading, error, binary: false, tooLarge: false, size: 0, baseline: "" };
}

// The file the editor shows, plus every unsaved draft made in this tab. A draft
// keeps the disk text it was made against, so reopening it (or a change on
// disk) can tell "still current" from "someone else wrote this file".
export function useFileBuffer(root: string, active: boolean, readOnly: boolean) {
  const [file, setFile] = useState<OpenFile | null>(null);
  const [draft, setDraftState] = useState<string | null>(null);
  const [dirtyPaths, setDirtyPaths] = useState<ReadonlySet<string>>(EMPTY_PATHS);
  const [conflict, setConflict] = useState<FileConflict | null>(null);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef(file);
  fileRef.current = file;
  const activeRef = useRef(active);
  activeRef.current = active;
  const savingRef = useRef(false);
  const buffersRef = useRef<Map<string, DirtyBuffer>>(new Map());
  const staleRef = useRef(false);
  const reqRef = useRef(0);

  const read = useCallback(
    (path: string) => ReadProjectFile(root, path) as Promise<FileContent>,
    [root],
  );

  const syncDirty = useCallback(() => setDirtyPaths(new Set(buffersRef.current.keys())), []);

  // Loads `path` into the editor. A file with an unsaved draft reopens on that
  // draft, then checks the disk underneath it.
  const open = useCallback(
    async (path: string) => {
      const current = fileRef.current;
      if (current?.path === path && !current.error) return;
      const token = ++reqRef.current;
      setConflict(null);
      const held = buffersRef.current.get(path);
      if (held) {
        setFile({ ...blankFile(path, false), size: held.baseline.length, baseline: held.baseline });
        setDraftState(held.draft);
      } else {
        setFile(blankFile(path, true));
        setDraftState(null);
      }
      let res: FileContent;
      try {
        res = await read(path);
      } catch (err) {
        if (token !== reqRef.current) return;
        const message = err instanceof Error ? err.message : String(err);
        if (held) toast.error(message);
        else setFile(blankFile(path, false, message));
        return;
      }
      if (token !== reqRef.current) return;
      if (held) {
        if (!res.binary && !res.tooLarge && res.content !== held.baseline) {
          setConflict({ path, theirs: res.content });
        }
        return;
      }
      setFile(loadedFile(path, res));
    },
    [read],
  );

  const setDraft = useCallback(
    (text: string) => {
      const f = fileRef.current;
      if (!f || f.loading || f.error || f.binary || f.tooLarge) return;
      const clean = text === f.baseline;
      setDraftState(clean ? null : text);
      const wasDirty = buffersRef.current.has(f.path);
      if (clean) buffersRef.current.delete(f.path);
      else buffersRef.current.set(f.path, { baseline: f.baseline, draft: text });
      if (wasDirty === clean) syncDirty();
    },
    [syncDirty],
  );

  // Forget any draft for `path` and take `content` as its disk text.
  const markClean = useCallback(
    (path: string, content: string) => {
      if (buffersRef.current.delete(path)) syncDirty();
      setFile((cur) =>
        cur && cur.path === path ? { ...cur, baseline: content, size: content.length } : cur,
      );
      if (fileRef.current?.path === path) setDraftState(null);
    },
    [syncDirty],
  );

  // Compare-and-swap write: lands only while the disk still matches
  // `expected`, otherwise raises the conflict for the user to resolve.
  const casWrite = useCallback(
    async (path: string, expected: string, content: string) => {
      savingRef.current = true;
      setSaving(true);
      try {
        const res = (await WriteFileIfUnchanged(joinAbs(root, path), expected, content)) as {
          written?: boolean;
          currentContent?: string;
        } | null;
        if (res?.written) {
          markClean(path, content);
          setConflict((c) => (c?.path === path ? null : c));
          toast.success("Saved");
        } else {
          setConflict({ path, theirs: res?.currentContent ?? "" });
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Could not save file");
      } finally {
        savingRef.current = false;
        setSaving(false);
      }
    },
    [root, markClean],
  );

  const save = useCallback(async () => {
    const f = fileRef.current;
    if (!f || readOnly || savingRef.current) return;
    const held = buffersRef.current.get(f.path);
    if (!held) return;
    await casWrite(f.path, held.baseline, held.draft);
  }, [readOnly, casWrite]);

  const resolveConflict = useCallback(
    async (mode: "overwrite" | "theirs" | "dismiss") => {
      const c = conflict;
      if (!c) return;
      if (mode === "dismiss") {
        setConflict(null);
        return;
      }
      if (mode === "theirs") {
        markClean(c.path, c.theirs);
        setConflict(null);
        return;
      }
      const held = buffersRef.current.get(c.path);
      if (!held || readOnly) {
        setConflict(null);
        return;
      }
      // Keep mine: write again against what is on disk now; a third write
      // since then raises the conflict once more.
      await casWrite(c.path, c.theirs, held.draft);
    },
    [conflict, markClean, casWrite, readOnly],
  );

  // Follow the disk when the open file changes under us: a clean buffer takes
  // the new text, a dirty one raises a conflict instead of being clobbered.
  const reconcile = useCallback(
    async (changed: string[] | null) => {
      const f = fileRef.current;
      if (!f || f.loading) return;
      if (!activeRef.current) {
        staleRef.current = true;
        return;
      }
      if (
        Array.isArray(changed) &&
        !changed.some((p) => p.toLowerCase() === f.path.toLowerCase())
      ) {
        return;
      }
      const token = reqRef.current;
      const held = buffersRef.current.get(f.path);
      let res: FileContent;
      try {
        res = await read(f.path);
      } catch (err) {
        if (token !== reqRef.current || fileRef.current?.path !== f.path || held) return;
        setFile(blankFile(f.path, false, err instanceof Error ? err.message : String(err)));
        return;
      }
      if (token !== reqRef.current || fileRef.current?.path !== f.path) return;
      if (f.error || f.binary || f.tooLarge || res.binary || res.tooLarge) {
        if (!held) {
          setFile(loadedFile(f.path, res));
          setDraftState(null);
        }
        return;
      }
      if (res.content === f.baseline) return;
      if (held) {
        setConflict({ path: f.path, theirs: res.content });
        return;
      }
      setFile((cur) =>
        cur && cur.path === f.path ? { ...cur, baseline: res.content, size: res.size } : cur,
      );
    },
    [read],
  );
  useGitChanged(root, reconcile);

  useEffect(() => {
    if (!active || !staleRef.current) return;
    staleRef.current = false;
    void reconcile(null);
  }, [active, reconcile]);

  useEffect(() => {
    reqRef.current += 1;
    buffersRef.current = new Map();
    staleRef.current = false;
    setFile(null);
    setDraftState(null);
    setDirtyPaths(EMPTY_PATHS);
    setConflict(null);
  }, [root]);

  return {
    file,
    draft,
    value: draft ?? file?.baseline ?? "",
    dirtyPaths,
    conflict,
    saving,
    open,
    setDraft,
    save,
    resolveConflict,
  };
}
