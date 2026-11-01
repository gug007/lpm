import { useEffect, useRef } from "react";
import { HideQuickTerminal } from "../../../bridge/commands";
import { useTerminalFontSize } from "../../hooks/useTerminalFontSize";
import { defaultQuickTerminalKey, globalKeyLabel } from "../../quickTerminalKeys";
import { useComposerStore } from "../../store/composer";
import { useSettingsStore } from "../../store/settings";
import { GLOBAL_TERMINALS_KEY } from "../../terminals";
import { useResolvedTheme, useSystemThemeSync } from "../../theme";
import { shortPath } from "../../toolkit";
import { AppToaster } from "../AppToaster";
import { ComposerReopenBar } from "../ComposerReopenBar";
import { InteractivePane, type InteractivePaneHandle } from "../InteractivePane";
import { TerminalComposer } from "../TerminalComposer";
import { XIcon } from "../icons";
import { useQuickTerminalEscape } from "./useQuickTerminalEscape";
import { useQuickTerminalSession } from "./useQuickTerminalSession";

const LABEL = "Quick terminal";
const noop = () => {};

// The window the quick terminal key drops over any app: one shell, with lpm's
// input under it.
export function QuickTerminalApp() {
  const theme = useResolvedTheme();
  useSystemThemeSync();
  const { fontSize } = useTerminalFontSize();
  const composerOpen = useComposerStore((s) => s.open);
  const key = useSettingsStore((s) => s.quickTerminal?.key ?? defaultQuickTerminalKey());
  const { terminalId, cwd, shown, ended } = useQuickTerminalSession();
  const pane = useRef<InteractivePaneHandle>(null);
  const terminalBox = useRef<HTMLDivElement>(null);
  useQuickTerminalEscape(terminalId, terminalBox);

  useEffect(() => {
    if (shown && !composerOpen) pane.current?.focus();
  }, [shown, composerOpen, terminalId]);

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[var(--bg-primary)] text-[var(--text-primary)]">
      <AppToaster theme={theme} dockInset={0} />
      <div className="flex h-8 shrink-0 items-center gap-2 border-b border-[var(--border)] px-3 text-xs">
        <span className="font-medium">{LABEL}</span>
        <span className="min-w-0 truncate font-mono text-[var(--text-muted)]">{shortPath(cwd)}</span>
        <span className="ml-auto shrink-0 text-[var(--text-muted)]">
          {globalKeyLabel(key)} or Esc to hide
        </span>
        <button
          type="button"
          onClick={() => void HideQuickTerminal()}
          aria-label="Hide"
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
        >
          <XIcon />
        </button>
      </div>
      <div ref={terminalBox} className="flex min-h-0 flex-1 flex-col bg-[var(--terminal-bg)]">
        {terminalId && (
          <InteractivePane
            key={terminalId}
            ref={pane}
            terminalId={terminalId}
            visible={shown}
            fontSize={fontSize}
            cwd={cwd}
            onExit={() => {
              ended();
              void HideQuickTerminal();
            }}
          />
        )}
      </div>
      {terminalId &&
        (composerOpen ? (
          <TerminalComposer
            key={terminalId}
            terminalId={terminalId}
            historyKey="quick-terminal"
            projectName={GLOBAL_TERMINALS_KEY}
            shown={shown}
            focused
            targetLabel={LABEL}
            terminals={[{ id: terminalId, label: LABEL }]}
            cwd={cwd}
            fontSize={fontSize}
            canFork={false}
            onFork={noop}
            canForkCopy={false}
            onForkCopy={noop}
            onSubmit={(input) => pane.current?.submitInput(input) ?? false}
            onFocusTerminal={() => pane.current?.focus()}
            onRunInDuplicates={noop}
            onOpenMemorySession={noop}
            onDetachMemory={noop}
          />
        ) : (
          <ComposerReopenBar targetLabel={LABEL} fontSize={fontSize} />
        ))}
    </div>
  );
}
