import { AlertCircle, CheckCircle2, LoaderCircle, type LucideIcon } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import type { CodexStatusLineColorScheme } from "./codexStatusLineColors";
import { previewableCodexItems } from "./codexStatusLineOptions";
import { CodexStatusLineItems } from "./CodexStatusLineItems";
import {
  StatusLinePreviewFrame,
  type StatusLineFrameStatus,
} from "./StatusLinePreviewFrame";
import { TERMINAL_FONT_FAMILY } from "./terminal-utils";

export type CodexStatusLinePreviewStatus =
  | "loading"
  | "ready"
  | "saving"
  | "error";

interface PreviewState {
  status: StatusLineFrameStatus | null;
  footer: string;
  icon: LucideIcon;
  busy?: boolean;
}

const STATES: Record<Exclude<CodexStatusLinePreviewStatus, "ready">, PreviewState> = {
  loading: {
    status: { label: "Loading", tone: "neutral", pulsing: true },
    footer: "Loading your Codex status line…",
    icon: LoaderCircle,
    busy: true,
  },
  saving: {
    status: { label: "Saving", tone: "neutral", pulsing: true },
    footer: "Saving your status line…",
    icon: LoaderCircle,
    busy: true,
  },
  error: {
    status: { label: "Preview only", tone: "error" },
    footer: "This preview was not saved. Your previous status line is still active.",
    icon: AlertCircle,
  },
};

function readyState(configured: boolean, hasItems: boolean): PreviewState {
  return {
    status: configured && hasItems ? { label: "Saved", tone: "live" } : null,
    footer: configured
      ? "New Codex sessions show this line; open ones keep the old one."
      : "Codex's own items. Nothing is written to its config until you change them.",
    icon: CheckCircle2,
  };
}

export function CodexStatusLinePreview({
  items,
  useColors,
  configured,
  selectionLabel,
  status,
  colorScheme,
  themeStyle,
  fontSize,
  accessory,
}: {
  items: string[];
  useColors: boolean;
  configured: boolean;
  selectionLabel: string;
  status: CodexStatusLinePreviewStatus;
  colorScheme: CodexStatusLineColorScheme;
  themeStyle: CSSProperties | undefined;
  fontSize: number;
  accessory?: ReactNode;
}) {
  const state = status === "ready" ? readyState(configured, items.length > 0) : STATES[status];
  const placeholder =
    status === "loading"
      ? "Loading preview…"
      : items.length === 0
        ? "Status line hidden"
        : previewableCodexItems(items).length === 0
          ? "Preview unavailable for these items"
          : null;

  return (
    <StatusLinePreviewFrame
      selectionLabel={selectionLabel}
      status={state.status}
      themeStyle={themeStyle}
      footer={state.footer}
      footerIcon={state.icon}
      footerSpinning={state.busy}
      footerAccessory={accessory}
    >
      <div
        className="flex min-w-max select-text items-center whitespace-nowrap leading-relaxed"
        style={{
          color: "var(--terminal-fg)",
          fontFamily: TERMINAL_FONT_FAMILY,
          fontSize: `${fontSize}px`,
        }}
      >
        {placeholder ? (
          <span style={{ opacity: 0.45 }}>{placeholder}</span>
        ) : (
          <CodexStatusLineItems items={items} useColors={useColors} scheme={colorScheme} />
        )}
      </div>
    </StatusLinePreviewFrame>
  );
}
