import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AlarmClock, ListEnd } from "lucide-react";
import { useAnchoredPanel } from "../hooks/useAnchoredPanel";
import { useOverlay } from "../store/overlay";
import { COMPOSER_TOOLTIP_DELAY_MS } from "../composerText";
import { SEND_SHELL_CLASS, VIDEO_ACCENT, sendFaceClass, sendGlow, sendShellTint, sendVideoFaceClass } from "./composerSendStyles";
import { MENU_PANEL_CLASS } from "./ui/ContextMenuShell";
import { ContextMenuItem } from "./ui/ContextMenuItem";
import { ChevronUpIcon, CopyIcon, ForwardIcon, PlayIcon, SendIcon, SquarePenIcon } from "./icons";
import { Tooltip } from "./ui/Tooltip";
import { enterHint } from "../shortcutHints";

export interface SendSplitButtonProps {
  // Nothing to send (empty/whitespace) — disables both the send and draft paths.
  disabled: boolean;
  // A composer action transform is running; the field is locked, so hold off.
  busy: boolean;
  onSend: () => void;
  onSaveDraft: () => void;
  // Queue this prompt to go out once the terminal's agent finishes its turn;
  // `hint` says what it waits for.
  sendWhenDone?: { run: () => void; hint: string };
  // Open the picker for when to send this prompt instead of now.
  onSendLater?: () => void;
  // Open the picker for a tab elsewhere — another tab here, or one in another
  // open project — to send this prompt to instead.
  onSendElsewhere?: () => void;
  // Spin up `count` project duplicates that each run this prompt in parallel.
  onRunInDuplicates?: (count: number) => void;
  // The prompt asks for a video of the answer: the button says so and wears
  // the video accent.
  video?: boolean;
}

const MENU_WIDTH = 300;

// Range for the in-menu duplicates counter. "Duplicates" is plural, so the
// floor is two; the dialog it opens can still push higher.
const MIN_DUPES = 2;
const MAX_DUPES = 10;

