import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent } from "react";
import { ArrowUp, Loader2, Minus, Plus, Settings2, Sparkles } from "lucide-react";
import { useAutoGrowTextarea } from "../hooks/useAutoGrowTextarea";
import { useOutsideClick } from "../hooks/useOutsideClick";
import { useVoiceDictation } from "../hooks/useVoiceDictation";
import { composerActionIcon, type ComposerAction } from "../store/composerActions";
import { MAX_VARIANTS } from "../composerVariants";
import { MicIcon } from "./icons";
import { VoiceToTextInstallModal } from "./VoiceToTextInstallModal";
import { Tooltip } from "./ui/Tooltip";
import { COMPOSER_TOOLTIP_DELAY_MS } from "../composerText";

// Count key for the free-form "Ask AI to rewrite" field, which has no action id.
const CUSTOM_KEY = "__custom__";

interface ComposerActionsButtonProps {
  // Enabled actions, in order. May be empty — the popover then offers setup.
  enabledActions: ComposerAction[];
  busy: boolean;
  // False when the input is empty, so actions show as unavailable.
  canRun: boolean;
  // The AI CLI/model the transforms run with, surfaced in tooltips.
  cliLabel: string;
  // Runs the action, asking for `count` rewrites: 1 applies straight to the
  // composer, more than one opens the variant picker.
  onRun: (action: ComposerAction, count: number) => void;
  onManage: () => void;
  // Which edge the popover aligns to. Defaults to "right" (the button sits on the
  // right of its footer); "left" is used when the button is on the left so the
  // menu opens inward instead of off the left edge.
  align?: "left" | "right";
}

