import { AlertCircle, Eye, RefreshCw } from "lucide-react";
import type { CSSProperties } from "react";
import { AnsiLine } from "./AnsiLine";

const TERMINAL_XTERM_FONT =
  "'SF Mono', Menlo, Monaco, 'Courier New', monospace";

export interface StatusLinePreviewProps {
  text: string;
  emptyHint: string;
  themeStyle: CSSProperties | undefined;
  fontSize: number;
  status: StatusLinePreviewStatus;
}

export type StatusLinePreviewStatus =
  | "live"
  | "updating"
  | "paused"
  | "preview-only"
  | "error";

const STATUS_DETAILS: Record<
  StatusLinePreviewStatus,
  { label: string; pillClass: string; dotClass: string; footer: string }
> = {
  live: {
    label: "Live",
    pillClass:
      "border-[var(--accent-green)]/25 bg-[var(--accent-green)]/8 text-[var(--accent-green-text)]",
    dotClass: "bg-[var(--accent-green)]",
    footer: "Changes sync automatically to Claude Code.",
  },
  updating: {
    label: "Updating",
    pillClass:
      "border-[var(--accent-blue)]/25 bg-[var(--accent-blue)]/8 text-[var(--accent-blue-text)]",
    dotClass: "bg-[var(--accent-blue)]",
    footer: "Refreshing the preview and syncing your changes…",
  },
  paused: {
    label: "Paused",
    pillClass:
      "border-[var(--accent-amber)]/25 bg-[var(--accent-amber)]/8 text-[var(--accent-amber-text)]",
    dotClass: "bg-[var(--accent-amber)]",
    footer: "Fix the highlighted setting to refresh this preview.",
  },
  "preview-only": {
    label: "Preview only",
    pillClass:
      "border-[var(--accent-amber)]/25 bg-[var(--accent-amber)]/8 text-[var(--accent-amber-text)]",
    dotClass: "bg-[var(--accent-amber)]",
    footer: "This change was not applied; your previous line remains active.",
  },
  error: {
    label: "Unavailable",
    pillClass:
      "border-[var(--accent-red)]/25 bg-[var(--accent-red)]/8 text-[var(--accent-red-text)]",
    dotClass: "bg-[var(--accent-red)]",
    footer:
      "The preview could not be refreshed. Your active line is unchanged.",
  },
};

export function StatusLinePreview({
  text,
  emptyHint,
  themeStyle,
  fontSize,
  status,
}: StatusLinePreviewProps) {
  const details = STATUS_DETAILS[status];
  const updating = status === "updating";
  const renderedEmptyHint =
    status === "error"
      ? "Preview unavailable"
      : status === "paused"
        ? "Fix a setting to preview"
        : emptyHint;

  return (
    <section className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)]/35 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] px-3 py-2.5 sm:px-4">
        <div className="flex items-center gap-2.5">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--accent-green)]/10 text-[var(--accent-green-text)]">
            <span aria-hidden className="text-[13px] leading-none">
              ❯_
            </span>
          </span>
          <div>
            <h2 className="text-[12.5px] font-semibold text-[var(--text-primary)]">
              Live preview
            </h2>
            <p className="text-[10.5px] text-[var(--text-muted)]">
              Sample data in your terminal theme
            </p>
          </div>
        </div>
        <span
          role="status"
          aria-live="polite"
          className={`flex items-center gap-1.5 rounded-full border px-2 py-1 text-[10px] font-medium ${details.pillClass}`}
        >
          <span
            aria-hidden
            className={`h-1.5 w-1.5 rounded-full ${details.dotClass} ${updating ? "animate-pulse motion-reduce:animate-none" : ""}`}
          />
          {details.label}
        </span>
      </div>

      <div className="p-2.5 sm:p-3">
        <div
          className="overflow-hidden rounded-lg border border-[var(--terminal-header-border)] shadow-sm"
          style={{ ...themeStyle, background: "var(--terminal-bg)" }}
        >
          <div className="flex items-center gap-1.5 border-b border-[var(--terminal-header-border)] px-3 py-2">
            <span
              aria-hidden
              className="h-2.5 w-2.5 rounded-full"
              style={{ background: "#ff5f56" }}
            />
            <span
              aria-hidden
              className="h-2.5 w-2.5 rounded-full"
              style={{ background: "#ffbd2e" }}
            />
            <span
              aria-hidden
              className="h-2.5 w-2.5 rounded-full"
              style={{ background: "#27c93f" }}
            />
            <span
              className="ml-1.5 text-[10px] tracking-wide"
              style={{
                color: "var(--terminal-fg)",
                opacity: 0.45,
                fontFamily: TERMINAL_XTERM_FONT,
              }}
            >
              claude
            </span>
          </div>
          <div className="overflow-x-auto px-3 py-4 sm:px-4">
            <div
              className="min-w-max whitespace-nowrap leading-relaxed"
              style={{
                color: "var(--terminal-fg)",
                fontFamily: TERMINAL_XTERM_FONT,
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
                <span style={{ color: "var(--terminal-fg)", opacity: 0.4 }}>
                  {renderedEmptyHint}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 border-t border-[var(--border)] px-3 py-2 text-[10.5px] text-[var(--text-muted)] sm:px-4">
        {status === "error" || status === "paused" ? (
          <AlertCircle aria-hidden className="h-3 w-3 shrink-0" />
        ) : status === "preview-only" ? (
          <Eye aria-hidden className="h-3 w-3 shrink-0" />
        ) : (
          <RefreshCw
            aria-hidden
            className={`h-3 w-3 shrink-0 ${updating ? "animate-spin motion-reduce:animate-none" : ""}`}
          />
        )}
        <span>{details.footer}</span>
      </div>
    </section>
  );
}
