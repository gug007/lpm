import { useMemo, useState } from "react";
import { RotateCw } from "lucide-react";
import type { ActionInfo } from "../types";
import { stripMarker } from "../peer/markers";
import { useOverlayStore } from "../store/overlay";
import { PopupAge } from "./PopupAge";
import { PopupFrame } from "./PopupFrame";
import { PopupNote } from "./PopupNote";
import { usePopupTheme } from "./popupTheme";
import { useActionPopup } from "./useActionPopup";
import { SHOWN_FORMATS, type PopupPayload } from "./popupTypes";

interface AppTabViewProps {
  project: string;
  actionName: string;
  // The action as the project has it now; null once the config dropped it.
  action: ActionInfo | null;
  label: string;
  active: boolean;
}

// An action's app: its page filling a tab, under a bar with its title, how old
// its data is and a refresh. The page keeps running while another tab is in
// front, and steps aside for anything the app draws over it.
export function AppTabView({ project, actionName, action, label, active }: AppTabViewProps) {
  const page = action?.app ?? action?.popup;
  const drawn = !page || (SHOWN_FORMATS.has(page.format) && !page.problem);
  const { content, loading, failure, refresh } = useActionPopup(project, actionName, active && drawn, "tab");
  const theme = usePopupTheme();
  const overlayOpen = useOverlayStore((s) => s.count > 0);
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
            action: actionName,
            view: "tab",
          }
        : null,
    [content, theme, project, actionName],
  );

  const title = page?.title || action?.label || label;
  const problem = page?.problem
    ? page.problem
    : !drawn
      ? `This mini app is a \`${page?.format}\` page, which needs a newer lpm.`
      : content?.error || (content ? null : failure) || frameFailure;
  const refreshNote = content && !problem ? content.refreshError || failure : null;
  const note = refreshNote
    ? `Couldn't refresh: ${refreshNote}`
    : content?.dataError && !problem
      ? `Data: ${content.dataError}`
      : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-[var(--bg-secondary)]">
      <div className="flex h-8 shrink-0 items-center gap-2 border-b border-[var(--border)] px-3">
        <span className="min-w-0 shrink truncate text-[12.5px] font-semibold text-[var(--text-primary)]">
          {title}
        </span>
        <span className="min-w-0 flex-1 truncate text-[11px] text-[var(--accent-amber)]" title={note ?? undefined}>
          {note}
        </span>
        {!!content?.updatedAt && !problem && <PopupAge updatedAt={content.updatedAt} />}
        {drawn && (
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
      <div className="relative min-h-0 flex-1">
        {problem ? (
          <PopupNote tone="error">{problem}</PopupNote>
        ) : content?.html && payload ? (
          <>
            <PopupNote>{title}</PopupNote>
            <div className="absolute inset-0">
              <PopupFrame
                key={theme.mode}
                html={content.html}
                file={content.file}
                payload={payload}
                width="100%"
                height="100%"
                shown={active && !overlayOpen}
                onFailure={setFrameFailure}
                onRefresh={refresh}
              />
            </div>
          </>
        ) : (
          <PopupNote>{active ? "Loading…" : ""}</PopupNote>
        )}
      </div>
    </div>
  );
}
