import type { ReactNode } from "react";
import type { ContentZoom } from "../../../hooks/useContentZoom";
import type { JobInfo } from "../../../jobsFormat";
import { ChevronLeftIcon, ClockIcon } from "../../icons";
import { ZoomControl } from "../../ui/ZoomControl";

// The top of one run's page: back to the automation, its name over `meta`, the
// reader zoom, and the page's own buttons after it.
export function JobRunPageHeader({
  job,
  meta,
  zoom,
  onBack,
  children,
}: {
  job: JobInfo;
  meta: string;
  zoom: ContentZoom;
  onBack: () => void;
  children?: ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 pt-6">
      <button
        type="button"
        onClick={onBack}
        aria-label="Back to the automation"
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
      >
        <ChevronLeftIcon />
      </button>
      <span className="grid h-8 w-8 shrink-0 place-items-center text-[17px] text-[var(--text-muted)]">
        {job.emoji || <ClockIcon size={16} />}
      </span>
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-lg font-semibold tracking-tight">{job.label || job.id}</h1>
        <p className="truncate text-[11px] text-[var(--text-muted)]">{meta}</p>
      </div>
      <ZoomControl
        percent={zoom.percent}
        onZoomIn={zoom.zoomIn}
        onZoomOut={zoom.zoomOut}
        onReset={zoom.zoomReset}
        canZoomIn={zoom.canZoomIn}
        canZoomOut={zoom.canZoomOut}
      />
      {children}
    </div>
  );
}
