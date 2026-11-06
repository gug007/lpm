import { useMemo, useState, type ReactNode } from "react";
import { RotateCw } from "lucide-react";
import type { ActionInfo, ActionPopupInfo } from "../types";
import { stripMarker } from "../peer/markers";
import { useDelayedFlag } from "../hooks/useDelayedFlag";
import { PopupAge } from "./PopupAge";
import { PopupFrame } from "./PopupFrame";
import { PopupNote } from "./PopupNote";
import { popupTheme } from "./popupTheme";
import { useActionPopup } from "./useActionPopup";
import type { PopupPayload } from "./popupTypes";

// Formats this build draws; another a config names asks for a newer lpm.
const SHOWN_FORMATS = new Set(["html"]);

interface ActionPopupCardProps {
  project: string;
  action: ActionInfo;
  popup: ActionPopupInfo;
  open: boolean;
  // How long the card waits before running anything, so a card that only
  // flashes past under a moving pointer runs nothing.
  delay?: number;
  // Beside the title, as the shortcut a button's own tooltip would show.
  extra?: ReactNode;
}

// The popup's title, its page at the size the config asks for, and a line for
// data that didn't come. Anything that goes wrong reads as words in the frame.
export function ActionPopupCard({ project, action, popup, open, delay = 0, extra }: ActionPopupCardProps) {
  const settled = useDelayedFlag(open, delay);
  const shown = SHOWN_FORMATS.has(popup.format) && !popup.problem;
  const { content, loading, failure, refresh } = useActionPopup(project, action.name, settled && shown);
  const theme = useMemo(() => popupTheme(), []);
  const [frameFailure, setFrameFailure] = useState<string | null>(null);

  const payload = useMemo<PopupPayload | null>(
    () =>
      content
        ? {
            data: content.data ?? null,
            text: content.text ?? "",
            error: content.dataError ?? "",
            theme,
            project: stripMarker(project),
            action: action.name,
          }
        : null,
    [content, theme, project, action.name],
  );

  const { width, height } = popup;
  const title = popup.title || action.label;
  // A request that fails over a page already on show leaves the page up.
  const problem = popup.problem
    ? popup.problem
    : !shown
      ? `This popup is a \`${popup.format}\` page, which needs a newer lpm.`
      : (content?.error || (content ? null : failure) || frameFailure);
  const refreshNote = content && !problem ? content.refreshError || failure : null;
  const footer = refreshNote
    ? `Couldn't refresh: ${refreshNote}`
    : content?.dataError && !problem
      ? `Data: ${content.dataError}`
      : null;

  return (
    <div data-popup-card className="flex flex-col gap-2" style={{ width }}>
      <div className="flex min-w-0 items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold text-[var(--text-primary)]">
          {title}
        </span>
        {extra}
        {!!content?.updatedAt && !problem && <PopupAge updatedAt={content.updatedAt} />}
        {shown && (
          <button
            type="button"
            aria-label="Refresh"
            title="Refresh"
            onClick={() => {
              setFrameFailure(null);
              refresh();
            }}
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-[var(--text-muted)] transition-colors hover:bg-[var(--terminal-header-active)] hover:text-[var(--text-primary)]"
          >
            <RotateCw size={12} className={loading ? "animate-spin" : undefined} />
          </button>
        )}
      </div>
      <div style={{ width, height }} className="overflow-hidden rounded-md">
        {problem ? (
          <PopupNote tone="error">{problem}</PopupNote>
        ) : content?.html && payload ? (
          <PopupFrame
            html={content.html}
            file={content.file}
            payload={payload}
            width={width}
            height={height}
            onFailure={setFrameFailure}
          />
        ) : (
          <PopupNote>{settled ? "Loading…" : ""}</PopupNote>
        )}
      </div>
      {footer && (
        <span className="truncate text-[11px] text-[var(--accent-amber)]" title={footer}>
          {footer}
        </span>
      )}
    </div>
  );
}
