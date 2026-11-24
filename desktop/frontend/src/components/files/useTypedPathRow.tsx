import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { LocatedPath } from "../../locate";
import { useSshHostName } from "../../hooks/useSshRoot";
import { folderAbove, joinAbs, windowsRules } from "../../path";
import { stripMarker } from "../../peer/markers";
import { openFileViewer } from "../../store/fileViewer";
import { FilesPathRow } from "./FilesPathRow";
import type { ActivateOptions } from "./FilesTree";
import type { Item, TreeRow } from "./treeModel";
import { UP, asFolder, folderRows, isTopLevel, type FolderList } from "./typedFolder";
import { inTree } from "./typedPath";
import { useTypedFolder } from "./useTypedFolder";
import { useTypedPath } from "./useTypedPath";

const NO_ROWS: TreeRow[] = [];

interface TypedPathRowOptions {
  root: string;
  query: string;
  onQuery: (query: string) => void;
  enabled: boolean;
  // The filter's own matches, which a path that leads nowhere leaves as they are.
  hasMatches: boolean;
  // One of them holds the query as it is typed: `/bin` in `tools/bin/run`.
  holdsQuery: boolean;
  onActivate: (item: Item, opts?: ActivateOptions) => void;
}

// What Enter in the filter box does where the path doesn't take it.
export interface EnterOptions {
  openBest: () => void;
  focusList: () => void;
}

interface TypedPathRow {
  row: ReactNode;
  // Why there is nothing to open, in place of "No file name matches".
  headline: string | undefined;
  // A folder outside the project, in place of the filter's matches.
  folder: FolderList | null;
  // Enter in the filter box; true when the path took it.
  onEnter: (opts: EnterOptions) => boolean;
}

// A path typed into "Filter files": its row, and what Enter does with it. A file
// in the project opens here, a folder there opens the tree on it, and a file
// anywhere else opens in the viewer. A folder anywhere else lists what it holds,
// and so does one whose path is typed on into a name.
export function useTypedPathRow({
  root,
  query,
  onQuery,
  enabled,
  hasMatches,
  holdsQuery,
  onActivate,
}: TypedPathRowOptions): TypedPathRow {
  const hostName = useSshHostName(root);
  const onSsh = hostName !== null;
  const windows = !onSsh && windowsRules(root);
  const [opened, setOpened] = useState<{ typed: string; path: string } | null>(null);
  const { typed, settle } = useTypedPath(root, query, enabled, onSsh, opened?.typed);
  const quiet =
    holdsQuery && !!typed && isTopLevel(typed.path) && opened?.typed !== asFolder(typed.path, windows);
  const found = useTypedFolder({ root, typed, onSsh, windows, opened, quiet });
  const queryRef = useRef(query);
  queryRef.current = query;
  useEffect(() => {
    if (opened && !query.startsWith(opened.typed)) setOpened(null);
  }, [query, opened]);

  // A folder opened from a list can turn out to be the project's: it is in the tree.
  useEffect(() => {
    if (typed?.status !== "found" || typed.path !== opened?.typed) return;
    const { kind, rel } = typed.at;
    if (kind !== "dir" || rel === null || !inTree(rel)) return;
    setOpened(null);
    onActivate({ path: rel, isDir: true }, { focusEditor: true });
  }, [typed, opened, onActivate]);

  const { typed: folderTyped = "", narrow = "", listing } = found ?? {};
  const folderPath = found?.at.path ?? "";
  const rows = useMemo(() => {
    if (!listing || listing.status === "loading") return NO_ROWS;
    return folderRows(folderPath, listing.status === "ready" ? listing.entries : [], narrow);
  }, [folderPath, listing, narrow]);
  const listed = !!found && (narrow === "" || rows.length > 0);

  const goTo = useCallback(
    (folder: string, path: string) => {
      setOpened({ typed: folder, path });
      onQuery(folder);
    },
    [onQuery],
  );

  const openOutside = useCallback(
    (path: string) =>
      openFileViewer({ absPath: joinAbs(root, path), line: 0, col: 0, projectRoot: root, onHost: onSsh }),
    [root, onSsh],
  );

  const onUp = useCallback(() => {
    const above = folderAbove(folderPath);
    if (above !== null) goTo(asFolder(stripMarker(above), windows), above);
  }, [folderPath, windows, goTo]);

  const onOpen = useCallback(
    (item: Item) => {
      const row = rows.find((r) => r.path === item.path);
      if (!row) return;
      if (row.name === UP) onUp();
      else if (row.isDir) goTo(asFolder(folderTyped + row.name, windows), row.path);
      else openOutside(row.path);
    },
    [rows, onUp, goTo, folderTyped, windows, openOutside],
  );

  const folder = useMemo<FolderList | null>(() => {
    if (!listed || !listing) return null;
    const note =
      listing.status === "error"
        ? { text: `Couldn't read this folder: ${listing.message}`, bad: true }
        : listing.status === "loading"
          ? { text: "Loading…" }
          : rows.every((r) => r.name === UP)
            ? { text: "This folder is empty" }
            : null;
    return { path: folderPath, rows, note, onOpen, onUp };
  }, [listed, listing, folderPath, rows, onOpen, onUp]);
  const folderRef = useRef(folder);
  folderRef.current = folder;

  const open = useCallback(
    ({ kind, rel, path }: LocatedPath, focusList?: () => void) => {
      const isDir = kind === "dir";
      if (rel !== null && (!isDir || inTree(rel))) onActivate({ path: rel, isDir }, { focusEditor: true });
      else if (!isDir) openOutside(path);
      else if (rel === null) {
        const whole = asFolder(queryRef.current.trim(), windows);
        if (folderRef.current && queryRef.current === whole) focusList?.();
        else goTo(whole, path);
      }
    },
    [onActivate, openOutside, windows, goTo],
  );

  const onEnter = useCallback(
    ({ openBest, focusList }: EnterOptions) => {
      const openTyped = () => {
        const best = folderRef.current?.rows[0];
        if (best && best.name !== UP) folderRef.current?.onOpen(best);
        else openBest();
      };
      if (typed?.status === "missing" && folderRef.current) {
        openTyped();
        return true;
      }
      if (typed?.status !== "looking" && typed?.status !== "found") return false;
      const asked = queryRef.current;
      void settle().then((answer) => {
        if (queryRef.current !== asked) return;
        if (answer?.status === "found") open(answer.at, focusList);
        else openTyped();
      });
      return true;
    },
    [typed, settle, open],
  );

  const on = onSsh ? ` on ${hostName}` : "";
  const at = folder && found ? found.at : typed?.status === "found" ? typed.at : null;
  return {
    row:
      at || (typed?.status === "looking" && !hasMatches) ? (
        <FilesPathRow at={at} hostName={hostName} listed={folder !== null} onOpen={() => at && open(at)} />
      ) : null,
    headline:
      typed?.status === "missing"
        ? `Nothing at “${typed.path}”${on}`
        : typed?.status === "failed"
          ? `Couldn't look for “${typed.path}”${on}: ${typed.message}`
          : undefined,
    folder,
    onEnter,
  };
}
