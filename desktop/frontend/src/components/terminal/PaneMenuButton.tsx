import { useRef, useState } from "react";
import { CodeIcon, FolderIcon, GlobeIcon, HistoryIcon, LayersIcon, MoreHorizontalIcon } from "../icons";
import { ContextMenuItem } from "../ui/ContextMenuItem";
import { ContextMenuShell } from "../ui/ContextMenuShell";
import { Tooltip } from "../ui/Tooltip";
import { IconBtn } from "./IconBtn";

interface PaneMenuButtonProps {
  onAddBrowser: () => void;
  onAddReview: () => void;
  onAddToolkit: () => void;
  onAddFiles: () => void;
  onResumeSession?: () => void;
}

// The pane's "more" menu: the tabs that aren't terminals, plus resuming a
// session. Sits in the header's right-hand group, so the menu hangs from its
// right edge.
export function PaneMenuButton({
  onAddBrowser,
  onAddReview,
  onAddToolkit,
  onAddFiles,
  onResumeSession,
}: PaneMenuButtonProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);

  const toggleMenu = () => {
    if (menu) {
      setMenu(null);
      return;
    }
    const r = ref.current?.getBoundingClientRect();
    if (r) setMenu({ x: r.right, y: r.bottom + 4 });
  };

  const pick = (action: () => void) => () => {
    action();
    setMenu(null);
  };

  return (
    // The mousedown must not reach the menu's outside-click listener, or a
    // click on the open button would close and reopen it.
    <span ref={ref} className="inline-flex" onMouseDown={(e) => e.stopPropagation()}>
      <Tooltip content="More options" side="bottom" align="end">
        <IconBtn onClick={toggleMenu} ariaLabel="More options" active={!!menu}>
          <MoreHorizontalIcon />
        </IconBtn>
      </Tooltip>
      {menu && (
        <ContextMenuShell x={menu.x} y={menu.y} align="end" minWidth={180} onClose={() => setMenu(null)}>
          <ContextMenuItem label="Review changes" icon={<CodeIcon />} shortcut="⌘⇧R" onClick={pick(onAddReview)} />
          <ContextMenuItem label="Files" icon={<FolderIcon />} shortcut="⌘⇧E" onClick={pick(onAddFiles)} />
          <ContextMenuItem label="Skills & tools" icon={<LayersIcon />} shortcut="⌘⇧K" onClick={pick(onAddToolkit)} />
          <ContextMenuItem label="Open browser" icon={<GlobeIcon />} onClick={pick(onAddBrowser)} />
          {onResumeSession && (
            <ContextMenuItem label="Resume session" icon={<HistoryIcon />} onClick={pick(onResumeSession)} />
          )}
        </ContextMenuShell>
      )}
    </span>
  );
}