export function ComposerActionsButton({
  enabledActions,
  busy,
  canRun,
  cliLabel,
  onRun,
  onManage,
  align = "right",
}: ComposerActionsButtonProps) {
  const [open, setOpen] = useState(false);
  // A one-off instruction typed into the popover, run immediately as a transient
  // action without being saved to the shared action list.
  const [custom, setCustom] = useState("");
  // How many rewrites each action should produce, keyed by action id (and
  // CUSTOM_KEY for the free-form field). Defaults to 1 when absent.
  const [counts, setCounts] = useState<Record<string, number>>({});
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const { toggle: toggleDictation, installOpen, setInstallOpen } = useVoiceDictation();
  // Boundary wraps both the trigger and the panel so clicking the trigger to
  // close doesn't read as an outside click (which would reopen on the click).
  // Clicks on the install modal's backdrop are ignored by useOutsideClick itself
  // (it skips [data-modal-overlay]), so dismissing it keeps the popover open.
  const ref = useOutsideClick<HTMLDivElement>(() => setOpen(false), open);

  const countFor = (id: string) => counts[id] ?? 1;
  const setCount = (id: string, n: number) =>
    setCounts((c) => ({ ...c, [id]: Math.max(1, Math.min(MAX_VARIANTS, n)) }));

  // Escape closes the popover first; captured so it doesn't also bubble to the
  // composer's Escape handler (which would refocus the terminal underneath).
  // Stand down while the install modal is up: it owns Escape (its own bubble-phase
  // handler), and swallowing here would leave the first Escape closing only the
  // hidden popover.
  useEffect(() => {
    if (!open || installOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      setOpen(false);
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [open, installOpen]);

  // Focus the instruction field on open so the menu is type-ready; clear the
  // draft on close so reopening starts fresh.
  useEffect(() => {
    if (open) inputRef.current?.focus();
    else setCustom("");
  }, [open]);

  const run = (action: ComposerAction, count: number) => {
    setOpen(false);
    onRun(action, count);
  };

  const runCustom = () => {
    const instruction = custom.trim();
    if (!instruction || !canRun || busy) return;
    run(
      { id: "custom", icon: "sparkles", label: instruction, instruction, enabled: true },
      countFor(CUSTOM_KEY),
    );
  };

  const onInputKeyDown = (e: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    // Keep typing from reaching the composer's global shortcut handlers.
    e.stopPropagation();
    // Enter submits; Shift+Enter drops a newline into the multiline field.
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      runCustom();
    }
  };

  // Grow the field with its content from a single row up to a cap, then scroll.
  useAutoGrowTextarea(inputRef, custom, 160);

  const manage = () => {
    setOpen(false);
    onManage();
  };

  // Keep clicks from pulling focus off the composer editor; the caret stays put.
  const keepEditorFocus = (e: MouseEvent) => e.preventDefault();

  const canRunCustom = custom.trim().length > 0 && canRun && !busy;

  return (
    <div ref={ref} className="relative">
      <Tooltip content={busy ? "Refining…" : "Refine with AI"} delay={COMPOSER_TOOLTIP_DELAY_MS}>
        <button
          type="button"
          onMouseDown={keepEditorFocus}
          onClick={() => setOpen((v) => !v)}
          disabled={busy}
          aria-label="AI actions"
          aria-expanded={open}
          className={`flex h-7 w-7 items-center justify-center rounded-lg transition-colors disabled:opacity-50 ${
            open
              ? "bg-[var(--bg-hover)] text-[var(--text-primary)]"
              : "text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
          }`}
        >
          {busy ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} strokeWidth={1.75} />}
        </button>
      </Tooltip>

      {open && (
        <div
          className={`absolute bottom-full z-20 mb-2 w-[22rem] overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] shadow-xl ${
            align === "left" ? "left-0" : "right-0"
          }`}
        >
          {enabledActions.length === 0 ? (
            <div className="px-3.5 py-3 text-center">
              <p className="text-[12px] text-[var(--text-muted)]">No actions enabled yet.</p>
            </div>
          ) : (
            <ul className="max-h-64 overflow-y-auto py-1.5">
              {enabledActions.map((action) => {
                const Icon = composerActionIcon(action.icon);
                const count = countFor(action.id);
                return (
                  <li key={action.id} className="relative">
                    <button
                      type="button"
                      onMouseDown={keepEditorFocus}
                      onClick={() => run(action, count)}
                      disabled={!canRun}
                      title={
                        canRun
                          ? `${action.label} · ${count === 1 ? "1 result" : `${count} results`} with ${cliLabel}`
                          : "Type something first"
                      }
                      className="flex w-full items-center gap-2.5 py-2 pl-3.5 pr-[92px] text-left text-[12.5px] text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] disabled:opacity-40 disabled:hover:bg-transparent"
                    >
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center text-[var(--text-muted)]">
                        <Icon size={14} strokeWidth={1.75} />
                      </span>
                      <span className="min-w-0 flex-1 truncate">{action.label || "Untitled action"}</span>
                    </button>
                    <div className="absolute right-2.5 top-1/2 -translate-y-1/2">
                      <CountStepper
                        value={count}
                        onChange={(n) => setCount(action.id, n)}
                        onMouseDown={keepEditorFocus}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          <div className="flex items-end gap-2 border-t border-[var(--border)] px-2.5 py-2">
            <button
              type="button"
              onMouseDown={keepEditorFocus}
              onClick={() => void toggleDictation()}
              title="Dictate"
              aria-label="Dictate"
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
            >
              <MicIcon size={14} />
            </button>
            <textarea
              ref={inputRef}
              rows={1}
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              onKeyDown={onInputKeyDown}
              placeholder="Ask AI to rewrite…"
              aria-label="Custom instruction"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              className="block min-w-0 flex-1 resize-none overflow-y-auto bg-transparent py-0.5 text-[12.5px] leading-relaxed text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]"
            />
            <CountStepper
              value={countFor(CUSTOM_KEY)}
              onChange={(n) => setCount(CUSTOM_KEY, n)}
              onMouseDown={keepEditorFocus}
            />
            <button
              type="button"
              onMouseDown={keepEditorFocus}
              onClick={runCustom}
              disabled={!canRunCustom}
              title={canRun ? "Run instruction" : "Type something first"}
              aria-label="Run instruction"
              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md transition-colors ${
                canRunCustom
                  ? "bg-[var(--accent-cyan)] text-[var(--bg-primary)] hover:opacity-90"
                  : "text-[var(--text-muted)]"
              }`}
            >
              <ArrowUp size={13} strokeWidth={2.25} />
            </button>
          </div>

          <button
            type="button"
            onMouseDown={keepEditorFocus}
            onClick={manage}
            className="flex w-full items-center gap-2.5 border-t border-[var(--border)] px-3.5 py-2.5 text-left text-[12px] font-medium text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
          >
            <Settings2 size={14} strokeWidth={1.75} />
            Manage actions
          </button>
        </div>
      )}

      <VoiceToTextInstallModal open={installOpen} onClose={() => setInstallOpen(false)} />
    </div>
  );
}

interface CountStepperProps {
  value: number;
  onChange: (n: number) => void;
  onMouseDown: (e: MouseEvent) => void;
}

// Minimal, borderless −/N/+ control choosing how many rewrites an action
// returns. The count glows in the accent once it's above the default of 1, so a
// multi-result choice reads at a glance. Mouse-down is intercepted so adjusting
// the count never pulls focus off the composer.
function CountStepper({ value, onChange, onMouseDown }: CountStepperProps) {
  return (
    <div onMouseDown={onMouseDown} className="flex shrink-0 items-center gap-0.5">
      <button
        type="button"
        onClick={() => onChange(value - 1)}
        disabled={value <= 1}
        aria-label="Fewer results"
        className="flex h-6 w-6 items-center justify-center rounded-md text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] disabled:opacity-25 disabled:hover:bg-transparent"
      >
        <Minus size={13} strokeWidth={2} />
      </button>
      <span
        className={`min-w-[1.05rem] text-center text-[12px] font-semibold tabular-nums transition-colors ${
          value > 1 ? "text-[var(--accent-cyan)]" : "text-[var(--text-muted)]"
        }`}
      >
        {value}
      </span>
      <button
        type="button"
        onClick={() => onChange(value + 1)}
        disabled={value >= MAX_VARIANTS}
        aria-label="More results"
        className="flex h-6 w-6 items-center justify-center rounded-md text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] disabled:opacity-25 disabled:hover:bg-transparent"
      >
        <Plus size={13} strokeWidth={2} />
      </button>
    </div>
  );
}
