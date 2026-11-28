import { useState } from "react";
import { createPortal } from "react-dom";
import { Check } from "lucide-react";
import { useAnchoredPanel } from "../../hooks/useAnchoredPanel";
import { TALK_LINK } from "./talkStyles";

interface TalkPick {
  id: string;
  label: string;
}

interface TalkPickMenuProps {
  // What the link changes, for a screen reader.
  ariaLabel: string;
  picks: TalkPick[];
  picked: string;
  onPick: (id: string) => void;
}

// A plan row's "Change": the choices for that row, opening over the card.
export function TalkPickMenu({ ariaLabel, picks, picked, onPick }: TalkPickMenuProps) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  const { triggerRef, panelRef, style } = useAnchoredPanel<HTMLButtonElement, HTMLDivElement>({
    open,
    onClose: close,
    width: 240,
    side: "above",
    flip: true,
  });

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => setOpen((on) => !on)}
        className={TALK_LINK}
      >
        Change
      </button>
      {open &&
        style &&
        createPortal(
          <div
            ref={panelRef}
            style={style}
            role="listbox"
            aria-label={ariaLabel}
            onKeyDown={(e) => {
              if (e.key !== "Escape") return;
              e.stopPropagation();
              close();
              triggerRef.current?.focus();
            }}
            className="z-[70] max-h-72 overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] p-1 shadow-2xl"
          >
            {picks.map((pick, i) => (
              <button
                key={pick.id}
                type="button"
                role="option"
                aria-selected={pick.id === picked}
                autoFocus={pick.id === picked || (picked === "" && i === 0)}
                onClick={() => {
                  onPick(pick.id);
                  close();
                }}
                className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[13px] text-[var(--text-secondary)] outline-none transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] focus-visible:bg-[var(--bg-hover)] focus-visible:text-[var(--text-primary)]"
              >
                <span className="min-w-0 flex-1 truncate">{pick.label}</span>
                <span className="flex w-3.5 shrink-0 justify-end text-[var(--accent-green)]">
                  {pick.id === picked && <Check size={13} />}
                </span>
              </button>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}
