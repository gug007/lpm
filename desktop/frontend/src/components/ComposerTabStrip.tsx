import { Fragment, useEffect, useRef, type MouseEvent } from "react";
import { PlusIcon, XIcon } from "./icons";

export interface ComposerTabView {
  id: string;
  label: string;
}

interface ComposerTabStripProps {
  tabs: ComposerTabView[];
  activeId: string;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onAdd: () => void;
}

// A Chrome-style row of prepared inputs shown above the composer when more than
// one draft is open. Tabs are equal width — capped at a target, shrinking in step
// as more open and scrolling past a minimum — and sit flush with hairline
// separators (hidden next to the active tab). The active one, the draft in the
// editor, is a raised neutral pill; a trailing "+" opens another.
export function ComposerTabStrip({ tabs, activeId, onSelect, onClose, onAdd }: ComposerTabStripProps) {
  const activeRef = useRef<HTMLDivElement>(null);

  // Keep the active tab visible when the row overflows — e.g. a tab added off the
  // right edge — since the scrollbar is hidden and gives no other cue.
  useEffect(() => {
    activeRef.current?.scrollIntoView({ inline: "nearest", block: "nearest" });
  }, [activeId]);

  const handleClose = (e: MouseEvent, id: string) => {
    e.stopPropagation();
    onClose(id);
  };

  return (
    <div className="no-scrollbar flex items-center overflow-x-auto pl-3">
      {tabs.map((tab, i) => {
        const active = tab.id === activeId;
        const nextActive = i + 1 < tabs.length && tabs[i + 1].id === activeId;
        const label = tab.label || "New input";
        return (
          <Fragment key={tab.id}>
            <div
              ref={active ? activeRef : undefined}
              className={`group flex h-6 w-[160px] min-w-[52px] shrink items-center rounded-t-lg text-[11px] font-medium transition-colors ${
                active
                  ? "composer-tab-active text-[var(--text-primary)]"
                  : "text-[var(--terminal-header-text)] hover:bg-[var(--terminal-header-hover)] hover:text-[var(--terminal-tab-active)]"
              }`}
            >
              <button
                type="button"
                onClick={() => onSelect(tab.id)}
                title={label}
                aria-current={active ? "true" : undefined}
                className="min-w-0 flex-1 truncate py-0.5 pl-2.5 pr-1 text-left outline-none"
              >
                {label}
              </button>
              <button
                type="button"
                onClick={(e) => handleClose(e, tab.id)}
                aria-label="Close input"
                title="Close input"
                className={`mr-1.5 flex h-4 w-4 shrink-0 items-center justify-center rounded outline-none transition-opacity hover:text-[var(--accent-red)] focus-visible:text-[var(--accent-red)] focus-visible:opacity-100 [&>svg]:h-3 [&>svg]:w-3 ${
                  active ? "opacity-60 hover:opacity-100" : "opacity-0 group-hover:opacity-100"
                }`}
              >
                <XIcon />
              </button>
            </div>
            {i < tabs.length - 1 && (
              <span
                aria-hidden
                className={`h-3.5 w-px shrink-0 bg-[var(--border)] transition-opacity ${
                  active || nextActive ? "opacity-0" : "opacity-100"
                }`}
              />
            )}
          </Fragment>
        );
      })}
      <button
        type="button"
        onClick={onAdd}
        aria-label="New input"
        title="New input"
        className="ml-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[var(--text-muted)] outline-none transition-colors hover:bg-[var(--terminal-header-hover)] hover:text-[var(--text-primary)] [&>svg]:h-3.5 [&>svg]:w-3.5"
      >
        <PlusIcon />
      </button>
    </div>
  );
}
