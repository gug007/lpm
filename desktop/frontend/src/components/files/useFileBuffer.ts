import { useCallback, useMemo, useRef, useState } from "react";
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
  writable: boolean;
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
  writable: boolean;
}

interface DirtyBuffer {
  baseline: string;
  draft: string;
}

const NO_BUFFERS: ReadonlyMap<string, DirtyBuffer> = new Map();
// The watcher echoes our own save within its coalesce window; that event has
// nothing to reconcile.
const SAVE_ECHO_MS = 2500;

function loadedFile(path: string, res: FileContent): OpenFile {
  return {
    path,
    loading: false,
    error: null,
    binary: !!res.binary,
    tooLarge: !!res.tooLarge,
    size: res.size ?? 0,
    writable: res.writable !== false,
    baseline: res.content ?? "",
  };
}

function blankFile(path: string, loading: boolean, error: string | null = null): OpenFile {
  return { path, loading, error, binary: false, tooLarge: false, size: 0, writable: true, baseline: "" };
}

// The file the editor shows, plus every unsaved draft made in this tab. A draft
// keeps the disk text it was made against, so reopening it (or a change on
// disk) can tell "still current" from "someone else wrote this file".
export function useFileBuffer(root: string, active: boolean) {
  const [file, setFile] = useState<OpenFile | null>(null);
  const [buffers, setBuffers] = useState<ReadonlyMap<string, DirtyBuffer>>(NO_BUFFERS);
  const [conflict, setConflict] = useState<FileConflict | null>(null);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef(file);
  fileRef.current = file;
  const buffersRef = useRef(buffers);
  buffersRef.current = buffers;
  const savingRef = useRef(false);
  const savedAtRef = useRef<{ path: string; at: number } | null>(null);
  const reqRef = useRef(0);

  const readOnly = file?.writable === false;
  const draft = file ? (buffers.get(file.path)?.draft ?? null) : null;
  // Row markers only care which paths are dirty, so their Set changes only
  // when that set does, not on every keystroke.
  const dirtyKey = useMemo(() => [...buffers.keys()].join("\0"), [buffers]);
  const dirtyPaths = useMemo(
    () => new Set(dirtyKey ? dirtyKey.split("\0") : []),
    [dirtyKey],
  );

  const read = useCallback(
    (path: string) => ReadProjectFile(root, path) as Promise<FileContent>,
    [root],
  );

  const putBuffer = useCallback((path: string, next: DirtyBuffer | null) => {
    setBuffers((prev) => {
      if (!next && !prev.has(path)) return prev;
      const map = new Map(prev);
      if (next) map.set(path, next);
      else map.delete(path);
      return map;
    });
  }, []);

  // Loads `path` into the editor. A file with an unsaved draft reopens on that
  // draft, then checks the disk underneath it.
  const open = useCallback(
    async (path: string) => {
      const current = fileRef.current;
      if (current?.path === path && !current.error) return;
      const token = ++reqRef.current;
      setConflict(null);
      const held = buffersRef.current.get(path);
      setFile(held ? { ...blankFile(path, false), baseline: held.baseline } : blankFile(path, true));
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
      if (!f || f.loading || f.error || f.binary || f.tooLarge || !f.writable) return;
      putBuffer(f.path, text === f.baseline ? null : { baseline: f.baseline, draft: text });
    },
    [putBuffer],
  );

  // Forget any draft for `path` and take `content` as its disk text.
  const markClean = useCallback(
    (path: string, content: string) => {
      putBuffer(path, null);
      setFile((cur) => (cur && cur.path === path ? { ...cur, baseline: content } : cur));
    },
    [putBuffer],
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
          savedAtRef.current = { path, at: Date.now() };
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
    if (!f || !f.writable || savingRef.current) return;
    const held = buffersRef.current.get(f.path);
    if (!held) return;
    await casWrite(f.path, held.baseline, held.draft);
  }, [casWrite]);

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
      if (!held) {
        setConflict(null);
        return;
      }
      // Keep mine: write again against what is on disk now; a third write
      // since then raises the conflict once more.
      await casWrite(c.path, c.theirs, held.draft);
    },
    [conflict, markClean, casWrite],
  );

  // Follow the disk when the open file changes under us: a clean buffer takes
  // the new text, a dirty one raises a conflict instead of being clobbered.
  const reconcile = useCallback(
    async (changed: string[] | null) => {
      const f = fileRef.current;
      if (!f || f.loading) return;
      if (
        Array.isArray(changed) &&
        !changed.some((p) => p.toLowerCase() === f.path.toLowerCase())
      ) {
        return;
      }
      const echo = savedAtRef.current;
      if (echo && echo.path === f.path && Date.now() - echo.at < SAVE_ECHO_MS) return;
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
        if (!held) setFile(loadedFile(f.path, res));
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
  useGitChanged(root, reconcile, active);

  return {
    file,
    draft,
    value: draft ?? file?.baseline ?? "",
    readOnly,
    dirtyPaths,
    conflict,
    saving,
    open,
    setDraft,
    save,
    resolveConflict,
  };
}
