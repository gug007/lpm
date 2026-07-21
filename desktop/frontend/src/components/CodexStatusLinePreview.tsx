import { AlertCircle, CheckCircle2, LoaderCircle, Terminal } from "lucide-react";
import {
  type CSSProperties,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  codexStatusLineColor,
  codexStatusLineColorScheme,
  type CodexStatusLineColorScheme,
} from "./codexStatusLineColors";
import { codexStatusLineOption } from "./codexStatusLineOptions";

export type CodexStatusLinePreviewStatus =
  | "loading"
  | "ready"
  | "saving"
  | "error";

const TERMINAL_FONT = "'SF Mono', Menlo, Monaco, 'Courier New', monospace";

export function CodexStatusLinePreview({
  items,
  useColors,
  configured,
  status,
  themeStyle,
  fontSize,
}: {
  items: string[];
  useColors: boolean;
  configured: boolean;
  status: CodexStatusLinePreviewStatus;
  themeStyle: CSSProperties | undefined;
  fontSize: number;
}) {
  const terminalRef = useRef<HTMLDivElement>(null);
  const [colorScheme, setColorScheme] =
    useState<CodexStatusLineColorScheme>("dark");
  const previewItems = items
    .map((item) => ({ item, option: codexStatusLineOption(item) }))
    .filter(({ option }) => option.preview.length > 0);
  const details =
    status === "loading"
      ? {
          label: "Loading",
          pill: "border-[var(--accent-blue)]/25 bg-[var(--accent-blue)]/8 text-[var(--accent-blue-text)]",
          dot: "bg-[var(--accent-blue)]",
          footer: "Loading your Codex configuration…",
        }
      : status === "saving"
        ? {
            label: "Saving",
            pill: "border-[var(--accent-blue)]/25 bg-[var(--accent-blue)]/8 text-[var(--accent-blue-text)]",
            dot: "bg-[var(--accent-blue)]",
            footer: "Saving the ordered fields to config.toml…",
          }
        : status === "error"
          ? {
              label: "Preview only",
              pill: "border-[var(--accent-red)]/25 bg-[var(--accent-red)]/8 text-[var(--accent-red-text)]",
              dot: "bg-[var(--accent-red)]",
              footer:
                "This preview was not saved. Your previous Codex configuration remains active.",
            }
          : {
              label: configured ? "Saved" : "Default",
              pill: "border-[var(--accent-green)]/25 bg-[var(--accent-green)]/8 text-[var(--accent-green-text)]",
              dot: "bg-[var(--accent-green)]",
              footer: configured
                ? "Saved to config.toml. Start a new Codex session to see changes."
                : "Showing Codex’s default field selection.",
            };
  const Icon =
    status === "loading" || status === "saving"
      ? LoaderCircle
      : status === "error"
        ? AlertCircle
        : CheckCircle2;
  const selectionLabel =
    items.length === 0
      ? "Off"
      : configured
        ? `${items.length} ${items.length === 1 ? "item" : "items"}`
        : "Codex default";

  useLayoutEffect(() => {
    const updateColorScheme = () => {
      const background = getComputedStyle(
        terminalRef.current ?? document.documentElement,
      )
        .getPropertyValue("--terminal-bg")
        .trim();
      setColorScheme(codexStatusLineColorScheme(background));
    };
    updateColorScheme();
    const observer = new MutationObserver(updateColorScheme);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    return () => observer.disconnect();
  }, [themeStyle]);

  return (
    <section className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-secondary)]/35 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 sm:px-4">
        <div className="flex items-center gap-2.5">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--accent-green)]/10 text-[var(--accent-green-text)]">
            <Terminal aria-hidden size={14} />
          </span>
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
            <h2 className="text-[12.5px] font-semibold text-[var(--text-primary)]">
              Preview
            </h2>
            <span className="max-w-48 truncate rounded-md bg-[var(--bg-active)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--text-muted)]">
              {selectionLabel}
            </span>
          </div>
        </div>
        <span
          role="status"
          aria-live="polite"
          className={`flex items-center gap-1.5 rounded-full border px-2 py-1 text-[10px] font-medium ${details.pill}`}
        >
          <span
            aria-hidden
            className={`h-1.5 w-1.5 rounded-full ${details.dot} ${
              status === "loading" || status === "saving"
                ? "animate-pulse motion-reduce:animate-none"
                : ""
            }`}
          />
          {details.label}
        </span>
      </div>

      <div className="px-2.5 pb-2.5 sm:px-3 sm:pb-3">
        <div
          ref={terminalRef}
          className="overflow-x-auto rounded-xl border border-[var(--terminal-header-border)] px-3 py-3 shadow-sm sm:px-4"
          style={{ ...themeStyle, background: "var(--terminal-bg)" }}
        >
          <div
            className="flex min-w-max select-text items-center whitespace-nowrap leading-relaxed"
            style={{
              color: "var(--terminal-fg)",
              fontFamily: TERMINAL_FONT,
              fontSize: `${fontSize}px`,
            }}
          >
            {status === "loading" ? (
              <span style={{ color: "var(--terminal-fg)", opacity: 0.4 }}>
                Loading preview…
              </span>
            ) : items.length === 0 ? (
              <span style={{ color: "var(--terminal-fg)", opacity: 0.4 }}>
                Status line hidden
              </span>
            ) : previewItems.length === 0 ? (
              <span style={{ color: "var(--terminal-fg)", opacity: 0.4 }}>
                Preview unavailable for these items
              </span>
            ) : (
              previewItems.map(({ item, option }, index) => {
                return (
                  <span key={`${item}:${index}`} className="contents">
                    {index > 0 && (
                      <span
                        aria-hidden
                        className="px-1.5"
                        style={{ color: "var(--terminal-fg)", opacity: 0.38 }}
                      >
                        ·
                      </span>
                    )}
                    <span
                      data-status-line-item={item}
                      style={{
                        color: useColors
                          ? codexStatusLineColor(option.accent, colorScheme)
                          : "var(--terminal-fg)",
                        opacity: useColors ? 1 : 0.65,
                        textDecoration:
                          option.id === "pull-request-number"
                            ? "underline"
                            : undefined,
                      }}
                    >
                      {option.preview}
                    </span>
                  </span>
                );
              })
            )}
          </div>
        </div>
        <div className="mt-2 flex items-start gap-1.5 px-1 text-[10px] leading-relaxed text-[var(--text-muted)]">
          <Icon
            aria-hidden
            size={11}
            className={`mt-0.5 shrink-0 ${
              status === "loading" || status === "saving"
                ? "animate-spin motion-reduce:animate-none"
                : ""
            }`}
          />
          <span>{details.footer}</span>
        </div>
      </div>
    </section>
  );
}
