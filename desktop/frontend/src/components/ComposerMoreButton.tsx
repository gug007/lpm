import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Pin } from "lucide-react";
import { useAnchoredPanel } from "../hooks/useAnchoredPanel";
import { useOverlay } from "../store/overlay";
import { COMPOSER_TOOL_LABEL, type ComposerToolId } from "../composerTools";
import { COMPOSER_TOOLTIP_DELAY_MS } from "../composerText";
import { COMPOSER_TOOL_BUTTON_CLASS } from "./composerToolStyles";
import { ComposerToolRowMenu } from "./ComposerToolRowMenu";
import { MoreHorizontalIcon, UndoIcon } from "./icons";
import { ContextMenuAuxButton, ContextMenuItem } from "./ui/ContextMenuItem";
import { ContextMenuSeparator } from "./ui/ContextMenuSeparator";
import { MENU_PANEL_CLASS } from "./ui/ContextMenuShell";
import { Tooltip } from "./ui/Tooltip";

// What the menu hands a row it renders: `close` folds the menu once a plain
// row has been picked; a row that opens a panel of its own reports that
// through `onOpenChange` instead, so the menu stays behind the panel and
// folds away with it.
export interface ComposerMenuHost {
  close: () => void;
  onOpenChange: (open: boolean) => void;
}

interface ComposerMoreButtonProps {
  tools: ComposerToolId[];
  isDefault: boolean;
  renderRow: (id: ComposerToolId, host: ComposerMenuHost) => ReactNode;
  onMove: (id: ComposerToolId) => void;
  onReset: () => void;
}

interface RowMenu {
  id: ComposerToolId;
  x: number;
  y: number;
}

const MENU_WIDTH = 248;

// The terminal input's More menu: the tools not given a button of their own.
// Each row's pin, or a right-click on it, gives the tool a button.
export function ComposerMoreButton({ tools, isDefault, renderRow, onMove, onReset }: ComposerMoreButtonProps) {
  const [open, setOpen] = useState(false);
  const [rowMenu, setRowMenu] = useState<RowMenu | null>(null);
  // True while a row's own panel is up. Clicks inside that panel land outside
  // this menu, so they must not count as outside clicks here.
  const nested = useRef(false);
  const { triggerRef, panelRef, style } = useAnchoredPanel<HTMLDivElement, HTMLDivElement>({
    open,
    onClose: () => {
      if (!nested.current) setOpen(false);
    },
    width: MENU_WIDTH,
    side: "above",
    align: "left",
    flip: true,
  });

  useOverlay(open);

  useEffect(() => {
    if (!open) {
      nested.current = false;
      return;
    }
    // Captured and stopped so it doesn't also blur the composer; a row's own
    // panel takes the Escape first and this menu follows it down.
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || nested.current) return;
      e.stopPropagation();
      setOpen(false);
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [open]);

  const close = useCallback(() => setOpen(false), []);
  const onOpenChange = useCallback((isOpen: boolean) => {
    const was = nested.current;
    nested.current = isOpen;
    if (was && !isOpen) setOpen(false);
  }, []);
  const host = useMemo<ComposerMenuHost>(() => ({ close, onOpenChange }), [close, onOpenChange]);

  // Keep clicks from pulling focus off the composer editor; the caret stays put.
  const keepEditorFocus = (e: MouseEvent) => e.preventDefault();

  return (
    <div ref={triggerRef}>
      <Tooltip content="More" delay={COMPOSER_TOOLTIP_DELAY_MS}>
        <button
          type="button"
          onMouseDown={keepEditorFocus}
          onClick={() => setOpen((v) => !v)}
          aria-label="More"
          aria-haspopup="menu"
          aria-expanded={open}
          className={`${COMPOSER_TOOL_BUTTON_CLASS} ${
            open ? "bg-[var(--composer-hover-bg)] text-[var(--composer-fg)]" : ""
          }`}
        >
          <MoreHorizontalIcon />
        </button>
      </Tooltip>

      {open &&
        style &&
        createPortal(
          <div ref={panelRef} role="menu" style={style} className={`z-[80] overflow-y-auto ${MENU_PANEL_CLASS}`}>
            {tools.map((id) => (
              <div
                key={id}
                className="group flex items-stretch"
                onContextMenu={(e) => {
                  e.preventDefault();
                  setOpen(false);
                  setRowMenu({ id, x: e.clientX, y: e.clientY });
                }}
              >
                {renderRow(id, host)}
                <ContextMenuAuxButton
                  label="Show as a button"
                  icon={<Pin size={12} strokeWidth={1.75} />}
                  onClick={() => {
                    setOpen(false);
                    onMove(id);
                  }}
                />
              </div>
            ))}
            {!isDefault && (
              <>
                <ContextMenuSeparator />
                <ContextMenuItem
                  label="Reset to default"
                  icon={<UndoIcon />}
                  title="Put every button back where it started"
                  onClick={() => {
                    setOpen(false);
                    onReset();
                  }}
                />
              </>
            )}
          </div>,
          document.body,
        )}

      {rowMenu && (
        <ComposerToolRowMenu
          x={rowMenu.x}
          y={rowMenu.y}
          label={COMPOSER_TOOL_LABEL[rowMenu.id]}
          inToolbar={false}
          isDefault={isDefault}
          onMove={() => onMove(rowMenu.id)}
          onReset={onReset}
          onClose={() => setRowMenu(null)}
        />
      )}
    </div>
  );
}
