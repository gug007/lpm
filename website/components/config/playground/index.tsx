"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { load as parseYaml, YAMLException } from "js-yaml";
import { RotateCcw, Check, Copy } from "lucide-react";
import { useDarkMode, useInView } from "./hooks";
import { PlaygroundPreview } from "./preview";
import type { RawConfig } from "./types";

export type { RawConfig };

const MonacoEditor = dynamic(
  () => import("@monaco-editor/react").then((m) => m.default),
  {
    ssr: false,
    loading: () => (
      <div className="h-full w-full flex items-center justify-center text-[11px] text-gray-400 dark:text-gray-600">
        Loading editor…
      </div>
    ),
  },
);

const DEFAULT_STARTER = `name: myapp
root: ~/Projects/myapp

services:
  web: npm run dev
  server:
    cmd: node server.js
    cwd: ./server
    port: 4000
    env:
      API_KEY: dev-secret

actions:
  test: npm test                  # default — shown in the header
  lint: npm run lint
  format:
    cmd: npm run format
    label: Format
    display: footer               # compact, in the terminal footer
  deploy:
    cmd: ./scripts/deploy.sh
    label: Deploy
    confirm: true                 # display omitted = header

terminals:
  claude:
    cmd: claude
    label: Claude Code            # default — shown in the header
  logs: tail -f ./logs/dev.log

profiles:
  minimal: [web]
  full: [web, server]
`;

const MONACO_OPTIONS = {
  minimap: { enabled: false },
  fontSize: 12,
  fontFamily:
    "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
  lineNumbers: "on" as const,
  scrollBeyondLastLine: false,
  wordWrap: "on" as const,
  tabSize: 2,
  padding: { top: 12, bottom: 12 },
  renderLineHighlight: "none" as const,
  overviewRulerLanes: 0,
  hideCursorInOverviewRuler: true,
  overviewRulerBorder: false,
  scrollbar: {
    verticalScrollbarSize: 8,
    horizontalScrollbarSize: 8,
  },
};

type ParseResult = { config: RawConfig | null; error: string | null };

function parseConfig(source: string): ParseResult {
  try {
    const parsed = parseYaml(source);
    if (parsed == null) return { config: null, error: null };
    if (typeof parsed !== "object" || Array.isArray(parsed)) {
      return { config: null, error: "Config must be a map at the top level." };
    }
    return { config: parsed as RawConfig, error: null };
  } catch (e) {
    if (e instanceof YAMLException) {
      const line =
        e.mark && typeof e.mark.line === "number"
          ? ` (line ${e.mark.line + 1})`
          : "";
      return { config: null, error: `${e.reason}${line}` };
    }
    return {
      config: null,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

export function ConfigPlayground({
  initial,
  filename = "example.yml",
  editorHeight = 300,
  previewHeight = 280,
}: {
  initial?: string;
  filename?: string;
  editorHeight?: number;
  previewHeight?: number;
} = {}) {
  const starter = initial ?? DEFAULT_STARTER;
  const [code, setCode] = useState(starter);
  const [copied, setCopied] = useState(false);
  const dark = useDarkMode();
  const { ref, inView } = useInView<HTMLDivElement>();

  const { config, error } = useMemo(() => parseConfig(code), [code]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard access can fail silently (e.g. insecure context)
    }
  };

  const handleReset = () => setCode(starter);

  return (
    <div ref={ref} className="mb-6">
      <div className="rounded-2xl border border-gray-200 dark:border-gray-800 overflow-hidden bg-white dark:bg-gray-950">
        <Toolbar
          filename={filename}
          valid={error === null}
          copied={copied}
          onCopy={handleCopy}
          onReset={handleReset}
        />

        <div className="flex flex-col">
          <div style={{ height: previewHeight }}>
            <PlaygroundPreview config={config} error={error} />
          </div>
          <div
            className="border-t border-gray-200 dark:border-gray-800"
            style={{ height: editorHeight }}
          >
            {inView ? (
              <MonacoEditor
                height="100%"
                defaultLanguage="yaml"
                language="yaml"
                theme={dark ? "vs-dark" : "vs"}
                value={code}
                onChange={(v) => setCode(v ?? "")}
                options={MONACO_OPTIONS}
              />
            ) : (
              <pre className="h-full w-full m-0 px-4 py-3 text-xs font-mono text-gray-700 dark:text-gray-300 leading-relaxed overflow-auto bg-white dark:bg-gray-950">
                <code>{starter}</code>
              </pre>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Toolbar({
  filename,
  valid,
  copied,
  onCopy,
  onReset,
}: {
  filename: string;
  valid: boolean;
  copied: boolean;
  onCopy: () => void;
  onReset: () => void;
}) {
  return (
    <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100 dark:border-gray-800 bg-gray-50/80 dark:bg-gray-900/60">
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-[11px] font-mono text-gray-500 dark:text-gray-400 truncate">
          {filename}
        </span>
        {valid ? (
          <span className="text-[10px] font-medium text-emerald-600 dark:text-emerald-400 flex-shrink-0">
            valid
          </span>
        ) : (
          <span className="text-[10px] font-medium text-red-600 dark:text-red-400 flex-shrink-0">
            invalid
          </span>
        )}
      </div>
      <div className="flex items-center gap-1 flex-shrink-0">
        <ToolbarButton onClick={onReset} ariaLabel="Reset to initial">
          <RotateCcw className="w-3 h-3" />
          Reset
        </ToolbarButton>
        <ToolbarButton
          onClick={onCopy}
          ariaLabel={copied ? "Copied" : "Copy YAML"}
        >
          {copied ? (
            <>
              <Check className="w-3 h-3 text-emerald-500" />
              Copied
            </>
          ) : (
            <>
              <Copy className="w-3 h-3" />
              Copy
            </>
          )}
        </ToolbarButton>
      </div>
    </div>
  );
}

function ToolbarButton({
  children,
  onClick,
  ariaLabel,
}: {
  children: React.ReactNode;
  onClick: () => void;
  ariaLabel: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      className="flex items-center gap-1 rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-2 py-1 text-[10px] font-medium text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:border-gray-300 dark:hover:border-gray-600 transition-colors"
    >
      {children}
    </button>
  );
}
