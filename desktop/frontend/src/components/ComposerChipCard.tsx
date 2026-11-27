import { useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { BrowserOpenURL } from "../../bridge/runtime";
import { useAnchoredPosition } from "../hooks/useAnchoredPosition";
import { useDismissOnEscape } from "../hooks/useDismissOnEscape";
import { useOutsideClick } from "../hooks/useOutsideClick";
import { toast } from "../notifications/toast";
import { plural } from "../projectArchive";
import { useAppStore } from "../store/app";
import { ComposerChipDetails } from "./ComposerChipDetails";
import { readCommit, readDiff, readPullRequest, readService, readTerminal, type ChipEnv } from "./composerChipCapture";
import {
  blockBody,
  commitInfo,
  diffFiles,
  lineCount,
  linesDetail,
  threadInfo,
  type Captured,
  type ChipSpec,
} from "./composerChips";
import { BTN_PRIMARY, BTN_SECONDARY } from "./ui/buttons";
import { SegmentedControl } from "./ui/SegmentedControl";

interface ComposerChipCardProps {
  text: string;
  spec: ChipSpec;
  anchor: DOMRect;
  env: ChipEnv;
  onReplace: (next: Captured) => void;
  onShowAsText: () => void;
  onRemove: () => void;
  onClose: () => void;
}

const OPTION = "flex items-center gap-2 text-[12px] text-[var(--text-secondary)]";
const FILE_OPTION = "flex items-center gap-2 font-mono text-[11.5px] text-[var(--text-secondary)]";
const TERMINAL_LINES = [20, 40, 200];
const SERVICE_LINES = [40, 120, 200];

function lineChoice(options: number[], current: number, busy: boolean, pick: (n: number) => void): ReactNode {
  return (
    <div className={OPTION}>
      Lines
      <SegmentedControl
        ariaLabel="Lines"
        value={String(current)}
        options={options.map((n) => ({ value: String(n), label: n, disabled: busy }))}
        onChange={(n) => n !== String(current) && pick(Number(n))}
      />
    </div>
  );
}

function check(label: string, checked: boolean, busy: boolean, onChange: (checked: boolean) => void): ReactNode {
  return (
    <label className={OPTION}>
      <input type="checkbox" checked={checked} disabled={busy} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

// The card a mention chip opens on click: everything it holds, choices that
// change what goes to the agent, and a way back to plain text.
export function ComposerChipCard({ text, spec, anchor, env, onReplace, onShowAsText, onRemove, onClose }: ComposerChipCardProps) {
  const ref = useOutsideClick<HTMLDivElement>(onClose);
  const { style } = useAnchoredPosition(ref, anchor);
  useDismissOnEscape(true, onClose);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState(text);
  const source = spec.source ?? {};
  const body = blockBody(text);
  const editable = spec.kind === "paste" || spec.kind === "quote";

  const run = async (job: () => Captured | Promise<Captured>) => {
    setBusy(true);
    try {
      onReplace(await job());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  let options: ReactNode = null;
  const actions: ReactNode[] = [];
  const captureAgain = (job: () => Captured | Promise<Captured>) =>
    actions.push(
      <button key="again" type="button" className={BTN_SECONDARY} disabled={busy} onClick={() => run(job)}>
        Capture again
      </button>,
    );

  switch (spec.kind) {
    case "terminal":
      if (source.terminalId) {
        const lines = source.lines ?? lineCount(body);
        options = lineChoice(TERMINAL_LINES, lines, busy, (n) => run(() => readTerminal(spec, n)));
        captureAgain(() => readTerminal(spec, lines));
      }
      break;
    case "service": {
      const lines = source.lines ?? lineCount(body);
      const onlyErrors = source.onlyErrors ?? false;
      options = (
        <div className="flex flex-wrap items-center gap-4">
          {lineChoice(SERVICE_LINES, lines, busy, (n) => run(() => readService(env, spec, n, onlyErrors)))}
          {check("Only errors and warnings", onlyErrors, busy, (on) => run(() => readService(env, spec, lines, on)))}
        </div>
      );
      captureAgain(() => readService(env, spec, lines, onlyErrors));
      break;
    }
    case "diff": {
      const parsed = diffFiles(body).map((f) => f.path);
      const all = source.allFiles ?? parsed;
      const picked = new Set(source.files ?? parsed);
      const toggle = (path: string) => {
        const next = all.filter((p) => (p === path ? !picked.has(p) : picked.has(p)));
        if (next.length === 0) return;
        void run(() => readDiff(env, spec, next, all));
      };
      options = (
        <div className="flex max-h-[200px] flex-col gap-1 overflow-auto">
          {all.map((path) => (
            <label key={path} className={FILE_OPTION}>
              <input type="checkbox" checked={picked.has(path)} disabled={busy} onChange={() => toggle(path)} />
              <span className="min-w-0 truncate">{path}</span>
            </label>
          ))}
          <div className="text-[11px] text-[var(--text-muted)]">
            {picked.size} of {plural(all.length, "file")} go along
          </div>
        </div>
      );
      captureAgain(() => readDiff(env, spec, [...picked], all));
      break;
    }
    case "commit": {
      const withDiff = source.withDiff ?? commitInfo(body).hasDiff;
      options = check("Include the diff", withDiff, busy, (on) => run(() => readCommit(env, spec, on)));
      break;
    }
    case "pr": {
      const description = source.description ?? true;
      const discussion = source.discussion ?? true;
      options = (
        <div className="flex flex-wrap gap-4">
          {check("Description", description, busy, (on) => run(() => readPullRequest(env, spec, on, discussion)))}
          {check("Reviews and comments", discussion, busy, (on) => run(() => readPullRequest(env, spec, description, on)))}
        </div>
      );
      break;
    }
    case "paste":
    case "quote":
      if (draft !== text) {
        actions.push(
          <button
            key="done"
            type="button"
            className={BTN_PRIMARY}
            onClick={() => onReplace({ text: draft, spec: { ...spec, detail: linesDetail(draft) } })}
          >
            Done
          </button>,
        );
      }
      break;
    case "project":
    case "duplicate":
      if (source.project) {
        const name = source.project;
        actions.push(
          <button
            key="open"
            type="button"
            className={BTN_SECONDARY}
            onClick={() => {
              useAppStore.getState().selectProject(name);
              onClose();
            }}
          >
            {spec.kind === "duplicate" ? "Open copy" : "Open project"}
          </button>,
        );
      }
      break;
  }

  const url = spec.kind === "pr" || spec.kind === "issue" ? threadInfo(body).url : "";
  if (url) {
    actions.push(
      <button key="github" type="button" className={BTN_SECONDARY} onClick={() => BrowserOpenURL(url)}>
        Open on GitHub
      </button>,
    );
  }

  return createPortal(
    <div
      ref={ref}
      role="dialog"
      aria-label={spec.label}
      style={style}
      className="fixed z-[9999] flex w-[400px] flex-col gap-2.5 rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-3 shadow-[0_8px_24px_rgba(0,0,0,0.22)]"
    >
      <ComposerChipDetails text={text} spec={spec} full />
      {editable && (
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          spellCheck={false}
          aria-label={spec.label}
          className="h-[200px] w-full resize-none rounded-md border border-[var(--border)] bg-[var(--bg-primary)] px-2 py-1.5 font-mono text-[11px] leading-4 text-[var(--text-primary)] outline-none focus:border-[var(--accent-cyan)]"
        />
      )}
      {options}
      <div className="flex flex-wrap gap-1.5">
        {actions}
        <button type="button" className={BTN_SECONDARY} disabled={busy} onClick={onShowAsText}>
          Show as text
        </button>
        <button type="button" className={`${BTN_SECONDARY} text-[var(--accent-red-text)]!`} disabled={busy} onClick={onRemove}>
          Remove
        </button>
      </div>
    </div>,
    document.body,
  );
}
