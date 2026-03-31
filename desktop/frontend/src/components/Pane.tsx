import { useRef, useEffect } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";

export function Pane({ label, output, visible = true }: { label?: string; output: string; visible?: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const prevLinesRef = useRef<string[]>([]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const term = new Terminal({
      fontSize: 12,
      fontFamily: "'SF Mono', Menlo, Monaco, 'Courier New', monospace",
      cursorBlink: false,
      disableStdin: true,
      convertEol: true,
      scrollback: 5000,
      theme: {
        background: "#0d0d0d",
        foreground: "#cccccc",
        selectionBackground: "#444444",
      },
    });

    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(el);
    termRef.current = term;
    fitRef.current = fit;

    try { fit.fit(); } catch {}

    const ro = new ResizeObserver(() => {
      try { fit.fit(); } catch {}
    });
    ro.observe(el);

    return () => {
      ro.disconnect();
      term.dispose();
      termRef.current = null;
      fitRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!visible) return;
    const term = termRef.current;
    const fit = fitRef.current;
    if (!term || !fit) return;
    // Re-fit and repaint after becoming visible
    requestAnimationFrame(() => {
      try { fit.fit(); } catch {}
      try { term.refresh(0, term.rows - 1); } catch {}
    });
  }, [visible]);

  useEffect(() => {
    const term = termRef.current;
    if (!term) return;

    const newLines = output ? output.split("\n") : [];
    const prevLines = prevLinesRef.current;
    prevLinesRef.current = newLines;

    if (newLines.length === 0) return;

    if (prevLines.length === 0) {
      term.write(newLines.join("\n"));
      return;
    }

    // Find where previous output's last line appears in new output
    const lastPrev = prevLines[prevLines.length - 1];
    let overlapIdx = -1;
    for (let i = newLines.length - 1; i >= 0; i--) {
      if (newLines[i] === lastPrev) {
        overlapIdx = i;
        break;
      }
    }

    if (overlapIdx >= 0 && overlapIdx < newLines.length - 1) {
      // Append only the new lines
      const added = newLines.slice(overlapIdx + 1);
      term.write("\n" + added.join("\n"));
    } else if (overlapIdx === -1) {
      // Content completely changed — reset and rewrite
      term.reset();
      term.write(newLines.join("\n"));
    }
  }, [output]);

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {label && (
        <div className="border-b border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-1">
          <span className="text-[10px] font-medium text-[var(--text-muted)]">
            {label}
          </span>
        </div>
      )}
      <div ref={containerRef} className="flex-1 overflow-hidden" />
    </div>
  );
}
