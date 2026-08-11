import { useEffect, useMemo, useRef, useState } from "react";
import { useToolkitCapabilities } from "../../hooks/useToolkitCapabilities";
import type { AgentCapability, CapabilityKind } from "../../toolkit";
import { orderForDisplay } from "../../toolkit";
import { EmptyState } from "../ui/EmptyState";
import { LayersIcon, RefreshIcon, SearchIcon, XIcon } from "../icons";
import { SegmentedControl } from "../ui/SegmentedControl";
import { ToolkitBudget } from "./ToolkitBudget";
import { ToolkitDetail } from "./ToolkitDetail";
import { ToolkitKindChips } from "./ToolkitKindChips";
import { ToolkitList } from "./ToolkitList";
import { ToolkitRoots } from "./ToolkitRoots";

type CliFilter = "all" | "claude" | "codex";

interface ToolkitViewProps {
  cwd: string;
  visible: boolean;
  focused: boolean;
}

// The Toolkit tab (`kind: "toolkit"`, like the memory and review tabs): what
// the agent running in this directory will actually load, and which copy wins
// when two definitions share a name. Read-first — lpm resolves and diagnoses,
// and only edits the markdown files it can author safely.
export function ToolkitView({ cwd, visible, focused }: ToolkitViewProps) {
  const { data, error, loading, refresh } = useToolkitCapabilities(cwd, visible);
  const [cli, setCli] = useState<CliFilter>("all");
  const [kindFilter, setKindFilter] = useState<CapabilityKind | null>(null);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<AgentCapability | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const searchRef = useRef<HTMLInputElement>(null);

  const all = useMemo(() => data?.items ?? [], [data]);

  // The kind chips count what the CLI filter leaves, so their numbers always
  // match what picking one would show.
  const forCli = useMemo(
    () => (cli === "all" ? all : all.filter((i) => i.cli === cli)),
    [all, cli],
  );

  const visibleItems = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = forCli.filter((item) => {
      if (kindFilter && item.kind !== kindFilter) return false;
      if (!needle) return true;
      return (
        item.name.toLowerCase().includes(needle) ||
        item.description.toLowerCase().includes(needle) ||
        item.detail.toLowerCase().includes(needle)
      );
    });
    return orderForDisplay(filtered);
  }, [forCli, kindFilter, query]);

  useEffect(() => {
    setActiveIndex(0);
  }, [cli, kindFilter, query]);

  // Keyboard only while this pane has focus and no detail is open, so it never
  // competes with the terminal beside it.
  const listActive = visible && focused && !selected;
  useEffect(() => {
    if (!listActive) return;
    const onKey = (e: KeyboardEvent) => {
      // The pane can hold focus while the composer — or any other field in it —
      // owns the caret. Bare letters belong to whatever is being typed into.
      const target = e.target as HTMLElement | null;
      const inField =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        Boolean(target?.isContentEditable);
      const ownSearch = target === searchRef.current;
      if (inField && !ownSearch) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      const step = (delta: number) => {
        e.preventDefault();
        setActiveIndex((i) =>
          Math.max(0, Math.min(visibleItems.length - 1, i + delta)),
        );
      };

      if (e.key === "ArrowDown" || (!inField && e.key === "j")) step(1);
      else if (e.key === "ArrowUp" || (!inField && e.key === "k")) step(-1);
      else if (e.key === "Enter") {
        const cap = visibleItems[activeIndex];
        if (!cap) return;
        e.preventDefault();
        setSelected(cap);
      } else if (e.key === "/" && !inField) {
        e.preventDefault();
        searchRef.current?.focus();
      } else if (e.key === "Escape" && (query || ownSearch)) {
        e.stopPropagation();
        setQuery("");
        searchRef.current?.blur();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [listActive, visibleItems, activeIndex, query]);

  if (selected) {
    return (
      <ToolkitDetail cap={selected} onBack={() => setSelected(null)} onSaved={refresh} />
    );
  }

  const filtering = Boolean(query.trim()) || kindFilter !== null || cli !== "all";
  const pendingOnTrust = all.filter((i) => i.problem.includes("not trusted")).length;

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-[var(--bg-primary)]">
      <div className="flex items-center gap-2 border-b border-[var(--border)] px-2 py-1.5">
        <SegmentedControl
          value={cli}
          options={[
            { value: "all", label: "All" },
            { value: "claude", label: "Claude" },
            { value: "codex", label: "Codex" },
          ]}
          onChange={(v) => setCli(v as CliFilter)}
          variant="subtle"
          ariaLabel="Agent CLI"
        />
        <label className="flex min-w-0 flex-1 items-center gap-1.5 text-[var(--text-muted)] [&>svg]:h-3.5 [&>svg]:w-3.5">
          <SearchIcon />
          <input
            ref={searchRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter (/)"
            spellCheck={false}
            aria-label="Filter capabilities"
            className="min-w-0 flex-1 bg-transparent text-[12px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Clear filter"
              className="shrink-0 rounded p-0.5 transition-colors hover:text-[var(--text-primary)] [&>svg]:h-3 [&>svg]:w-3"
            >
              <XIcon />
            </button>
          )}
        </label>
        {filtering && data && (
          <span className="shrink-0 text-[10px] tabular-nums text-[var(--text-muted)]">
            {visibleItems.length}/{all.length}
          </span>
        )}
        <button
          onClick={refresh}
          disabled={loading}
          title="Re-scan"
          aria-label="Re-scan"
          className="shrink-0 rounded-md p-1 text-[var(--text-muted)] transition-colors hover:text-[var(--text-secondary)]"
        >
          <span className={loading ? "flex animate-spin" : "flex"}>
            <RefreshIcon />
          </span>
        </button>
      </div>

      {error && (
        <p className="border-b border-[var(--border)] px-3 py-1.5 text-[11px] text-[var(--accent-red)]">
          {error}
        </p>
      )}
      {data?.truncated && (
        <p className="border-b border-[var(--border)] px-3 py-1.5 text-[11px] text-[var(--accent-amber)]">
          Too many capability files to list them all — this view is incomplete.
        </p>
      )}
      {data?.remote && (
        <p className="border-b border-[var(--border)] px-3 py-1.5 text-[11px] text-[var(--text-muted)]">
          Scanned over SSH — remote capabilities are read-only here.
        </p>
      )}
      {/* Only when something is actually blocked by it. An untrusted directory
          with no project servers has nothing to warn about. */}
      {pendingOnTrust > 0 && (
        <p className="border-b border-[var(--border)] px-3 py-1.5 text-[11px] leading-snug text-[var(--accent-amber)]">
          {pendingOnTrust} project MCP server{pendingOnTrust === 1 ? "" : "s"} will not
          start until you trust this directory in Claude Code.
        </p>
      )}

      {!data ? (
        <EmptyState
          title={loading ? "Scanning…" : "Nothing scanned yet"}
          body="Toolkit reads the skills, MCP servers and plugins the agent in this directory would load."
          icon={<LayersIcon />}
        />
      ) : all.length === 0 ? (
        <EmptyState
          title="No capabilities found"
          body="Nothing is installed for Claude Code or Codex in this directory or your home."
          icon={<LayersIcon />}
        />
      ) : (
        <>
          <ToolkitBudget items={forCli} />
          <ToolkitKindChips items={forCli} value={kindFilter} onChange={setKindFilter} />
          {visibleItems.length === 0 ? (
            <div className="min-h-0 flex-1">
              <EmptyState
                title="No matches"
                body="Nothing here matches that filter. Press esc to clear it."
              />
            </div>
          ) : (
            <ToolkitList
              items={visibleItems}
              activeIndex={activeIndex}
              onHover={setActiveIndex}
              onActivate={setSelected}
            />
          )}
          <ToolkitRoots data={data} />
        </>
      )}
    </div>
  );
}
