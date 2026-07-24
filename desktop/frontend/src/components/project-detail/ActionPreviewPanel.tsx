import { useEffect, useState, type ReactNode } from "react";
import { withEmoji } from "../../withEmoji";
import { actionButtonStyle } from "../../actionColors";
import { useOutsideClick } from "../../hooks/useOutsideClick";
import { ChevronDownIcon, RefreshIcon } from "../icons";
import type { RunMode } from "./actionInference";
import {
  MockActionPlaceholder,
  RunModeDemo,
  type DemoState,
  type FrameHighlight,
} from "./ActionDemo";

export type Shape = "button" | "split" | "dropdown";

export type PreviewHint = "shape" | "placement" | "runMode" | "confirm";

export const SHAPE_PREVIEW_BUTTON_CLASS =
  "border-[var(--border)] text-[var(--text-primary)]";

const PREVIEW_RING =
  "0 0 0 3px color-mix(in srgb, var(--accent-cyan) 35%, transparent)";

interface PreviewOption {
  id: string;
  label: string;
  cmd: string;
}

export function ActionPreviewPanel({
  name,
  emoji,
  color,
  shape,
  options,
  runMode,
  reuse,
  confirm,
  cmd,
  display,
  hoveredHint,
}: {
  name: string;
  emoji: string;
  color: string;
  shape: Shape;
  options: PreviewOption[];
  runMode: RunMode;
  reuse: boolean;
  confirm: boolean;
  cmd: string;
  display: "header" | "footer";
  hoveredHint: PreviewHint | null;
}) {
  const trimmedName = name.trim();
  const hasName = trimmedName.length > 0;
  const displayLabel = withEmoji(emoji, trimmedName);
  const colorStyle = actionButtonStyle(color);
  const [menuOpen, setMenuOpen] = useState(false);
  const [running, setRunning] = useState<DemoState>(null);
  const [replayNonce, setReplayNonce] = useState(0);
  const [demoFinished, setDemoFinished] = useState(false);
  const menuRef = useOutsideClick<HTMLDivElement>(
    () => setMenuOpen(false),
    menuOpen,
  );
  const visibleOptions = options.filter(
    (option) => option.label.trim() || option.cmd.trim(),
  );
  const canRun = shape !== "dropdown" && cmd.trim().length > 0;

  useEffect(() => {
    setRunning(canRun ? runMode : null);
  }, [runMode, canRun]);

  useEffect(() => {
    setDemoFinished(false);
  }, [running, replayNonce]);

  const triggerRun = () => {
    if (!canRun) return;
    setRunning(confirm ? "confirm" : runMode);
  };

  const handleConfirm = () => setRunning(runMode);
  const handleCancel = () => setRunning(null);
  const replayDemo = () => {
    setDemoFinished(false);
    setReplayNonce((n) => n + 1);
  };

  const shownRunning: DemoState =
    hoveredHint === "confirm" && confirm ? "confirm" : running;
  const frameHighlight: FrameHighlight =
    hoveredHint === "placement"
      ? display
      : hoveredHint === "runMode"
        ? "content"
        : null;

  const dropdown = menuOpen && (
    <div className="absolute right-0 top-full z-10 mt-2 w-56 overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] py-1.5 shadow-2xl">
      {visibleOptions.length === 0 ? (
        <div className="px-4 py-2 text-[12px] italic text-[var(--text-muted)]">
          Add menu options to fill this menu.
        </div>
      ) : (
        visibleOptions.map((option, index) => (
          <div
            key={option.id}
            className="flex items-center gap-2.5 px-4 py-2 text-[12px] text-[var(--text-secondary)]"
          >
            <span className="flex-1 truncate">
              {option.label.trim() || `Option ${index + 1}`}
            </span>
          </div>
        ))
      )}
    </div>
  );

  return (
    <aside className="flex border-t border-[var(--border)] bg-[var(--bg-secondary)] px-6 py-6 lg:w-[300px] lg:shrink-0 lg:border-l lg:border-t-0">
      <div className="flex min-h-[140px] flex-1 flex-col lg:min-h-0">
        <div className="mb-4 text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--text-muted)]">
          Preview
        </div>

        <div className="flex flex-1 flex-col items-center justify-center">
          {!hasName ? (
            <div className="flex w-full flex-col items-center gap-3">
              <MockActionPlaceholder
                display={display}
                highlight={frameHighlight}
              />
              <span className="text-[11px] text-[var(--text-muted)]">
                Your action appears here.
              </span>
            </div>
          ) : (
            <div className="flex w-full flex-col items-center gap-4">
              <div
                className="rounded-lg transition-shadow duration-150"
                style={
                  hoveredHint === "shape"
                    ? { boxShadow: PREVIEW_RING }
                    : undefined
                }
              >
                {shape === "button" ? (
                  <button
                    type="button"
                    onClick={triggerRun}
                    style={colorStyle}
                    className={`inline-flex whitespace-nowrap rounded-lg border bg-[var(--action-tint,var(--bg-primary))] px-3.5 py-1.5 text-xs font-medium transition-colors hover:bg-[var(--action-tint-strong,var(--bg-hover))] ${SHAPE_PREVIEW_BUTTON_CLASS}`}
                  >
                    {displayLabel}
                  </button>
                ) : shape === "split" ? (
                  <div ref={menuRef} className="relative">
                    <span
                      style={colorStyle}
                      className={`inline-flex items-stretch rounded-lg border bg-[var(--action-tint,var(--bg-primary))] text-xs font-medium ${SHAPE_PREVIEW_BUTTON_CLASS}`}
                    >
                      <button
                        type="button"
                        onClick={triggerRun}
                        className="whitespace-nowrap rounded-l-lg px-3.5 py-1.5 transition-colors hover:bg-[var(--action-tint-strong,var(--bg-hover))]"
                      >
                        {displayLabel}
                      </button>
                      <button
                        type="button"
                        onClick={() => setMenuOpen((v) => !v)}
                        className={`flex items-center rounded-r-lg border-l border-[var(--action-border,var(--border))] px-1.5 transition-colors hover:bg-[var(--action-tint-strong,var(--bg-hover))] ${menuOpen ? "bg-[var(--action-tint-strong,var(--bg-hover))]" : ""}`}
                      >
                        <ChevronDownIcon />
                      </button>
                    </span>
                    {dropdown}
                  </div>
                ) : (
                  <div ref={menuRef} className="relative">
                    <button
                      type="button"
                      onClick={() => setMenuOpen((v) => !v)}
                      style={colorStyle}
                      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-lg border px-3.5 py-1.5 text-xs font-medium transition-colors hover:bg-[var(--action-tint-strong,var(--bg-hover))] ${SHAPE_PREVIEW_BUTTON_CLASS} ${menuOpen ? "bg-[var(--action-tint-strong,var(--bg-hover))]" : "bg-[var(--action-tint,var(--bg-primary))]"}`}
                    >
                      {displayLabel}
                      <ChevronDownIcon />
                    </button>
                    {dropdown}
                  </div>
                )}
              </div>

              {canRun && (
                <>
                  <RunModeDemo
                    key={`${running ?? "idle"}-${replayNonce}`}
                    running={shownRunning}
                    cmd={cmd}
                    label={displayLabel}
                    display={display}
                    highlight={frameHighlight}
                    onTrigger={triggerRun}
                    onConfirm={handleConfirm}
                    onCancel={handleCancel}
                    onFinished={() => setDemoFinished(true)}
                  />
                  {demoFinished ? (
                    <button
                      type="button"
                      onClick={replayDemo}
                      className="inline-flex items-center gap-1 text-[11px] text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)] [&>svg]:h-3 [&>svg]:w-3"
                    >
                      <RefreshIcon />
                      Replay
                    </button>
                  ) : (
                    <span className="text-[11px] text-[var(--text-muted)]">
                      Click the button to try it.
                    </span>
                  )}
                </>
              )}

              <ActionSummary
                shape={shape}
                label={displayLabel}
                display={display}
                runMode={runMode}
                reuse={reuse}
                confirm={confirm}
                cmd={cmd}
                optionCount={visibleOptions.length}
              />
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}

function Strong({ children }: { children: ReactNode }) {
  return (
    <strong className="font-medium text-[var(--text-primary)]">
      {children}
    </strong>
  );
}

function CmdChip({ cmd }: { cmd: string }) {
  const shown = cmd.length > 34 ? `${cmd.slice(0, 33)}…` : cmd;
  return (
    <code
      title={cmd}
      className="rounded bg-[var(--bg-secondary)] px-1 py-px font-mono text-[11px] text-[var(--text-primary)]"
    >
      {shown}
    </code>
  );
}

// The whole configuration restated as one plain sentence, so the pickers above
// always resolve to something a first-time user can read back.
function ActionSummary({
  shape,
  label,
  display,
  runMode,
  reuse,
  confirm,
  cmd,
  optionCount,
}: {
  shape: Shape;
  label: string;
  display: "header" | "footer";
  runMode: RunMode;
  reuse: boolean;
  confirm: boolean;
  cmd: string;
  optionCount: number;
}) {
  const place = display === "footer" ? "the footer bar" : "the header";
  const trimmed = cmd.trim();
  const name = <Strong>{label}</Strong>;
  const plural = optionCount === 1 ? "" : "s";

  let body: ReactNode;
  if (shape === "dropdown") {
    body = (
      <>
        {name} sits in {place} and opens a menu of{" "}
        {optionCount > 0
          ? `${optionCount} command${plural}`
          : "the commands you add"}
        .
      </>
    );
  } else if (!trimmed) {
    body = (
      <>
        {name} sits in {place}. Add a command to see what a click will do.
      </>
    );
  } else {
    const chip = <CmdChip cmd={trimmed} />;
    const clause =
      runMode === "terminal" ? (
        reuse ? (
          <>run {chip}, reusing the same terminal each time</>
        ) : (
          <>open a new terminal and run {chip}</>
        )
      ) : runMode === "once" ? (
        <>run {chip} and show the output in a pop-up</>
      ) : runMode === "command" ? (
        <>type {chip} into your current terminal</>
      ) : (
        <>run {chip} quietly in the background</>
      );
    body = (
      <>
        Click {name} in {place} to {clause}.
        {shape === "split" &&
          (optionCount > 0 ? (
            <>
              {" "}
              The arrow next to it holds {optionCount} more command{plural}.
            </>
          ) : (
            <> The arrow next to it opens the menu options you add.</>
          ))}
        {confirm && <> It asks for confirmation first.</>}
      </>
    );
  }

  return (
    <div className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-3.5 py-3">
      <div className="mb-1.5 text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--text-muted)]">
        What this does
      </div>
      <p className="text-[12px] leading-relaxed text-[var(--text-secondary)]">
        {body}
      </p>
    </div>
  );
}
