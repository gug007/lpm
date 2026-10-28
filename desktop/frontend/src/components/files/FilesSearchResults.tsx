import { useCallback, useMemo, useState, type KeyboardEvent, type RefObject } from "react";
import { FilesSearchRow, SEARCH_ROW_PX } from "./FilesSearchRow";
import { searchRows, type FileMatches, type LineMatch, type SearchRow } from "./fileSearch";
import { useVirtualList } from "./useVirtualList";

const NONE: ReadonlySet<string> = new Set();

interface FilesSearchResultsProps {
  listRef: RefObject<HTMLDivElement | null>;
  files: FileMatches[];
  // The key of the occurrence open in the editor.
  openedKey: string | null;
  // Enter opens and moves on to the editor; a click and Space keep the list.
  onOpen: (path: string, match: LineMatch, focusEditor: boolean) => void;
  // ↑ from the first row: back to the field.
  onExitTop: () => void;
  // Given while the replace field is open: each row's own Replace.
  onReplace?: (row: SearchRow) => void;
  // Files with unsaved edits in the editor, which can't be replaced in.
  unsaved: ReadonlySet<string>;
}

// Every occurrence under its file, one keyboard cursor over both. Each new
// set of results opens every file again.
export function FilesSearchResults({
  listRef,
  files,
  openedKey,
  onOpen,
  onExitTop,
  onReplace,
  unsaved,
}: FilesSearchResultsProps) {
  const [folded, setFolded] = useState<{ files: FileMatches[]; paths: ReadonlySet<string> }>({ files, paths: NONE });
  const collapsed = folded.files === files ? folded.paths : NONE;
  const rows = useMemo(() => searchRows(files, collapsed), [files, collapsed]);
  const [cursorKey, setCursorKey] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);
  const virtual = useVirtualList(listRef, rows.length, SEARCH_ROW_PX);
  const { ensureVisible } = virtual;
  const cursorIndex = rows.findIndex((r) => r.key === cursorKey);

  const toggleFile = useCallback(
    (path: string, open?: boolean) => {
      const next = new Set(collapsed);
      const shut = open === undefined ? !next.has(path) : !open;
      if (shut) next.add(path);
      else next.delete(path);
      setFolded({ files, paths: next });
    },
    [collapsed, files],
  );

  const activate = useCallback(
    (row: SearchRow, focusEditor = false) => {
      setCursorKey(row.key);
      if (row.kind === "file") toggleFile(row.path);
      else onOpen(row.path, row.match, focusEditor);
    },
    [toggleFile, onOpen],
  );

  const moveTo = (index: number) => {
    if (rows.length === 0) return;
    const at = Math.max(0, Math.min(rows.length - 1, index));
    setCursorKey(rows[at].key);
    ensureVisible(at);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const current = cursorIndex >= 0 ? rows[cursorIndex] : null;
    switch (e.key) {
      case "ArrowDown":
        moveTo(cursorIndex + 1);
        break;
      case "ArrowUp":
        if (cursorIndex <= 0) onExitTop();
        else moveTo(cursorIndex - 1);
        break;
      case "Home":
        moveTo(0);
        break;
      case "End":
        moveTo(rows.length - 1);
        break;
      case "ArrowRight":
        if (current?.kind !== "file") return;
        if (current.collapsed) toggleFile(current.path, true);
        else moveTo(cursorIndex + 1);
        break;
      case "ArrowLeft":
        if (!current) return;
        if (current.kind === "match") setCursorKey(current.path);
        else if (!current.collapsed) toggleFile(current.path, false);
        break;
      case "Enter":
        if (current) activate(current, true);
        break;
      case " ":
        if (current) activate(current);
        break;
      default:
        return;
    }
    e.preventDefault();
  };

  return (
    <div
      ref={listRef}
      role="tree"
      aria-label="Search results"
      tabIndex={0}
      onKeyDown={onKeyDown}
      onFocus={() => {
        setFocused(true);
        if (cursorIndex < 0 && rows.length > 0) setCursorKey(rows[0].key);
      }}
      onBlur={() => setFocused(false)}
      className="min-h-0 flex-1 overflow-y-auto py-1 outline-none"
    >
      <div style={{ paddingTop: virtual.paddingTop, paddingBottom: virtual.paddingBottom }}>
        {rows.slice(virtual.first, virtual.last + 1).map((row) => (
          <FilesSearchRow
            key={row.key}
            row={row}
            cursor={focused && row.key === cursorKey}
            opened={row.key === openedKey}
            onClick={activate}
            onReplace={onReplace}
            unsaved={unsaved.has(row.path)}
          />
        ))}
      </div>
    </div>
  );
}
