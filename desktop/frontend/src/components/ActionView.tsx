import type { MouseEvent, ReactElement } from "react";
import { ActionButton } from "./ActionButton";
import { SplitButton, type ActionSize } from "./SplitButton";
import { Tooltip } from "./ui/Tooltip";
import { Combo } from "./KeyCombo";
import type { ActionInfo } from "../types";
import { withEmoji } from "../withEmoji";
import { actionButtonStyle } from "../actionColors";
import { formatShortcut, parseShortcut } from "../shortcutParse";
import { COMPOSER_TOOLTIP_DELAY_MS } from "../composerText";
import { refreshLabelOnHover } from "../labelHover";
import { GLOBAL_TERMINALS_KEY } from "../terminals";
import { actionRunKey } from "../store/actionRunMarks";
import { ActionRunMarkBadge } from "./ActionRunMarkBadge";
import { ActionPopupHover } from "../popup/ActionPopupHover";
import { ActionFace } from "./ActionFace";

const FLAT_BASE =
  "relative flex cursor-grab select-none items-center rounded-md border text-[11px] font-medium transition-all duration-100 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40";
const FLAT_HEADER_TONE =
  "border-[var(--border)] bg-[var(--action-tint,var(--bg-secondary))] text-[var(--text-secondary)] hover:bg-[var(--action-tint-strong,var(--terminal-header-active))] hover:text-[var(--text-primary)]";
const FLAT_FOOTER_TONE =
  "border-[var(--composer-border)] bg-[var(--action-tint,var(--composer-surface))] text-[var(--composer-fg-secondary)] hover:bg-[var(--action-tint-strong,var(--composer-hover-bg))] hover:text-[var(--composer-fg)]";
const FLAT_ZONE_FIT = "h-full w-full justify-center whitespace-nowrap";

const FLAT_SIZE_CLASSES: Record<Exclude<ActionSize, "default">, string> = {
  compact: `${FLAT_BASE} py-1 ${FLAT_FOOTER_TONE}`,
  zone: `${FLAT_BASE} ${FLAT_ZONE_FIT} ${FLAT_HEADER_TONE}`,
  footerZone: `${FLAT_BASE} ${FLAT_ZONE_FIT} ${FLAT_FOOTER_TONE}`,
};

interface ActionViewProps {
  action: ActionInfo;
  size: ActionSize;
  disabled: boolean;
  onRun: (action: ActionInfo) => void;
  onContextMenu?: (e: MouseEvent, action: ActionInfo) => void;
  scope?: string;
}

export function ActionView({ action, size, disabled, onRun, onContextMenu, scope }: ActionViewProps) {
  const handleContextMenu = onContextMenu ? (e: MouseEvent) => onContextMenu(e, action) : undefined;
  const project = scope ?? GLOBAL_TERMINALS_KEY;
  const handleHover = () => refreshLabelOnHover(project, action);
  const zoneFit = size === "zone" || size === "footerZone";
  const parsedShortcut =
    action.cmd && action.shortcut ? parseShortcut(action.shortcut) : null;
  const shortcutLabel = parsedShortcut ? formatShortcut(parsedShortcut) : null;
  // An action with a popup shows its card on hover in place of a tooltip, with
  // the shortcut beside the card's title.
  const withPopup = (button: ReactElement) =>
    action.popup ? (
      <ActionPopupHover
        project={project}
        action={action}
        popup={action.popup}
        triggerClassName={zoneFit ? "flex h-full w-full" : "inline-flex"}
        extra={shortcutLabel ? <Combo label={shortcutLabel} /> : undefined}
      >
        {button}
      </ActionPopupHover>
    ) : (
      button
    );

  if (action.children?.length) {
    return withPopup(
      <SplitButton
        action={action}
        disabled={disabled}
        onRunAction={onRun}
        onContextMenu={handleContextMenu}
        onHover={handleHover}
        size={size}
        scope={scope}
      />,
    );
  }
  const runKey = actionRunKey(project, action.name);
  const displayLabel = withEmoji(action.emoji, action.label);
  const face = <ActionFace action={action} padding={size === "default" ? "px-3.5" : "px-2.5"} />;
  const title = shortcutLabel ? `${displayLabel}  ·  ${shortcutLabel}` : displayLabel;
  if (size !== "default") {
    return withPopup(
      <button
        onClick={() => onRun(action)}
        onContextMenu={handleContextMenu}
        onMouseEnter={handleHover}
        disabled={disabled}
        title={action.popup ? undefined : title}
        style={actionButtonStyle(action.color)}
        data-action-run={runKey}
        className={FLAT_SIZE_CLASSES[size]}
      >
        {face}
        <ActionRunMarkBadge runKey={runKey} />
      </button>,
    );
  }
  const button = (
    <ActionButton
      onClick={() => onRun(action)}
      onContextMenu={handleContextMenu}
      onMouseEnter={handleHover}
      disabled={disabled}
      variant="secondary"
      label={face}
      color={action.color}
      runKey={runKey}
    />
  );
  if (action.popup) return withPopup(button);
  if (!shortcutLabel) return button;
  return (
    <Tooltip
      content={
        <span className="flex items-center gap-2">
          {face}
          <Combo label={shortcutLabel} />
        </span>
      }
      side="top"
      delay={COMPOSER_TOOLTIP_DELAY_MS}
    >
      {button}
    </Tooltip>
  );
}
