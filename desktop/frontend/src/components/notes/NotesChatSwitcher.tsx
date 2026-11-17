import { useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, MessagesSquare, PanelLeft, Plus } from "lucide-react";
import type { notes } from "../../../bridge/models";
import { useAnchoredPanel } from "../../hooks/useAnchoredPanel";
import { useDismissOnEscape } from "../../hooks/useDismissOnEscape";
import { useOverlay } from "../../store/overlay";
import { BTN_SECONDARY } from "../ui/buttons";

const PANEL_WIDTH = 240;
const ROW =
  "mx-1.5 flex w-[calc(100%-12px)] items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-[13px] text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]";

interface NotesChatSwitcherProps {
  chats: notes.Chat[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onShowList: () => void;
}

// The chat the notes belong to, in the page header: switch to another, start
// one, or open the chat list beside the notes.
export function NotesChatSwitcher({ chats, activeId, onSelect, onCreate, onShowList }: NotesChatSwitcherProps) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  const { triggerRef, panelRef, style } = useAnchoredPanel<HTMLButtonElement, HTMLDivElement>({
    open,
    onClose: close,
    width: PANEL_WIDTH,
    side: "below",
    align: "right",
    flip: true,
  });
  useOverlay(open);
  useDismissOnEscape(open, close);
  const active = chats.find((c) => c.id === activeId);
  const pick = (run: () => void) => () => {
    close();
    run();
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Chat: ${active?.title ?? "none"}`}
        title="Switch chat"
        className={`${BTN_SECONDARY} flex max-w-[220px] items-center gap-1.5`}
      >
        <MessagesSquare size={14} strokeWidth={1.8} className="shrink-0 text-[var(--text-muted)]" />
        <span className="truncate">{active?.title ?? "Chats"}</span>
        <ChevronDown size={13} strokeWidth={2} className="shrink-0 text-[var(--text-muted)]" />
      </button>
      {open &&
        style &&
        createPortal(
          <div
            ref={panelRef}
            style={style}
            role="menu"
            aria-label="Chats"
            className="z-[80] overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] py-1.5 shadow-2xl"
          >
            <div className="max-h-64 overflow-y-auto">
              {chats.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  role="menuitemradio"
                  aria-checked={c.id === activeId}
                  onClick={pick(() => onSelect(c.id))}
                  className={ROW}
                >
                  <span className="min-w-0 flex-1 truncate">{c.title}</span>
                  {c.id === activeId && <Check size={14} strokeWidth={2} className="shrink-0 text-[var(--text-primary)]" />}
                </button>
              ))}
            </div>
            <div className="my-1.5 h-px bg-[var(--border)]" />
            <button type="button" role="menuitem" onClick={pick(onCreate)} className={ROW}>
              <Plus size={14} strokeWidth={1.8} className="shrink-0" />
              New chat
            </button>
            <button type="button" role="menuitem" onClick={pick(onShowList)} className={ROW}>
              <PanelLeft size={14} strokeWidth={1.8} className="shrink-0" />
              Show chat list
            </button>
          </div>,
          document.body,
        )}
    </>
  );
}
