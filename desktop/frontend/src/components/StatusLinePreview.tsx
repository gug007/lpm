import { AlertCircle, Eye, Info, type LucideIcon } from "lucide-react";
import type { CSSProperties } from "react";
import { AnsiLine } from "./AnsiLine";
import {
  StatusLinePreviewFrame,
  type StatusLineFrameStatus,
} from "./StatusLinePreviewFrame";
import { TERMINAL_FONT_FAMILY } from "./terminal-utils";

export interface StatusLinePreviewProps {
  text: string;
  emptyHint: string;
  themeStyle: CSSProperties | undefined;
  fontSize: number;
  status: StatusLinePreviewStatus;
  selectionLabel: string;
  note?: string | null;
  off?: boolean;
}

export type StatusLinePreviewStatus =
  | "loading"
  | "live"
  | "updating"
  | "paused"
  | "preview-only"
  | "error";

const STATUS: Record<StatusLinePreviewStatus, StatusLineFrameStatus> = {
  loading: { label: "Loading", tone: "neutral", pulsing: true },
  live: { label: "Live", tone: "live" },
  updating: { label: "Updating", tone: "neutral", pulsing: true },
  paused: { label: "Paused", tone: "attention" },
  "preview-only": { label: "Preview only", tone: "attention" },
  error: { label: "Unavailable", tone: "error" },
};

// What the footer says, and with which icon, when the preview isn't simply live.
const DETAIL: Partial<Record<StatusLinePreviewStatus, { text: string; icon: LucideIcon }>> = {
  paused: {
    text: "Claude Code keeps your last working line until the highlighted item is fixed.",
    icon: AlertCircle,
  },
  "preview-only": {
    text: "This change was not applied; your previous line remains active.",
    icon: Eye,
  },
  error: {
    text: "The preview could not be refreshed. Your active line is unchanged.",
    icon: AlertCircle,
  },
};

export function StatusLinePreview({
  text,
  emptyHint,
  themeStyle,
  fontSize,
  status,
  selectionLabel,
  note,
  off = false,
}: StatusLinePreviewProps) {
  const renderedEmptyHint =
    status === "error"
      ? "Preview unavailable"
      : status === "paused"
        ? "Fix a setting to preview"
        : status === "loading"
          ? "Loading preview…"
          : emptyHint;
  const detail = DETAIL[status];

  return (
    <StatusLinePreviewFrame
      selectionLabel={off ? null : selectionLabel}
      status={status === "live" && off ? null : STATUS[status]}
      themeStyle={themeStyle}
      footer={detail?.text ?? note ?? null}
      footerIcon={detail?.icon ?? Info}
    >
      <div
        className="min-w-max select-text whitespace-nowrap leading-relaxed"
        style={{
          color: "var(--terminal-fg)",
          fontFamily: TERMINAL_FONT_FAMILY,
          fontSize: `${fontSize}px`,
        }}
      >
        <span
          aria-hidden
          className="mr-2 select-none"
          style={{ color: "var(--terminal-fg)", opacity: 0.3 }}
        >
          ❯
        </span>
        {text.trim() ? (
          <AnsiLine text={text} />
        ) : (
          <span style={{ color: "var(--terminal-fg)", opacity: 0.45 }}>
            {renderedEmptyHint}
          </span>
        )}
      </div>
    </StatusLinePreviewFrame>
  );
}
