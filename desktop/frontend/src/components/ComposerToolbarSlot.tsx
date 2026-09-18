import { useState, type ReactNode } from "react";
import { COMPOSER_TOOL_LABEL, type ComposerToolId } from "../composerTools";
import { ComposerToolRowMenu } from "./ComposerToolRowMenu";

interface ComposerToolbarSlotProps {
  id: ComposerToolId;
  isDefault: boolean;
  onMove: () => void;
  onReset: () => void;
  children: ReactNode;
}

// One tool given its own button in the terminal input's row. Right-click
// sends it back into the More menu.
export function ComposerToolbarSlot({ id, isDefault, onMove, onReset, children }: ComposerToolbarSlotProps) {
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  return (
    <span
      className="inline-flex"
      onContextMenu={(e) => {
        e.preventDefault();
        setMenu({ x: e.clientX, y: e.clientY });
      }}
    >
      {children}
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
