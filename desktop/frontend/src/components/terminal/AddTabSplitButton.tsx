import { useRef, useState } from "react";
import { PlusIcon } from "./icons";
import { ChevronDownIcon, GlobeIcon, CodeIcon, HistoryIcon } from "../icons";
import { ContextMenuShell } from "../ui/ContextMenuShell";
import { ContextMenuItem } from "../ui/ContextMenuItem";

interface AddTabSplitButtonProps {
  onAddTerminal: () => void;
  onAddBrowser: () => void;
  onAddReview: () => void;
  onResumeSession?: () => void;
}

export function AddTabSplitButton({
  onAddTerminal,
  onAddBrowser,
  onAddReview,
  onResumeSession,
}: AddTabSplitButtonProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);

  const toggleMenu = () => {
    if (menu) {
      setMenu(null);
      return;
    }
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setMenu({ x: r.left, y: r.bottom + 4 });
  };

  const half =
    "flex h-6 items-center justify-center rounded-md text-[var(--terminal-header-text)] transition-colors duration-150 hover:bg-[var(--terminal-header-hover)] hover:text-[var(--terminal-tab-active)]";

  return (
    <div ref={ref} className="ml-1.5 flex shrink-0 items-center gap-px">
      <button
        onClick={onAddTerminal}
        title="New terminal (⌘T)"
        className={`${half} px-1.5 [&>svg]:h-3.5 [&>svg]:w-3.5`}
      >
        <PlusIcon />
      </button>
      <span className="h-3 w-px shrink-0 bg-[var(--terminal-header-border)] opacity-25" />
      <button
        onMouseDown={(e) => e.stopPropagation()}
        onClick={toggleMenu}
        title="More options"
        aria-haspopup="menu"
        aria-expanded={!!menu}
        className={`${half} px-1 [&>svg]:h-3 [&>svg]:w-3 ${
          menu
            ? "bg-[var(--terminal-header-active)] text-[var(--terminal-tab-active)]"
            : "opacity-70 hover:opacity-100"
        }`}
      >
        <ChevronDownIcon />
      </button>
      {menu && (
        <ContextMenuShell x={menu.x} y={menu.y} minWidth={180} onClose={() => setMenu(null)}>
          <ContextMenuItem
            label="Review changes"
            icon={<CodeIcon />}
            shortcut="⌘⇧R"
            onClick={() => {
              onAddReview();
              setMenu(null);
            }}
          />
          <ContextMenuItem
            label="Open browser"
            icon={<GlobeIcon />}
            onClick={() => {
              onAddBrowser();
              setMenu(null);
            }}
          />
          {onResumeSession && (
            <ContextMenuItem
              label="Resume session"
              icon={<HistoryIcon />}
              onClick={() => {
                onResumeSession();
                setMenu(null);
              }}
            />
          )}
        </ContextMenuShell>
      )}
    </div>
  );
}
