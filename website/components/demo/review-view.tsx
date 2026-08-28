"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { FileText, RefreshCw } from "lucide-react";
import type { ChangedFile, DemoProject, DiffLine } from "./projects";
import { ReviewFileTree } from "./review-file-tree";
import { FOCUS_RING, PRESS } from "./ui";
import { SegmentedControl } from "./ui-kit";

type ReviewSource = "working" | "base" | "staged";

const SOURCE_OPTIONS = [
  { value: "working", label: "Working tree" },
  { value: "base", label: "vs Base" },
  { value: "staged", label: "Staged" },
] as const;

const BASE_FONT_SIZE = 12;
const MIN_FONT_SIZE = 9;
const MAX_FONT_SIZE = 20;

const STATUS_DOT = {
  modified: "bg-[#60a5fa]",
  added: "bg-[#4ade80]",
  deleted: "bg-[#f87171]",
} as const;

const ZOOM_BUTTON = `flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-sm leading-none text-[#919191] transition-colors hover:bg-[#2a2a2a] hover:text-[#e5e5e5] disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-[#919191] ${FOCUS_RING}`;

type DiffRow = { line: DiffLine; oldNo: number | null; newNo: number | null };

// Monaco shows the original and modified line numbers side by side; the hunk
// header is what re-seeds both counters.
function numberDiff(lines: DiffLine[]): DiffRow[] {
  let oldNo = 1;
  let newNo = 1;
  return lines.map((line) => {
    if (line.t === "hunk") {
      const at = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line.text);
      if (at) {
        oldNo = Number(at[1]);
        newNo = Number(at[2]);
      }
      return { line, oldNo: null, newNo: null };
    }
    if (line.t === "add") return { line, oldNo: null, newNo: newNo++ };
    if (line.t === "del") return { line, oldNo: oldNo++, newNo: null };
    return { line, oldNo: oldNo++, newNo: newNo++ };
  });
}

