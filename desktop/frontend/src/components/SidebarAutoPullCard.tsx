import { useEffect, useLayoutEffect, useRef, useState, type RefObject, type SyntheticEvent } from "react";
import { createPortal } from "react-dom";
import { toast } from "../notifications/toast";
import { autoPullState, normalizeAutoPullMode } from "../autoPull";
import { autoPullSoon, autoPullWait, openAutoPullSettings, setProjectAutoPull, type AutoPullWait } from "../autoPullRun";
import { besideRow } from "../besideRow";
import { originMarkTitle, type OriginMark } from "../originStatus";
import { useAppStore } from "../store/app";
import { useOriginStatus } from "../store/originStatus";
import { useSettingsStore } from "../store/settings";
import type { ProjectInfo } from "../types";
import { displayNameForProjectName } from "./ProjectNameDisplay";

const WIDTH = 272;

const PRIMARY =
  "rounded-md bg-[var(--text-primary)] px-2.5 py-1 text-[11px] font-medium text-[var(--bg-primary)] transition-opacity hover:opacity-85";
const SECONDARY =
  "rounded-md border border-[var(--border)] px-2.5 py-1 text-[11px] font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-active)]";

function waitText(wait: AutoPullWait, name: string, changes: number): string {
  switch (wait) {
    case "changes":
      return `Auto pull is on. It waits while ${changes === 1 ? "1 file has" : `${changes} files have`} uncommitted changes.`;
    case "agent":
      return "Auto pull is on. It waits for the agent working here to finish.";
    case "failed":
      return "Auto pull is on, but git stopped the last try. Pull by hand to see why.";
    case "undone":
      return "Auto pull is on. You undid this pull, so it waits for newer commits.";
    case "next":
      return `Auto pull is on. It pulls ${name} on the next check.`;
  }
}

// The card beside a project's "↓ Pull" in the sidebar: what origin has, then
// either a one-click way to turn auto pull on or why it hasn't pulled yet, and
// where the setting lives.
export function SidebarAutoPullCard({
  anchorRef,
  project,
  mark,
  onPointerEnter,
  onPointerLeave,
  onClose,
}: {
  anchorRef: RefObject<HTMLElement | null>;
  project: ProjectInfo;
  mark: OriginMark;
  onPointerEnter: () => void;
  onPointerLeave: () => void;
  onClose: () => void;
}) {
  const projects = useAppStore((s) => s.projects);
  const mode = useSettingsStore((s) => normalizeAutoPullMode(s.autoPull));
  const update = useSettingsStore((s) => s.update);
  const status = useOriginStatus((s) => s.entries[project.root]?.status);
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    const anchor = anchorRef.current?.getBoundingClientRect();
    const panel = ref.current;
    if (!anchor || !panel) return;
    setPos(besideRow(anchor, WIDTH, panel.offsetHeight, anchor.top - 10));
  }, [anchorRef]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const name = displayNameForProjectName(project.name, projects);
  const state = autoPullState(project, projects, mode);
  const parentName = project.parentName ? displayNameForProjectName(project.parentName, projects) : "";

  const done = (text: string) => {
    onClose();
    toast.success(text, { description: "Change it any time in Settings › Git › Auto pull." });
  };
  const turnOnAll = () => {
    void update({ autoPull: "all" });
    autoPullSoon();
    done("Auto pull is on for all projects");
  };
  const turnOnHere = async () => {
    if (mode === "off") await update({ autoPull: "chosen" });
    if (await setProjectAutoPull(project.name, true)) done(`Auto pull is on for ${name}`);
  };
  const openSettings = () => {
    onClose();
    openAutoPullSettings();
  };

  const why =
    state.source === "project"
      ? `It’s turned off for ${name} in its Git menu.`
      : state.source === "parent"
        ? `${name} follows ${parentName}, which has it off.`
        : "";

  // The card is portaled, but React still bubbles its events to the row it
  // belongs to: keep its clicks from selecting, starting or dragging the row.
  const stop = (e: SyntheticEvent) => e.stopPropagation();

  return createPortal(
    <div
      ref={ref}
      role="dialog"
      aria-label="Auto pull"
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
      onClick={stop}
      onDoubleClick={stop}
      onPointerDown={stop}
      onMouseDown={stop}
      onContextMenu={stop}
      style={{ top: pos?.top ?? 0, left: pos?.left ?? 0, width: WIDTH, visibility: pos ? "visible" : "hidden" }}
      className="tooltip-in fixed z-[9999] flex flex-col gap-2.5 rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] p-3 text-left shadow-[0_1px_3px_rgba(0,0,0,0.12),0_12px_32px_rgba(0,0,0,0.24)]"
    >
      <p className="text-[12px] font-medium text-[var(--text-primary)]">
        {originMarkTitle(mark, status?.branch ?? "")}
      </p>
      {state.on ? (
        <p className="text-[11px] leading-snug text-[var(--text-secondary)]">
          {waitText(autoPullWait(project), name, status?.changes ?? 0)}
        </p>
      ) : (
        <>
          <p className="text-[11px] leading-snug text-[var(--text-secondary)]">
            Turn on auto pull and lpm pulls {name} by itself whenever it has no uncommitted changes and nothing to push.
            {why && ` ${why}`}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {mode === "off" ? (
              <>
                <button type="button" className={PRIMARY} onClick={turnOnAll}>
                  Turn on for all projects
                </button>
                <button type="button" className={`${SECONDARY} max-w-full truncate`} onClick={() => void turnOnHere()}>
                  Only {name}
                </button>
              </>
            ) : (
              <>
                <button type="button" className={`${PRIMARY} max-w-full truncate`} onClick={() => void turnOnHere()}>
                  Turn on for {name}
                </button>
                {mode === "chosen" && (
                  <button type="button" className={SECONDARY} onClick={turnOnAll}>
                    All projects
                  </button>
                )}
              </>
            )}
          </div>
        </>
      )}
      <p className="border-t border-[var(--border)] pt-2 text-[10.5px] leading-snug text-[var(--text-muted)]">
        Change it in{" "}
        <button
          type="button"
          onClick={openSettings}
          className="text-[var(--accent-sky-text)] hover:underline focus-visible:underline focus-visible:outline-none"
        >
          Settings › Git › Auto pull
        </button>
        , or for one project in its Git menu.
      </p>
    </div>,
    document.body,
  );
}