// The composer's send control: a split button whose primary half sends the
// prompt (unchanged ↵ behaviour) and whose caret half opens a menu to send it
// when the agent is done or later, save it as a draft, send it to another tab,
// or run it across several parallel duplicates instead. The
// menu is anchored above the button (the composer sits at the bottom of the
// pane) and portaled so the composer's rounded, clipping ancestors can't cut it off.
export function SendSplitButton({ disabled, busy, onSend, onSaveDraft, sendWhenDone, onSendLater, onSendElsewhere, onRunInDuplicates, video = false }: SendSplitButtonProps) {
  const [open, setOpen] = useState(false);
  // How many copies "Run in duplicates" spins up; adjusted inline in the menu
  // and carried over as the seeded Copies count when the dialog opens.
  const [dupes, setDupes] = useState(MIN_DUPES);
  const inert = disabled || busy;
  // Shared anchored-panel infra owns the upward positioning, viewport clamp, and
  // outside-click dismiss — the sibling SplitButton uses it the same way.
  const { triggerRef, panelRef, style } = useAnchoredPanel<HTMLDivElement, HTMLDivElement>({
    open,
    onClose: () => setOpen(false),
    width: MENU_WIDTH,
    side: "above",
  });

  useOverlay(open);

  // Escape closes the menu; captured and stopped so it doesn't also blur the
  // composer (the hook only covers outside-click).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      setOpen(false);
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [open]);

  // The menu can't outlive the enabled state (e.g. the field is cleared while open).
  useEffect(() => {
    if (inert && open) setOpen(false);
  }, [inert, open]);

  const divider = inert ? "bg-[var(--composer-border)]" : "bg-[var(--bg-primary)]/20";
  const sendLabel = video ? "Send for a video" : "Send";

  return (
    <div
      ref={triggerRef}
      className={`${SEND_SHELL_CLASS} ${sendShellTint(inert, video)}`}
      style={sendGlow(inert, video ? VIDEO_ACCENT : undefined)}
    >
      <Tooltip content={`${sendLabel}  ·  ${enterHint()}`} delay={COMPOSER_TOOLTIP_DELAY_MS}>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            onSend();
          }}
          disabled={inert}
          aria-label={sendLabel}
          className={video ? sendVideoFaceClass(inert) : sendFaceClass(inert, "rounded-l-lg")}
        >
          {video ? (
            <>
              <PlayIcon />
              {sendLabel}
            </>
          ) : (
            <SendIcon />
          )}
        </button>
      </Tooltip>
      <span className={`h-3.5 w-px ${divider}`} />
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={inert}
        aria-label="More send options"
        aria-haspopup="menu"
        aria-expanded={open}
        className={`flex h-7 items-center justify-center rounded-r-lg pl-1.5 pr-2 transition-colors [&>svg]:h-3 [&>svg]:w-3 ${
          inert
            ? "text-[var(--composer-fg-muted)]"
            : `text-[var(--bg-primary)]/70 hover:bg-black/10 hover:text-[var(--bg-primary)] ${
                open ? "bg-black/10 text-[var(--bg-primary)]" : ""
              }`
        }`}
      >
        <ChevronUpIcon />
      </button>

      {open &&
        style &&
        createPortal(
          <div ref={panelRef} role="menu" style={style} className={`z-[80] ${MENU_PANEL_CLASS}`}>
            {sendWhenDone && (
              <ContextMenuItem
                label="Send when done"
                description={sendWhenDone.hint}
                icon={<ListEnd size={13} strokeWidth={1.5} />}
                shortcut={enterHint({ alt: true, shift: true })}
                onClick={() => {
                  setOpen(false);
                  sendWhenDone.run();
                }}
              />
            )}
            {onSendLater && (
              <ContextMenuItem
                label="Send later"
                description="Pick a moment on a timeline, today or later"
                icon={<AlarmClock size={13} strokeWidth={1.5} />}
                shortcut={enterHint({ alt: true })}
                onClick={() => {
                  setOpen(false);
                  onSendLater();
                }}
              />
            )}
            <ContextMenuItem
              label="Save as draft"
              description="Keep this prompt without sending it"
              icon={<SquarePenIcon size={13} />}
              shortcut={enterHint({ meta: true })}
              onClick={() => {
                setOpen(false);
                onSaveDraft();
              }}
            />
            {onSendElsewhere && (
              <ContextMenuItem
                label="Send to another tab"
                description="Pick a tab in this or another open project"
                icon={<ForwardIcon size={13} />}
                onClick={() => {
                  setOpen(false);
                  onSendElsewhere();
                }}
              />
            )}
            {onRunInDuplicates && (
              <div className="flex w-full items-start gap-2 px-3 py-1.5 text-[11px] text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]">
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    onRunInDuplicates(dupes);
                  }}
                  className="flex min-w-0 flex-1 items-start gap-2 text-left"
                >
                  <span className="flex shrink-0 items-center pt-0.5">
                    <CopyIcon size={13} />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="truncate">Run in duplicates</span>
                    <span className="text-[10px] leading-snug text-[var(--text-muted)]">
                      Run in {dupes} copies at once, keep the best
                    </span>
                  </span>
                </button>
                <div className="flex shrink-0 items-center gap-1.5 pt-px text-[var(--text-muted)]">
                  <button
                    type="button"
                    aria-label="Fewer duplicates"
                    disabled={dupes <= MIN_DUPES}
                    onClick={() => setDupes((n) => Math.max(MIN_DUPES, n - 1))}
                    className="flex h-4 w-4 items-center justify-center text-[14px] leading-none transition-colors hover:text-[var(--text-primary)] disabled:opacity-30"
                  >
                    −
                  </button>
                  <span className="min-w-[0.75rem] text-center text-[11px] tabular-nums text-[var(--text-secondary)]">
                    {dupes}
                  </span>
                  <button
                    type="button"
                    aria-label="More duplicates"
                    disabled={dupes >= MAX_DUPES}
                    onClick={() => setDupes((n) => Math.min(MAX_DUPES, n + 1))}
                    className="flex h-4 w-4 items-center justify-center text-[14px] leading-none transition-colors hover:text-[var(--text-primary)] disabled:opacity-30"
                  >
                    +
                  </button>
                </div>
              </div>
            )}
          </div>,
          document.body,
        )}
    </div>
  );
}
