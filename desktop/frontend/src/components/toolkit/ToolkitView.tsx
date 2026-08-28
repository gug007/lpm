import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useToolkitCapabilities } from "../../hooks/useToolkitCapabilities";
import type { AgentCapability, CapabilityKind } from "../../toolkit";
import { KIND_LABELS, needsAttention, shortPath } from "../../toolkit";
import { buildList, visibleItems as itemsOf } from "../../toolkitList";
import { rowSummary } from "../../toolkitRowText";
import { skillDestinations, skillName, skillSiblings } from "../../toolkitSkill";
import { AIButton } from "../ui/AIButton";
import { EmptyState } from "../ui/EmptyState";
import { LayersIcon } from "../icons";
import { ToolkitBudget } from "./ToolkitBudget";
import { ToolkitCreate } from "./ToolkitCreate";
import { ToolkitDetail } from "./ToolkitDetail";
import { ToolkitHeader, type CliFilter } from "./ToolkitHeader";
import { ToolkitList } from "./ToolkitList";
import { ToolkitRoots } from "./ToolkitRoots";
import { SURFACE_TOKENS } from "./surfaces";

// Sentinel for "every group open", used while a filter is live so a match can
// never hide behind a folded heading.
const ALL_GROUPS: ReadonlySet<string> = {
  has: () => true,
} as unknown as ReadonlySet<string>;

