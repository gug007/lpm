import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  GetClaudeStatuslineState,
  GetCodexStatuslineState,
  PreviewClaudeStatusline,
} from "../../bridge/commands";
import { useTerminalTheme } from "../hooks/useTerminalTheme";
import { AnsiLine } from "./AnsiLine";
import {
  codexStatusLineColor,
  codexStatusLineColorScheme,
  type CodexStatusLineColorScheme,
} from "./codexStatusLineColors";
import {
  canonicalCodexStatusLineId,
  codexStatusLineOption,
} from "./codexStatusLineOptions";
import type { CustomSpec } from "./statusLineTypes";
import { onStatusLineChanged } from "./statusLineChanges";

type Agent = "claude" | "codex";

type RowLine =
  | { status: "loading" }
  | { status: "error" }
  | { status: "off" }
  | { status: "unavailable" }
  | { status: "ansi"; text: string }
  | { status: "codex"; items: string[]; useColors: boolean };

const FADE = "linear-gradient(to right, black calc(100% - 40px), transparent)";

function withoutEmptyText(spec: CustomSpec): CustomSpec {
  return {
    ...spec,
    segments: spec.segments.filter(
      (segment) => segment.id !== "text" || segment.text.trim() !== "",
    ),
  };
}

function claudeSelection(state: {
  selected?: string;
  custom?: CustomSpec;
}): Record<string, unknown> {
  const selected = state.selected ?? "current";
  if (selected === "custom" && state.custom) {
    return { kind: "custom", spec: withoutEmptyText(state.custom) };
  }
  if (selected === "current" || selected === "ai") return { kind: selected };
  return { kind: "template", id: selected };
}

async function loadClaude(): Promise<RowLine> {
  const state = await GetClaudeStatuslineState();
  if ((state?.selected ?? "current") === "current" && !state?.hasCustom) {
    return { status: "off" };
  }
  let output: unknown;
  try {
    output = await PreviewClaudeStatusline(claudeSelection(state ?? {}));
  } catch {
    return { status: "unavailable" };
  }
  return typeof output === "string" && output.trim()
    ? { status: "ansi", text: output }
    : { status: "unavailable" };
}

async function loadCodex(): Promise<RowLine> {
  const state = await GetCodexStatuslineState();
  const items: string[] = Array.isArray(state?.items)
    ? state.items
        .filter((item: unknown): item is string => typeof item === "string")
        .map(canonicalCodexStatusLineId)
    : [];
  const visible = items.filter(
    (item) => codexStatusLineOption(item).preview.length > 0,
  );
  if (items.length === 0) return { status: "off" };
  return visible.length === 0
    ? { status: "unavailable" }
    : {
        status: "codex",
        items: visible,
        useColors: state?.useColors !== false,
      };
}

export function StatusLineRowPreview({ agent }: { agent: Agent }) {
  const { themeStyle } = useTerminalTheme();
  const stripRef = useRef<HTMLDivElement>(null);
  const [line, setLine] = useState<RowLine>({ status: "loading" });
  const [scheme, setScheme] = useState<CodexStatusLineColorScheme>("dark");

  useEffect(() => {
    let request = 0;
    const load = () => {
      const token = ++request;
      (agent === "claude" ? loadClaude() : loadCodex())
        .then((next) => {
          if (token === request) setLine(next);
        })
        .catch(() => {
          if (token === request) setLine({ status: "error" });
        });
    };
    load();
    const unsubscribe = onStatusLineChanged((changed) => {
      if (changed === agent) load();
    });
    return () => {
      request++;
      unsubscribe();
    };
  }, [agent]);

  useLayoutEffect(() => {
    const updateScheme = () => {
      if (!stripRef.current) return;
      setScheme(
        codexStatusLineColorScheme(
          getComputedStyle(stripRef.current)
            .getPropertyValue("--terminal-bg")
            .trim(),
        ),
      );
    };
    updateScheme();
    const observer = new MutationObserver(updateScheme);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    return () => observer.disconnect();
  }, [themeStyle, line.status]);

  if (line.status === "error") {
    return (
      <p className="mt-1.5 flex items-center gap-1.5 text-[11px] text-[var(--accent-red-text)]">
        <span
          aria-hidden
          className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--accent-red)]"
        />
        Couldn’t read your status line settings.
      </p>
    );
  }

  if (line.status === "loading") {
    return (
      <div
        aria-hidden
        className="mt-1.5 h-[26px] animate-pulse rounded-md bg-[var(--bg-active)]/60 motion-reduce:animate-none"
      />
    );
  }

  return (
    <div
      ref={stripRef}
      className="mt-1.5 flex h-[26px] items-center overflow-hidden rounded-md border border-[var(--terminal-header-border)]/50 px-2.5"
      style={{ ...themeStyle, background: "var(--terminal-bg)" }}
      title="Sample values"
    >
      <div
        className="min-w-0 overflow-hidden whitespace-nowrap font-mono text-[10.5px]"
        style={{
          color: "var(--terminal-fg)",
          maskImage: FADE,
          WebkitMaskImage: FADE,
        }}
      >
        {line.status === "off" || line.status === "unavailable" ? (
          <span style={{ opacity: 0.5 }}>
            {line.status === "off"
              ? "Nothing shows under the prompt"
              : "Preview unavailable"}
          </span>
        ) : line.status === "ansi" ? (
          <AnsiLine text={line.text} />
        ) : (
          line.items.map((item, index) => {
            const option = codexStatusLineOption(item);
            return (
              <span key={`${item}:${index}`}>
                {index > 0 && (
                  <span
                    aria-hidden
                    className="px-1.5"
                    style={{ opacity: 0.38 }}
                  >
                    ·
                  </span>
                )}
                <span
                  style={{
                    color: line.useColors
                      ? codexStatusLineColor(option.accent, scheme)
                      : undefined,
                    opacity: line.useColors ? 1 : 0.65,
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
  );
}
