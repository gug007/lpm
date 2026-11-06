import { useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";
import { useAnchoredPanel } from "../../hooks/useAnchoredPanel";
import { useDismissOnEscape } from "../../hooks/useDismissOnEscape";
import type { LaunchpadTab } from "../../launchpadAgentActions";
import { useOverlay } from "../../store/overlay";
import { LaunchpadMark } from "../LaunchpadMark";
import { LaunchpadRadioTab } from "./LaunchpadRadioTab";
import { LAUNCHPAD_TAB, LAUNCHPAD_TAB_HOVER, launchpadTabTone } from "./launchpadTabStyle";

const PANEL_WIDTH = 240;

// A header split button or menu among the launchpad's tabs, working the same
// way: a split's main part picks the item it shows, its chevron (or a menu's
// whole button) opens the items to pick from.
export function LaunchpadGroupTab({
  tab,
  value,
  onChange,
}: {
  tab: LaunchpadTab;
  value: string;
  onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const { triggerRef, panelRef, style } = useAnchoredPanel<HTMLDivElement, HTMLDivElement>({
    open,
    onClose: () => setOpen(false),
    width: PANEL_WIDTH,
    side: "below",
    align: "left",
    flip: true,
  });
  useOverlay(open);
  useDismissOnEscape(open, () => setOpen(false));

  const picked = tab.options.find((o) => o.id === value) ?? null;
  const lead = tab.primary && (picked ?? tab.primary);
  const hover = picked ? "" : LAUNCHPAD_TAB_HOVER;
  const toggle = () => setOpen((v) => !v);
  const chevron = <ChevronDown size={12} strokeWidth={2} className="shrink-0 opacity-70" />;

  return (
    <div ref={triggerRef}>
      {lead ? (
        <div className={`${LAUNCHPAD_TAB} ${launchpadTabTone(picked !== null)}`}>
          <button
            type="button"
            role="radio"
            aria-checked={picked !== null}
            onClick={() => onChange(lead.id)}
            className={`flex h-full items-center gap-1.5 rounded-l-lg pl-2.5 pr-1.5 ${hover}`}
          >
            <LaunchpadMark agent={lead.agent} emoji={lead.emoji} size={14} />
            {lead.label}
          </button>
          <button
            type="button"
            aria-label={`Pick from ${tab.label}`}
            aria-haspopup="menu"
            aria-expanded={open}
            onClick={toggle}
            className={`flex h-full items-center rounded-r-lg pl-1 pr-1.5 ${open ? "bg-[var(--bg-hover)]" : hover}`}
          >
            {chevron}
          </button>
        </div>
      ) : (
        <LaunchpadRadioTab checked={picked !== null} aria-haspopup="menu" aria-expanded={open} onClick={toggle}>
          <LaunchpadMark agent={(picked ?? tab.options[0]).agent} emoji={(picked ?? tab).emoji} size={14} />
          {picked?.label ?? tab.label}
          {chevron}
        </LaunchpadRadioTab>
      )}
      {open &&
        style &&
        createPortal(
          <div
            ref={panelRef}
            style={style}
            role="menu"
            aria-label={tab.label}
            className="z-[80] overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-primary)] py-1.5 shadow-2xl"
          >
            {tab.options.map((o) => (
              <button
                key={o.id}
                type="button"
                role="menuitemradio"
                aria-checked={o.id === value}
                onClick={() => {
                  setOpen(false);
                  onChange(o.id);
                }}
                className="mx-1.5 flex w-[calc(100%-12px)] items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
              >
                <LaunchpadMark agent={o.agent} emoji={o.emoji} />
                <span className="min-w-0 flex-1 truncate">{o.label}</span>
                {o.id === value && <Check size={14} strokeWidth={2} className="shrink-0 text-[var(--text-primary)]" />}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </div>
  );
}
