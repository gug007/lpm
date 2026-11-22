import { RotateCcw, X } from "lucide-react";
import { useRowDataOf } from "../hooks/useRowDataOf";
import { useRowFetchLayout, useSidebarRowLayout } from "../hooks/useSidebarRowLayout";
import { detailText } from "../sidebarRowDetails";
import {
  DEFAULT_ROW_LAYOUT,
  ROW_PRESET_LABELS,
  presetLines,
  presetOf,
  type RowPresetId,
  type SidebarRowLayout,
} from "../sidebarRowLayout";
import { useAppStore } from "../store/app";
import { closeRowLayoutDialog } from "../store/rowLayoutDialog";
import { saveSettings, useSettingsStore } from "../store/settings";
import { displayNameForProjectName } from "./ProjectNameDisplay";
import { RowLayoutEditor } from "./RowLayoutEditor";
import { RowLayoutOptions } from "./RowLayoutOptions";
import { rowSampleBuiltIns, type RowSample } from "./rowSample";
import { ROW_LAYOUT_VIDEO_LENGTH, ROW_LAYOUT_VIDEO_URL } from "../rowLayoutVideo";
import { BTN_SECONDARY_SM } from "./ui/buttons";
import { Modal } from "./ui/Modal";
import { SegmentedControl } from "./ui/SegmentedControl";
import { VideoLink } from "./ui/VideoLink";

const WIDTH = 720;
const GAP = 16;
// A sidebar row is the sidebar less the list's left padding and the 8px the
// scrollbar keeps on the right.
const ROW_INSET = 16;
const PRESET_IDS = Object.keys(ROW_PRESET_LABELS) as RowPresetId[];

/** The Row builder's window, beside the sidebar. */
export function RowLayoutDialogBody() {
  const layout = useSidebarRowLayout();
  const sidebarWidth = useSettingsStore((s) => s.sidebarWidth) || 260;
  const selected = useAppStore((s) => s.selected);
  const projects = useAppStore((s) => s.projects);
  const rowDataOf = useRowDataOf(useRowFetchLayout());
  const project = projects.find((p) => p.name === selected) ?? projects.find((p) => !p.isRemote) ?? projects[0];
  const sample: RowSample = {
    project,
    name: project ? displayNameForProjectName(project.name, projects) : "project",
    data: project ? rowDataOf(project) : {},
    builtIns: rowSampleBuiltIns(project),
  };
  const preset = presetOf(layout.lines);
  const left = Math.max(GAP, Math.min(sidebarWidth + GAP, window.innerWidth - WIDTH - GAP));

  const save = (patch: Partial<SidebarRowLayout>) => void saveSettings({ sidebarRowLayout: { ...layout, ...patch } });

  return (
    <Modal open onClose={closeRowLayoutDialog} backdrop={false}>
      <div
        className="fixed top-14 flex max-h-[calc(100vh-72px)] flex-col overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] shadow-2xl"
        style={{ left, width: WIDTH }}
      >
        <header className="flex items-start gap-3 border-b border-[var(--border)] px-5 pb-3.5 pt-4">
          <div className="min-w-0 flex-1">
            <h2 className="text-[15px] font-semibold text-[var(--text-primary)]">Project rows</h2>
            <p className="mt-0.5 text-[12px] leading-snug text-[var(--text-muted)]">
              Drag details onto <span className="font-medium text-[var(--text-secondary)]">{sample.name}</span>'s
              row, drawn as the sidebar draws it. Every project follows.
            </p>
          </div>
          <div className="-mr-1.5 flex shrink-0 items-center gap-3">
            <VideoLink url={ROW_LAYOUT_VIDEO_URL} label="Video guide" length={ROW_LAYOUT_VIDEO_LENGTH} />
            <button
              type="button"
              onClick={closeRowLayoutDialog}
              aria-label="Close"
              className="flex h-7 w-7 items-center justify-center rounded-md text-[var(--text-muted)] outline-none hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] focus-visible:ring-1 focus-visible:ring-[var(--accent-cyan)]"
            >
              <X size={15} />
            </button>
          </div>
        </header>
        <div className="flex items-center gap-3 border-b border-[var(--border)] px-5 py-2.5">
          <span className="text-[10.5px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">Start from</span>
          <SegmentedControl
            ariaLabel="Start from"
            value={preset ?? ("" as RowPresetId)}
            options={PRESET_IDS.map((id) => ({ value: id, label: ROW_PRESET_LABELS[id] }))}
            onChange={(id) => save({ lines: presetLines(id) })}
          />
          {!preset && <span className="text-[11.5px] text-[var(--text-muted)]">Your own layout</span>}
          <button
            type="button"
            onClick={() => void saveSettings({ sidebarRowLayout: undefined })}
            disabled={JSON.stringify(layout) === JSON.stringify(DEFAULT_ROW_LAYOUT)}
            className={`${BTN_SECONDARY_SM} ml-auto inline-flex items-center gap-1.5 disabled:opacity-50`}
          >
            <RotateCcw size={12} />
            Reset
          </button>
        </div>
        <div className="flex min-h-0 flex-col gap-5 overflow-y-auto px-5 py-4">
          <RowLayoutEditor
            lines={layout.lines}
            onChange={(lines) => save({ lines })}
            sample={sample}
            layout={layout}
            rowWidth={sidebarWidth - ROW_INSET}
            valueOf={(detail) =>
              project ? detailText(detail, sample.data, sample.builtIns.flags, layout) : undefined
            }
          />
          <section className="flex flex-col gap-2">
            <h3 className="text-[10.5px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">Options</h3>
            <RowLayoutOptions options={layout} onChange={save} />
          </section>
          <p className="text-[11.5px] leading-relaxed text-[var(--text-muted)]">
            Always on the row: the running dot, the name, and the agent arrow and ⋮ at the end of line 1. A line
            with nothing to say for a project stays hidden for it. On a narrow sidebar the right side keeps its
            details whole and the left side gives way first.
          </p>
        </div>
      </div>
    </Modal>
  );
}
