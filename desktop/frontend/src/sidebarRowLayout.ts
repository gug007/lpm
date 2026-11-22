// Which details a project's sidebar row shows and where: up to four lines,
// each with a left side (after the name on line 1) and a right side. Line 1
// always holds the dot and the name; a lower line shows only for a project it
// has something to say about.

export const ROW_DETAILS = [
  "status",
  "alert",
  "pr",
  "checks",
  "origin",
  "ahead",
  "branch",
  "changes",
  "files",
  "commit",
  "ports",
  "version",
] as const;

export type RowDetail = (typeof ROW_DETAILS)[number];
export type RowSide = "left" | "right";

export interface RowLine {
  left: RowDetail[];
  right: RowDetail[];
}

export type ChangesSince = "commit" | "branch";

export interface SidebarRowLayout {
  lines: RowLine[];
  hideDefaultBranch: boolean;
  changesSince: ChangesSince;
  prStateWord: boolean;
  checksOnlyFailing: boolean;
}

export const MAX_ROW_LINES = 4;

export type RowPresetId = "today" | "two" | "three" | "all";

export const ROW_PRESETS: Record<RowPresetId, RowLine[]> = {
  today: [
    { left: ["alert"], right: ["origin"] },
    { left: ["status"], right: [] },
  ],
  two: [
    { left: ["alert"], right: ["pr", "checks", "origin"] },
    { left: ["status", "branch", "changes"], right: ["commit"] },
  ],
  three: [
    { left: ["alert"], right: ["pr", "checks", "origin"] },
    { left: ["status", "branch"], right: ["ahead"] },
    { left: ["changes", "files"], right: ["ports", "commit"] },
  ],
  all: [
    { left: ["alert"], right: ["pr", "checks", "origin"] },
    { left: ["status", "branch", "changes", "files"], right: ["ahead", "commit"] },
    { left: ["ports"], right: ["version"] },
  ],
};

export const ROW_PRESET_LABELS: Record<RowPresetId, string> = {
  today: "Classic",
  two: "Two lines",
  three: "Three lines",
  all: "Everything",
};

const copyLines = (lines: readonly RowLine[]): RowLine[] =>
  lines.map((l) => ({ left: [...l.left], right: [...l.right] }));

export const DEFAULT_ROW_LAYOUT: SidebarRowLayout = {
  lines: copyLines(ROW_PRESETS.today),
  hideDefaultBranch: true,
  changesSince: "commit",
  prStateWord: false,
  checksOnlyFailing: false,
};

const isDetail = (v: unknown): v is RowDetail => typeof v === "string" && (ROW_DETAILS as readonly string[]).includes(v);

// A detail sits in one place only, so the first time it appears wins.
export function normalizeRowLayout(raw: unknown): SidebarRowLayout {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_ROW_LAYOUT, lines: copyLines(DEFAULT_ROW_LAYOUT.lines) };
  const r = raw as Partial<Record<keyof SidebarRowLayout, unknown>>;
  const seen = new Set<RowDetail>();
  const side = (v: unknown): RowDetail[] => {
    if (!Array.isArray(v)) return [];
    const out: RowDetail[] = [];
    for (const d of v) {
      if (!isDetail(d) || seen.has(d)) continue;
      seen.add(d);
      out.push(d);
    }
    return out;
  };
  const rawLines = Array.isArray(r.lines) ? r.lines.slice(0, MAX_ROW_LINES) : null;
  const lines = rawLines
    ? rawLines.map((l) => {
        const line = (l && typeof l === "object" ? l : {}) as Partial<Record<RowSide, unknown>>;
        return { left: side(line.left), right: side(line.right) };
      })
    : copyLines(DEFAULT_ROW_LAYOUT.lines);
  if (lines.length === 0) lines.push({ left: [], right: [] });
  return {
    lines,
    hideDefaultBranch: typeof r.hideDefaultBranch === "boolean" ? r.hideDefaultBranch : DEFAULT_ROW_LAYOUT.hideDefaultBranch,
    changesSince: r.changesSince === "branch" ? "branch" : "commit",
    prStateWord: r.prStateWord === true,
    checksOnlyFailing: r.checksOnlyFailing === true,
  };
}

export function presetOf(lines: readonly RowLine[]): RowPresetId | null {
  const key = JSON.stringify(lines);
  return (Object.keys(ROW_PRESETS) as RowPresetId[]).find((id) => JSON.stringify(ROW_PRESETS[id]) === key) ?? null;
}

export function presetLines(id: RowPresetId): RowLine[] {
  return copyLines(ROW_PRESETS[id]);
}

export function placedDetails(lines: readonly RowLine[]): Set<RowDetail> {
  return new Set(lines.flatMap((l) => [...l.left, ...l.right]));
}

export function layoutShows(layout: SidebarRowLayout, ...details: RowDetail[]): boolean {
  const placed = placedDetails(layout.lines);
  return details.some((d) => placed.has(d));
}

// Pull requests and checks are matched to the branch the checkout is on, so
// they need the checkout's stats too.
export function rowStatsWanted(layout: SidebarRowLayout): boolean {
  return layoutShows(layout, "branch", "changes", "files", "commit", "version", "pr", "checks");
}

export interface RowSlot {
  line: number;
  side: RowSide;
}

// Takes `detail` out of wherever it is and, unless `to` is null (hidden),
// puts it at `index` of that side, or at its end.
export function moveDetail(lines: readonly RowLine[], detail: RowDetail, to: RowSlot | null, index?: number): RowLine[] {
  const next = copyLines(lines).map((l) => ({
    left: l.left.filter((d) => d !== detail),
    right: l.right.filter((d) => d !== detail),
  }));
  if (!to || !next[to.line]) return next;
  const list = next[to.line][to.side];
  const at = index === undefined ? list.length : Math.max(0, Math.min(index, list.length));
  list.splice(at, 0, detail);
  return next;
}

export function addLine(lines: readonly RowLine[]): RowLine[] {
  if (lines.length >= MAX_ROW_LINES) return copyLines(lines);
  return [...copyLines(lines), { left: [], right: [] }];
}

// Line 1 holds the name, so it stays; a removed line's details go back to the
// hidden ones.
export function removeLine(lines: readonly RowLine[], index: number): RowLine[] {
  if (index <= 0) return copyLines(lines);
  return copyLines(lines).filter((_, i) => i !== index);
}

// What one project's row draws: line 1 always, a lower line only while one of
// its details has something to say, and each side only the details that do.
export function visibleLines(lines: readonly RowLine[], has: (detail: RowDetail) => boolean): RowLine[] {
  const out: RowLine[] = [];
  lines.forEach((line, i) => {
    const left = line.left.filter(has);
    const right = line.right.filter(has);
    if (i === 0 || left.length > 0 || right.length > 0) out.push({ left, right });
  });
  return out;
}
