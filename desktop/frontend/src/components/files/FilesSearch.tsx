import { useCallback, useEffect, useRef, type KeyboardEvent, type ReactNode } from "react";
import { FilesReplaceDialog } from "./FilesReplaceDialog";
import { FilesSearchField } from "./FilesSearchField";
import { FilesSearchFilters } from "./FilesSearchFilters";
import { FilesSearchReplace } from "./FilesSearchReplace";
import { FilesSearchResults } from "./FilesSearchResults";
import { matchCount, resultSummary, type LineMatch, type SearchRow } from "./fileSearch";
import type { FilesSearchModel } from "./useFilesSearch";
import { useSearchReplace } from "./useSearchReplace";

interface FilesSearchProps {
  search: FilesSearchModel;
  openedKey: string | null;
  onOpen: (path: string, match: LineMatch, focusEditor: boolean) => void;
  // Files with unsaved edits in the editor.
  unsaved: ReadonlySet<string>;
}

// The rail's Search view: a field with its toggles over every occurrence of
// what is typed, grouped by file; with the replace field open, each shows what
// it would become and can be replaced.
export function FilesSearch({ search, openedKey, onOpen, unsaved }: FilesSearchProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const { query, setQuery, state, focusRequest, history } = search;
  const { remember } = history;
  const { result, problem, searching, updated } = state;
  const replacing = useSearchReplace(search, unsaved);
  const { replaceFile, replaceMatch } = replacing;
  const files = result?.files ?? [];
  const toReplace = matchCount(replacing.changing);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [focusRequest]);

  const onInputKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowUp") {
      if (history.older()) e.preventDefault();
    } else if (e.key === "ArrowDown") {
      if (history.newer()) e.preventDefault();
      else if (files.length) {
        e.preventDefault();
        listRef.current?.focus();
      }
    } else if (e.key === "Enter") {
      e.preventDefault();
      remember();
      void search.rerun();
    } else if (e.key === "Escape" && query) {
      e.preventDefault();
      e.stopPropagation();
      setQuery("");
    }
  };

  const open = useCallback(
    (path: string, match: LineMatch, focusEditor: boolean) => {
      remember();
      onOpen(path, match, focusEditor);
    },
    [remember, onOpen],
  );

  const replaceRow = useCallback(
    (row: SearchRow) => {
      if (row.kind === "file") replaceFile(row.path);
      else replaceMatch(row.path, row.match);
    },
    [replaceFile, replaceMatch],
  );

  const toField = useCallback(() => inputRef.current?.focus(), []);

  let status: ReactNode = null;
  if (problem?.kind === "error") {
    status = <span className="text-[var(--accent-red-text)]">Couldn't search: {problem.message}</span>;
  } else if (query && problem?.kind !== "invalid") {
    status = searching ? "Searching…" : result ? resultSummary(result) : null;
    if (status && !searching && updated) {
      status = (
        <>
          {status} · <span className="text-[var(--accent-green)]">Updated</span>
        </>
      );
    }
  }
  const invalid = problem?.kind === "invalid" ? problem : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <FilesSearchField
        inputRef={inputRef}
        query={query}
        onQueryChange={setQuery}
        onKeyDown={onInputKeyDown}
        options={search.options}
        onToggle={search.toggle}
        invalid={invalid?.field === "query" ? invalid.message : null}
        replaceOpen={search.replaceOpen}
        onToggleReplace={search.toggleReplace}
        filtersOpen={search.filtersOpen}
        filtersSet={!!(search.include.trim() || search.exclude.trim())}
        onToggleFilters={search.toggleFilters}
      />
      {search.replaceOpen && (
        <FilesSearchReplace
          value={search.replace}
          onChange={search.setReplace}
          total={problem ? 0 : toReplace}
          busy={replacing.busy}
          onReplaceAll={replacing.requestAll}
          regex={search.options.regex}
        />
      )}
      {search.filtersOpen && (
        <FilesSearchFilters
          values={{ include: search.include, exclude: search.exclude }}
          onChange={(field, text) => (field === "include" ? search.setInclude : search.setExclude)(text)}
          invalid={invalid}
        />
      )}
      {status && (
        <p aria-live="polite" className="break-words px-3 pb-1 pt-1.5 text-[10.5px] text-[var(--text-muted)]">
          {status}
        </p>
      )}
      {files.length > 0 && problem === null && (
        <FilesSearchResults
          listRef={listRef}
          files={files}
          openedKey={openedKey}
          onOpen={open}
          onExitTop={toField}
          onReplace={search.replaceOpen ? replaceRow : undefined}
          literalReplacement={search.replaceOpen && !search.options.regex ? search.replace : undefined}
          unsaved={unsaved}
        />
      )}
      <FilesReplaceDialog
        open={replacing.confirming}
        matches={toReplace}
        files={replacing.changing.length}
        replacement={search.replace}
        unsaved={replacing.unsaved}
        truncated={!!result?.truncated}
        onCancel={replacing.cancelAll}
        onConfirm={replacing.confirmAll}
      />
    </div>
  );
}
