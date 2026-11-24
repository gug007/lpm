import { useCallback, useEffect, useRef, useState } from "react";
import { listFolder, type LocatedPath } from "../../locate";
import { sortEntries, type Listing } from "./treeModel";
import { asFolder, splitTyped } from "./typedFolder";
import { lookAt, type TypedPath } from "./useTypedPath";

// How long a folder's listing answers for what is typed after it.
const FRESH_MS = 15_000;

const LOADING: Listing = { status: "loading" };

interface Folder {
  // As typed, separator and all.
  typed: string;
  listing: Listing;
}

export interface TypedFolder extends Folder {
  at: LocatedPath;
  // What is typed after it.
  narrow: string;
}

// `at` null is not a folder outside the project, or not known to be one yet.
interface Held extends Folder {
  askedAt: number;
  at: LocatedPath | null;
}

interface TypedFolderOptions {
  root: string;
  typed: TypedPath | null;
  onSsh: boolean;
  windows: boolean;
  // The folder just opened from a list, known before it is found again.
  opened: { typed: string; path: string } | null;
  // The path is taken for part of a project's name: nothing is read.
  quiet: boolean;
}

// The folder outside the project that the typed path is, or that it is typed on
// from, and what it holds.
export function useTypedFolder({ root, typed, onSsh, windows, opened, quiet }: TypedFolderOptions): TypedFolder | null {
  const [held, setHeld] = useState<Held | null>(null);
  const heldRef = useRef(held);
  const hold = useCallback((next: Held) => {
    heldRef.current = next;
    setHeld(next);
  }, []);

  const load = useCallback(
    async (folder: string, known: LocatedPath | null) => {
      const last = heldRef.current;
      const fresh = last?.typed === folder && Date.now() - last.askedAt < FRESH_MS;
      if (fresh && (last.at || !known)) return;
      const asked: Held = { typed: folder, askedAt: Date.now(), at: known, listing: LOADING };
      hold(last?.typed === folder ? { ...last, askedAt: asked.askedAt } : asked);
      const { askedAt } = asked;
      const stale = () => heldRef.current?.typed !== folder || heldRef.current.askedAt !== askedAt;
      const found = known ?? (await outside(root, folder, onSsh));
      if (stale()) return;
      if (!found) return hold(asked);
      try {
        const entries = sortEntries(await listFolder(root, found.path));
        if (!stale()) hold({ ...asked, at: found, listing: { status: "ready", entries } });
      } catch (err) {
        if (!stale()) hold({ ...asked, at: found, listing: { status: "error", message: String(err) } });
      }
    },
    [root, onSsh, hold],
  );

  const wanted = quiet ? null : folderOf(typed, windows);
  const { typed: folder = null, at: known = null } = wanted ?? {};
  useEffect(() => {
    if (folder !== null) void load(folder, known);
    // A new `known` for the same folder is the same place.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [folder, load]);

  if (!typed || quiet) return null;
  const has = (text: string) => (held?.typed === text && held.at ? { ...held, at: held.at } : null);
  const { dir, name } = splitTyped(typed.path, windows);
  if (typed.status === "looking") {
    const whole = asFolder(typed.path, windows);
    const here = has(whole) ?? has(dir);
    if (here) return { ...here, narrow: here.typed === whole ? "" : name };
    if (opened?.typed !== typed.path) return null;
    const at: LocatedPath = { kind: "dir", path: opened.path, rel: null };
    return { typed: opened.typed, at, narrow: "", listing: LOADING };
  }
  if (!wanted) return null;
  const here = has(wanted.typed);
  const narrow = typed.status === "missing" ? name : "";
  if (here) return { ...here, narrow };
  return wanted.at ? { typed: wanted.typed, at: wanted.at, narrow, listing: LOADING } : null;
}

function folderOf(typed: TypedPath | null, windows: boolean): { typed: string; at: LocatedPath | null } | null {
  if (typed?.status === "found") {
    const { kind, rel } = typed.at;
    return kind === "dir" && rel === null ? { typed: asFolder(typed.path, windows), at: typed.at } : null;
  }
  if (typed?.status !== "missing") return null;
  const { dir, name } = splitTyped(typed.path, windows);
  return name ? { typed: dir, at: null } : null;
}

async function outside(root: string, folder: string, onSsh: boolean): Promise<LocatedPath | null> {
  const found = await lookAt(root, folder, onSsh);
  return found?.status === "found" && found.at.kind === "dir" && found.at.rel === null ? found.at : null;
}
