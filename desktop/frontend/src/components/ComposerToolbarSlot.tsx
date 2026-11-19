import { useState, type ReactNode } from "react";
import { COMPOSER_TOOL_LABEL, type ComposerToolId } from "../composerTools";
import { useNewComposerTool } from "../hooks/useNewComposerTool";
import { ComposerToolRowMenu } from "./ComposerToolRowMenu";

interface ComposerToolbarSlotProps {
  id: ComposerToolId;
  isDefault: boolean;
  onMove: () => void;
  onReset: () => void;
  children: ReactNode;
}

// One tool given its own button in the terminal input's row. Right-click
// sends it back into the More menu. A tool that's new wears a dot until it's
// hovered or clicked.
export function ComposerToolbarSlot({ id, isDefault, onMove, onReset, children }: ComposerToolbarSlotProps) {
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const { isNew, markSeen } = useNewComposerTool(id);
  return (
    <span
      className="relative inline-flex"
      onMouseEnter={isNew ? markSeen : undefined}
      onClick={isNew ? markSeen : undefined}
      onContextMenu={(e) => {
        e.preventDefault();
        setMenu({ x: e.clientX, y: e.clientY });
      }}
    >
      {children}
      {isNew && (
        <span
          aria-hidden
          data-new-dot
          className="pointer-events-none absolute right-1 top-1 h-[7px] w-[7px] rounded-full bg-[var(--accent-violet)] shadow-[0_0_0_2px_var(--composer-surface)]"
        />
      )}
      {menu && (
        <ComposerToolRowMenu
          x={menu.x}
          y={menu.y}
          label={COMPOSER_TOOL_LABEL[id]}
          inToolbar
          isDefault={isDefault}
          onMove={onMove}
          onReset={onReset}
          onClose={() => setMenu(null)}
        />
      )}
    </span>
  );
}
