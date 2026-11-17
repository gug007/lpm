import type { ReactNode } from "react";
import { ChevronLeft } from "lucide-react";
import type { MemorySession } from "../../types";
import { MemoryStamp } from "../MemoryStamp";
import { PencilIcon, PlusIcon, SquarePenIcon, TrashIcon } from "../icons";
import type { ContentZoom } from "../../hooks/useContentZoom";
import { BTN_SECONDARY, ICON_ACTION, ICON_ACTION_DANGER, TEXT_ACTION } from "../ui/buttons";
import { StatusChip } from "../ui/StatusChip";
import { ZoomControl } from "../ui/ZoomControl";

interface MemoryToolbarProps {
  view: "list" | "detail" | "create";
  count: number;
  // The original whose memory a copy shows, when this project is a copy.
  sharedWith: string;
  detail?: MemorySession;
  editing: boolean;
  zoom: ContentZoom;
  onBack: () => void;
  onCreate: () => void;
  onRename: (session: MemorySession) => void;
  onEdit: (session: MemorySession) => void;
  onDelete: (session: MemorySession) => void;
}

// The Memory tab's bar. The tab already names the page, so the bar carries
// where you are in it and what you can do there.
export function MemoryToolbar({
  view,
  count,
  sharedWith,
  detail,
  editing,
  zoom,
  onBack,
  onCreate,
  onRename,
  onEdit,
  onDelete,
}: MemoryToolbarProps) {
  let lead: ReactNode;
  if (view === "list") {
    lead = (
      <>
        <span className="text-[12px] text-[var(--text-muted)]">
          {count} {count === 1 ? "session" : "sessions"}
        </span>
        {sharedWith && (
          <span title={`Copies share the memory of ${sharedWith}, so work carries over both ways`}>
            <StatusChip>Shared with {sharedWith}</StatusChip>
          </span>
        )}
      </>
    );
  } else {
    lead = (
      <>
        <button type="button" onClick={onBack} className={`${TEXT_ACTION} -ml-1.5 h-7 gap-0.5`}>
          <ChevronLeft size={14} strokeWidth={2.2} />
          All sessions
        </button>
        {detail && (
          <>
            <span className="text-[var(--text-muted)]">/</span>
            <span className="min-w-0 truncate text-[13px] font-medium text-[var(--text-primary)]">{detail.title}</span>
          </>
        )}
      </>
    );
  }

  const showZoom = !!detail || view === "list";
  return (
    <div className="flex h-11 shrink-0 items-center gap-2 border-b border-[var(--border)] px-4">
      {lead}
      <div className="flex-1" />
      {showZoom && (
        <ZoomControl
          percent={zoom.percent}
          onZoomIn={zoom.zoomIn}
          onZoomOut={zoom.zoomOut}
          onReset={zoom.zoomReset}
          canZoomIn={zoom.canZoomIn}
          canZoomOut={zoom.canZoomOut}
        />
      )}
      {detail && !editing && (
        <>
          <MemoryStamp session={detail} />
          <button
            type="button"
            onClick={() => onRename(detail)}
            aria-label="Rename session"
            title="Rename session"
            className={ICON_ACTION}
          >
            <SquarePenIcon size={13} />
          </button>
          <button type="button" onClick={() => onEdit(detail)} className={`${BTN_SECONDARY} flex items-center gap-1.5`}>
            <PencilIcon size={12} />
            Edit
          </button>
          <button
            type="button"
            onClick={() => onDelete(detail)}
            aria-label="Delete session"
            title="Delete session"
            className={ICON_ACTION_DANGER}
          >
            <TrashIcon />
          </button>
        </>
      )}
      {view === "list" && (
        <button type="button" onClick={onCreate} className={`${BTN_SECONDARY} flex items-center gap-1.5`}>
          <PlusIcon />
          New session
        </button>
      )}
    </div>
  );
}
