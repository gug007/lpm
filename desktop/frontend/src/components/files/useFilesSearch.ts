import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CancelFileSearch, SearchFiles } from "../../../bridge/commands";
import { useGitChanged } from "../../hooks/useGitChanged";
import { toSlash, windowsRules } from "../../path";
import {
  globList,
  type SearchField,
  type SearchFilters,
  type SearchOptions,
  type SearchResult,
} from "./fileSearch";
import { useSearchHistory, type SearchEntry } from "./useSearchHistory";

const OPTIONS_KEY = "lpm:filesSearchOptions";
const DEBOUNCE_MS = 200;
// How soon the results follow a change on disk, and so at most how often.
const REFRESH_MS = 500;
const UPDATED_MS = 4000;

type SearchProblem =
  | { kind: "invalid"; field: SearchField; message: string }
  | { kind: "error"; message: string };

interface SearchState {
  searching: boolean;
  result: SearchResult | null;
  problem: SearchProblem | null;
  // A refresh after a change on disk just changed the results.
  updated: boolean;
}

interface SearchSpec {
  query: string;
  options: SearchOptions;
  filters: SearchFilters;
  // Sent only for a regex, whose `$1` each match fills in its own way; a plain
  // replacement reads the same on every row.
  replacement: string | null;
}

interface SearchReply extends SearchResult {
  invalid?: { field: SearchField; message: string } | null;
}

const IDLE: SearchState = { searching: false, result: null, problem: null, updated: false };
const NO_OPTIONS: SearchOptions = { matchCase: false, wholeWord: false, regex: false };

function readOptions(): SearchOptions {
  try {
    return { ...NO_OPTIONS, ...JSON.parse(localStorage.getItem(OPTIONS_KEY) ?? "{}") };
  } catch {
    return NO_OPTIONS;
  }
}

// What is searched, leaving out the replacement, which only changes previews.
const searchedFor = ({ query, options, filters }: SearchSpec) => JSON.stringify([query, options, filters]);

// Where each match is, to tell whether a refresh moved anything.
const placesOf = (result: SearchResult) =>
  result.files.map((f) => `${f.path}:${f.matches.map((m) => `${m.line}.${m.col}`).join(",")}`).join("|");