function ReviewHeader({
  project,
  source,
  onSource,
  fontSize,
  onZoom,
  onResetZoom,
  onRefresh,
  refreshing,
}: {
  project: DemoProject;
  source: ReviewSource;
  onSource: (source: ReviewSource) => void;
  fontSize: number;
  onZoom: (delta: number) => void;
  onResetZoom: () => void;
  onRefresh: () => void;
  refreshing: boolean;
}) {
  return (
    <div className="flex h-10 shrink-0 items-center gap-2 border-b border-[#2e2e2e] bg-[#242424]/20 px-3">
      <SegmentedControl<ReviewSource>
        value={source}
        options={SOURCE_OPTIONS}
        onChange={onSource}
        ariaLabel="Change source"
        className="shrink-0"
      />
      <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-[#919191]">
        {project.root}
      </span>
      <div className="flex shrink-0 items-center rounded-lg bg-[#242424]/70 p-0.5">
        <button
          type="button"
          onClick={() => onZoom(-1)}
          disabled={fontSize <= MIN_FONT_SIZE}
          aria-label="Zoom out"
          className={ZOOM_BUTTON}
        >
          &#8722;
        </button>
        <button
          type="button"
          onClick={onResetZoom}
          aria-label="Reset zoom"
          className={`h-6 min-w-[2.75rem] rounded-md px-1 text-[10px] font-medium tabular-nums text-[#919191] transition-colors hover:bg-[#2a2a2a] hover:text-[#e5e5e5] ${FOCUS_RING}`}
        >
          {Math.round((fontSize / BASE_FONT_SIZE) * 100)}%
        </button>
        <button
          type="button"
          onClick={() => onZoom(1)}
          disabled={fontSize >= MAX_FONT_SIZE}
          aria-label="Zoom in"
          className={ZOOM_BUTTON}
        >
          +
        </button>
      </div>
      <div className="h-4 w-px shrink-0 bg-[#2e2e2e]" />
      <button
        type="button"
        onClick={onRefresh}
        aria-label="Refresh changes"
        title="Refresh changes"
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[#919191] hover:bg-[#2a2a2a] hover:text-[#e5e5e5] ${FOCUS_RING} ${PRESS}`}
      >
        <RefreshCw
          className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`}
          strokeWidth={2}
        />
      </button>
    </div>
  );
}

function ReviewPlaceholder({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#242424] text-[#919191]">
        <FileText className="h-[18px] w-[18px]" strokeWidth={2} />
      </div>
      <div className="space-y-0.5">
        <p className="text-xs font-medium text-[#b3b3b3]">{title}</p>
        <p className="break-words text-[11px] text-[#919191]">{body}</p>
      </div>
    </div>
  );
}

export function ReviewView({ project }: { project: DemoProject }) {
  const [source, setSource] = useState<ReviewSource>("working");
  const [selectedPath, setSelectedPath] = useState("");
  const [fontSize, setFontSize] = useState(BASE_FONT_SIZE);
  const [refreshing, setRefreshing] = useState(false);
  const refreshTimer = useRef<number | null>(null);

  useEffect(() => () => {
    if (refreshTimer.current) window.clearTimeout(refreshTimer.current);
  }, []);

  const changed = project.changedFiles ?? [];
  // Everything the demo ships is unstaged working-tree work, so the staged
  // source is genuinely empty rather than a copy of the same diff.
  const files: ChangedFile[] = source === "staged" ? [] : changed;
  const file = files.find((f) => f.path === selectedPath) ?? files[0];
  const rows = useMemo(() => (file ? numberDiff(file.diff) : []), [file]);

  const refresh = () => {
    setRefreshing(true);
    if (refreshTimer.current) window.clearTimeout(refreshTimer.current);
    refreshTimer.current = window.setTimeout(() => setRefreshing(false), 600);
  };

  const header = (
    <ReviewHeader
      project={project}
      source={source}
      onSource={setSource}
      fontSize={fontSize}
      onZoom={(delta) =>
        setFontSize((size) =>
          Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, size + delta)),
        )
      }
      onResetZoom={() => setFontSize(BASE_FONT_SIZE)}
      onRefresh={refresh}
      refreshing={refreshing}
    />
  );

  if (!file) {
    return (
      <div className="flex min-h-0 flex-1 flex-col bg-[#1a1a1a]">
        {header}
        <ReviewPlaceholder
          title={source === "staged" ? "Nothing staged" : "Nothing to review"}
          body={
            source === "staged"
              ? "Stage files and they show up here."
              : `Working tree clean${project.git ? ` on ${project.git.branch}` : ""}.`
          }
        />
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-[#1a1a1a]">
      {header}
      <div className="flex min-h-0 flex-1">
        <div className="flex w-64 shrink-0 flex-col border-r border-[#2e2e2e]">
          <div className="flex h-9 shrink-0 items-center justify-between px-3">
            <span className="text-[11px] font-medium text-[#b3b3b3]">
              Changes
            </span>
            <span className="text-[11px] tabular-nums text-[#919191]">
              {files.length}
            </span>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <ReviewFileTree
              files={files}
              selectedPath={file.path}
              onSelect={setSelectedPath}
            />
          </div>
        </div>
        <div className="min-w-0 flex-1 overflow-auto">
          <div className="sticky left-0 top-0 z-10 flex items-center gap-2.5 border-b border-[#2e2e2e] bg-[#242424] px-4 py-2">
            <span
              title={file.status}
              className={`h-1.5 w-1.5 shrink-0 rounded-full ${STATUS_DOT[file.status]}`}
            />
            <span className="truncate text-[11px] font-medium text-[#b3b3b3]">
              {file.path}
            </span>
          </div>
          <div
            className="min-w-max py-1 font-mono"
            style={{ fontSize: `${fontSize}px`, lineHeight: 1.6 }}
          >
            {rows.map((row, i) => {
              if (row.line.t === "hunk") {
                return (
                  <div
                    key={i}
                    className="whitespace-pre bg-[#242424] px-3 text-[#8e8e8e]"
                  >
                    {row.line.text}
                  </div>
                );
              }
              const added = row.line.t === "add";
              const removed = row.line.t === "del";
              const rowBg = added
                ? "bg-[#4ade80]/[0.08]"
                : removed
                  ? "bg-[#f87171]/[0.08]"
                  : "";
              const gutterBg = added
                ? "bg-[#4ade80]/20"
                : removed
                  ? "bg-[#f87171]/20"
                  : "";
              return (
                <div key={i} className={`flex ${rowBg}`}>
                  <span className="sticky left-0 flex shrink-0 select-none bg-[#1a1a1a]">
                    <span className={`flex ${gutterBg}`}>
                      <span className="w-9 px-1.5 text-right tabular-nums text-[#8e8e8e]">
                        {row.oldNo ?? ""}
                      </span>
                      <span className="w-9 px-1.5 text-right tabular-nums text-[#8e8e8e]">
                        {row.newNo ?? ""}
                      </span>
                    </span>
                  </span>
                  <span
                    className={`w-4 shrink-0 select-none text-center ${
                      added ? "text-[#4ade80]" : removed ? "text-[#f87171]" : ""
                    }`}
                  >
                    {added ? "+" : removed ? "-" : ""}
                  </span>
                  <span
                    className={`whitespace-pre pr-4 ${
                      added || removed ? "text-[#cccccc]" : "text-[#8e8e8e]"
                    }`}
                  >
                    {row.line.text.slice(1) || " "}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