function Notice({ tone, children }: { tone: "warn" | "bad"; children: React.ReactNode }) {
  return (
    <p
      className={`shrink-0 rounded-[var(--tk-radius)] px-3 py-2 text-[10.5px] leading-snug ${
        tone === "bad"
          ? "bg-[color-mix(in_srgb,var(--accent-red)_12%,var(--bg-primary))] text-[var(--accent-red-text)]"
          : "bg-[var(--tk-fault)] text-[var(--accent-amber-text)]"
      }`}
    >
      {children}
    </p>
  );
}

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
  const { data, error, loading, scannedAt, refresh } = useToolkitCapabilities(cwd, visible);
  const [cli, setCli] = useState<CliFilter>("all");
  const [kindFilter, setKindFilter] = useState<CapabilityKind | null>(null);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<AgentCapability | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  // Plugin blocks and the disabled pile start folded: one vendor shipping a
  // dozen skills should not bury everything the user installed themselves.
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const [creating, setCreating] = useState(false);
  const [seedName, setSeedName] = useState("");
  const [pending, setPending] = useState<{ path: string; after: number } | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const all = useMemo(() => data?.items ?? [], [data]);

  // Skills are the only kind lpm authors, and the remote scan registers no
  // skill root, so there is nowhere to write one over SSH.
  const destinations = useMemo(() => skillDestinations(data?.roots ?? []), [data]);
  const canCreate = data !== null && !data.remote && destinations.length > 0;

  const forCli = useMemo(
    () => (cli === "all" ? all : all.filter((i) => i.cli === cli)),
    [all, cli],
  );

  const matched = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return forCli.filter((item) => {
      if (kindFilter && item.kind !== kindFilter) return false;
      if (!needle) return true;
      return (
        item.name.toLowerCase().includes(needle) ||
        item.description.toLowerCase().includes(needle) ||
        item.detail.toLowerCase().includes(needle)
      );
    });
  }, [forCli, kindFilter, query]);

  // A live filter expands every group: hiding a match behind a collapsed
  // heading makes the search look broken.
  const nodes = useMemo(
    () => buildList(matched, query.trim() ? ALL_GROUPS : expanded),
    [matched, expanded, query],
  );
  const visibleItems = useMemo(() => itemsOf(nodes), [nodes]);

  // What each kind contributed to the faults panel, so a kind's heading can say
  // that two of its own are sitting above rather than silently missing.
  const flaggedByKind = useMemo(() => {
    const counts = new Map<CapabilityKind, number>();
    for (const item of matched) {
      if (!needsAttention(item)) continue;
      counts.set(item.kind, (counts.get(item.kind) ?? 0) + 1);
    }
    return counts;
  }, [matched]);

  // Counted from every item, never from `matched`: what a plugin contributes
  // does not change because you typed in the filter.
  const summarise = useCallback(
    (cap: AgentCapability) => rowSummary(cap, all),
    [all],
  );

  const startCreate = useCallback((seed: string) => {
    setSeedName(seed);
    setCreating(true);
  }, []);

  const openByPath = useCallback(
    (path: string) => {
      const cap = all.find((i) => i.path === path);
      if (!cap) return;
      setCreating(false);
      setSelected(cap);
    },
    [all],
  );

  const handleCreated = useCallback(
    (path: string) => {
      setCreating(false);
      setPending({ path, after: scannedAt });
      void refresh();
    },
    [refresh, scannedAt],
  );

  // The new skill opens once a scan that started after it was written lands.
  // `refresh` keeps the previous listing on screen while it runs, so waiting on
  // `data` alone would read the pre-create scan and give up immediately.
  useEffect(() => {
    if (!pending || !data || scannedAt <= pending.after) return;
    const made = data.items.find((i) => i.path === pending.path);
    setPending(null);
    if (made) setSelected(made);
  }, [data, scannedAt, pending]);

  const toggleGroup = useCallback((id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  useEffect(() => {
    setActiveIndex(0);
  }, [cli, kindFilter, query]);

  // Keyboard only while this pane has focus and no detail is open, so it never
  // competes with the terminal beside it.
  const listActive = visible && focused && !selected && !creating;
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

      // Enter belongs to whatever control has focus — a heading, the re-scan
      // button, a group toggle, or a row, all of which activate themselves on
      // click. Handling it here would suppress that and open an unrelated row.
      const onControl = Boolean(target?.closest("button,[role=button],a,select"));
      if (e.key === "Enter" && onControl && !ownSearch) return;

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
      } else if (e.key === "n" && !inField && canCreate) {
        e.preventDefault();
        startCreate("");
      } else if (e.key === "/" && !inField) {
        e.preventDefault();
        searchRef.current?.focus();
      } else if (e.key === "Escape" && (query || kindFilter || ownSearch)) {
        e.stopPropagation();
        setQuery("");
        setKindFilter(null);
        searchRef.current?.blur();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [listActive, visibleItems, activeIndex, query, kindFilter, canCreate, startCreate]);

  if (creating) {
    return (
      <ToolkitCreate
        cwd={cwd}
        roots={data?.roots ?? []}
        items={all}
        truncated={data?.truncated ?? false}
        cli={cli}
        seedName={seedName}
        active={visible && focused}
        onBack={() => setCreating(false)}
        onCreated={handleCreated}
        onOpenExisting={openByPath}
      />
    );
  }

  if (selected) {
    return (
      <ToolkitDetail
        cap={selected}
        cwd={cwd}
        // The folder, not its SKILL.md: the sentence reads "a copy is also in …".
        siblingPaths={skillSiblings(selected, all).map((s) =>
          shortPath(s.path.replace(/\/SKILL\.md$/, "")),
        )}
        deletable={!data?.remote}
        active={visible && focused}
        onBack={() => setSelected(null)}
        onSaved={refresh}
        onDeleted={() => {
          setSelected(null);
          void refresh();
        }}
      />
    );
  }

  const filtering = Boolean(query.trim()) || kindFilter !== null;
  // What the user just looked for and did not find is usually what they are
  // about to write.
  const seedFromQuery = skillName(query);
  const attention = matched.filter(needsAttention).length;
  const pendingOnTrust = all.filter((i) => i.problem.includes("not trusted")).length;

  return (
    <div
      style={SURFACE_TOKENS}
      className="flex min-h-0 flex-1 flex-col gap-2 bg-[var(--bg-primary)] p-2"
    >
      <ToolkitHeader
        cli={cli}
        onCli={setCli}
        query={query}
        onQuery={setQuery}
        count={forCli.length}
        loading={loading}
        onRescan={refresh}
        canCreate={canCreate}
        onCreate={() => startCreate("")}
        searchRef={searchRef}
      />

      {data && all.length > 0 && (
        <p className="shrink-0 truncate px-1 text-[10.5px] leading-[15px] tabular-nums text-[var(--text-muted)]">
          {/* Counted over the chosen CLI, never over both: the panels below
              show that set, and a total that disagrees with them reads as a
              bug. */}
          <span className="text-[var(--text-secondary)]">
            {filtering
              ? `${matched.length} of ${forCli.length} match`
              : `${forCli.length} capabilities`}
          </span>
          {attention > 0 && ` · ${attention} need attention`}
          {kindFilter && (
            <>
              {" · "}
              <button
                type="button"
                onClick={() => setKindFilter(null)}
                className="text-[var(--text-secondary)] underline decoration-dotted underline-offset-2"
              >
                {KIND_LABELS[kindFilter].toLowerCase()} only — show everything
              </button>
            </>
          )}
        </p>
      )}

      {error && <Notice tone="bad">{error}</Notice>}
      {data?.truncated && (
        <Notice tone="warn">
          Too many capability files to list them all — this view is incomplete.
        </Notice>
      )}
      {data?.remote && (
        <p className="shrink-0 px-1 text-[10.5px] text-[var(--text-muted)]">
          Scanned over SSH — remote capabilities are read-only here.
        </p>
      )}
      {/* Only when something is actually blocked by it. An untrusted directory
          with no project servers has nothing to warn about. */}
      {pendingOnTrust > 0 && (
        <Notice tone="warn">
          {pendingOnTrust} project MCP server{pendingOnTrust === 1 ? "" : "s"} will not start
          until you trust this directory in Claude Code.
        </Notice>
      )}

      {!data ? (
        <EmptyState
          title={loading ? "Scanning…" : "Nothing scanned yet"}
          body="Skills & tools reads the skills, MCP servers and plugins the agent in this directory would load."
          icon={<LayersIcon />}
        />
      ) : all.length === 0 ? (
        <EmptyState
          title="No capabilities found"
          body="Nothing is installed for Claude Code or Codex in this directory or your home."
          icon={<LayersIcon />}
        >
          {canCreate && (
            <div className="mt-4">
              <AIButton onClick={() => startCreate("")}>
                New skill
              </AIButton>
            </div>
          )}
        </EmptyState>
      ) : (
        <>
          {/* Only ever for one CLI: summing what Claude and Codex each load
              would describe a session nobody is running, and a shared
              AGENTS.md would be counted twice. It otherwise follows the
              filter, so the number always describes the rows underneath it. */}
          {cli !== "all" && <ToolkitBudget items={matched} />}
          {/* Nodes, not items: a kind whose members are all plugin-provided
              renders a panel and a folded group with no rows, and counting
              only rows would call that "no matches". */}
          {nodes.length === 0 ? (
            <div className="min-h-0 flex-1">
              <EmptyState
                title="No matches"
                body="Nothing here matches that filter. Press esc to clear it."
              >
                {canCreate && (
                  <div className="mt-4">
                    <AIButton onClick={() => startCreate(seedFromQuery)}>
                      {seedFromQuery ? `New skill "${seedFromQuery}"` : "New skill"}
                    </AIButton>
                  </div>
                )}
              </EmptyState>
            </div>
          ) : (
            <ToolkitList
              nodes={nodes}
              summarise={summarise}
              flaggedByKind={flaggedByKind}
              showCli={cli === "all"}
              activeIndex={activeIndex}
              onHover={setActiveIndex}
              onActivate={setSelected}
              onToggleGroup={toggleGroup}
              onFilterKind={(kind) => setKindFilter((prev) => (prev === kind ? null : kind))}
            />
          )}
          <ToolkitRoots data={data} />
        </>
      )}
    </div>
  );
}