// The Files tab's Search view: the query, its toggles, file filters and
// replacement, and the search they run as the user types. A newer search
// stops the one still running, so only the last answer ever lands. While the
// view shows, a change on disk (an agent at work) runs it again quietly.
export function useFilesSearch(root: string, active: boolean) {
  const [token] = useState(() => crypto.randomUUID());
  const [open, setOpen] = useState(false);
  const [query, setQueryText] = useState("");
  const [options, setOptions] = useState(readOptions);
  const [include, setIncludeText] = useState("");
  const [exclude, setExcludeText] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [replace, setReplace] = useState("");
  const [replaceOpen, setReplaceOpen] = useState(false);
  const [state, setState] = useState<SearchState>(IDLE);
  const [focusRequest, setFocusRequest] = useState(0);
  const seq = useRef(0);
  const running = useRef(false);
  const timer = useRef<number | undefined>(undefined);
  const refreshTimer = useRef<number | undefined>(undefined);
  const refreshing = useRef(false);
  const refreshAgain = useRef(false);
  const searched = useRef<string | null>(null);

  const replacement = replaceOpen && options.regex ? replace : null;
  const spec = useMemo<SearchSpec>(
    () => ({
      query,
      options,
      filters: { include: globList(include), exclude: globList(exclude) },
      replacement,
    }),
    [query, options, include, exclude, replacement],
  );
  const specRef = useRef(spec);
  specRef.current = spec;

  const run = useCallback(
    async (s: SearchSpec, quiet: boolean) => {
      window.clearTimeout(timer.current);
      const mine = ++seq.current;
      running.current = true;
      if (!quiet) setState((st) => ({ ...st, searching: true }));
      try {
        const reply = (await SearchFiles(root, s.query, s.options, s.filters, s.replacement, token)) as SearchReply;
        if (mine !== seq.current) return;
        if (reply.invalid) {
          setState({ ...IDLE, problem: { kind: "invalid", ...reply.invalid } });
          return;
        }
        const slash = windowsRules(root);
        const files = (reply.files ?? []).map((f) => (slash ? { ...f, path: toSlash(f.path, true) } : f));
        const result = { files, truncated: !!reply.truncated };
        setState((prev) => {
          // A refresh that finds what is shown leaves the rows be.
          if (quiet && prev.result && JSON.stringify(prev.result) === JSON.stringify(result)) {
            return prev.searching ? { ...prev, searching: false } : prev;
          }
          const updated = quiet && prev.result !== null && placesOf(prev.result) !== placesOf(result);
          return { searching: false, result, problem: null, updated };
        });
      } catch (err) {
        if (mine !== seq.current) return;
        // A refresh that fails leaves the results it would have replaced.
        if (quiet) return setState((st) => ({ ...st, searching: false }));
        setState({ ...IDLE, problem: { kind: "error", message: String(err) } });
      } finally {
        if (mine === seq.current) running.current = false;
      }
    },
    [root, token],
  );

  const stop = useCallback(() => {
    seq.current++;
    if (!running.current) return;
    running.current = false;
    CancelFileSearch(root, token).catch(() => {});
  }, [root, token]);

  useEffect(() => {
    stop();
    if (!spec.query) {
      searched.current = null;
      setState(IDLE);
      return;
    }
    // A regex replacement being typed keeps the results on screen while
    // their previews catch up.
    const quiet = searched.current === searchedFor(spec);
    searched.current = searchedFor(spec);
    if (!quiet) setState((s) => ({ ...s, searching: true }));
    timer.current = window.setTimeout(() => void run(spec, quiet), DEBOUNCE_MS);
    return () => window.clearTimeout(timer.current);
  }, [spec, run, stop]);

  useEffect(() => {
    if (!state.updated) return;
    const clear = window.setTimeout(() => setState((s) => ({ ...s, updated: false })), UPDATED_MS);
    return () => window.clearTimeout(clear);
  }, [state.updated, state.result]);

  useEffect(() => {
    try {
      localStorage.setItem(OPTIONS_KEY, JSON.stringify(options));
    } catch {
      // The toggles still apply; they just aren't remembered.
    }
  }, [options]);

  useEffect(
    () => () => {
      stop();
      window.clearTimeout(refreshTimer.current);
    },
    [stop],
  );

  // Runs the search again; a quiet run keeps the results up while it does.
  const rerun = useCallback((quiet = false) => run(specRef.current, quiet), [run]);

  // One quiet refresh at a time: a change during one asks for one more, so a
  // search slower than the changes still lands.
  const refresh = useCallback(async () => {
    if (!specRef.current.query) return;
    if (refreshing.current) {
      refreshAgain.current = true;
      return;
    }
    refreshing.current = true;
    do {
      refreshAgain.current = false;
      await rerun(true);
    } while (refreshAgain.current);
    refreshing.current = false;
  }, [rerun]);

  const onDiskChange = useCallback(() => {
    if (refreshTimer.current !== undefined) return;
    refreshTimer.current = window.setTimeout(() => {
      refreshTimer.current = undefined;
      void refresh();
    }, REFRESH_MS);
  }, [refresh]);
  useGitChanged(root, onDiskChange, active && open && query !== "");

  const apply = useCallback((entry: SearchEntry) => {
    setQueryText(entry.query);
    setOptions(entry.options);
    setIncludeText(entry.include);
    setExcludeText(entry.exclude);
    if (entry.include || entry.exclude) setFiltersOpen(true);
  }, []);
  const history = useSearchHistory(root, { query, options, include, exclude }, apply);
  const { stopBrowsing } = history;

  const setQuery = useCallback(
    (text: string) => {
      stopBrowsing();
      setQueryText(text);
    },
    [stopBrowsing],
  );
  const setInclude = useCallback(
    (text: string) => {
      stopBrowsing();
      setIncludeText(text);
    },
    [stopBrowsing],
  );
  const setExclude = useCallback(
    (text: string) => {
      stopBrowsing();
      setExcludeText(text);
    },
    [stopBrowsing],
  );

  const show = useCallback((seed?: string) => {
    setOpen(true);
    if (seed) setQueryText(seed);
    setFocusRequest((n) => n + 1);
  }, []);

  const hide = useCallback(() => setOpen(false), []);

  const toggle = useCallback((key: keyof SearchOptions) => {
    setOptions((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const toggleFilters = useCallback(() => setFiltersOpen((v) => !v), []);
  const toggleReplace = useCallback(() => setReplaceOpen((v) => !v), []);

  return {
    root,
    token,
    open,
    show,
    hide,
    query,
    setQuery,
    options,
    toggle,
    include,
    setInclude,
    exclude,
    setExclude,
    filtersOpen,
    toggleFilters,
    replace,
    setReplace,
    replaceOpen,
    toggleReplace,
    state,
    focusRequest,
    rerun,
    refresh,
    history,
  };
}

export type FilesSearchModel = ReturnType<typeof useFilesSearch>;
