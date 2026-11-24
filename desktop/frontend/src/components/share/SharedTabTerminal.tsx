import { useEffect, useImperativeHandle, useMemo, useRef, type ReactNode, type Ref } from "react";
import { Terminal, type ITheme } from "@xterm/xterm";
import { Unicode11Addon } from "@xterm/addon-unicode11";
import "@xterm/xterm/css/xterm.css";
import { EventsOn, EventsOnReady } from "../../../bridge/runtime";
import { PeerTermAttach, PeerTermDetach } from "../../../bridge/commands";
import { sendTerminalInput } from "../../terminal-io";
import { getTerminalTheme } from "../terminal-utils";
import { useTerminalFont } from "../../hooks/useTerminalFont";
import { useTerminalFontSize } from "../../hooks/useTerminalFontSize";
import { useTerminalTheme } from "../../hooks/useTerminalTheme";
import { getTerminalThemeColors, terminalXtermTheme } from "../../terminal-themes";
import { nextFontSize, type FitState } from "../../share/fitFont";
import { deliverInput, type DeliveryTarget } from "../terminal/deliverInput";
import { bufferToPlainText } from "../terminal/consoleActions";
import { screenDialog } from "../terminal/screenDialog";

export interface SharedTabTerminalHandle {
  // The composer's send: false when it can't be delivered (typing is off, the
  // tab ended, or a send is still going), so the draft is kept.
  submitInput: (input: string | string[]) => boolean;
  focus: () => void;
  asks: () => boolean;
  // Everything the terminal holds, scrollback included, as plain text.
  text: () => string;
}

// A tab someone shared with this machine. It always renders at the host's
// columns and rows (the host's own view keeps its size), fitting its space by
// font size, and sends keys only while the host lets this machine type. Laid
// out as the host's pane is: the terminal as tall as its rows, `footer` (the
// prompt box) right under it, and whatever height is left over below both.
export function SharedTabTerminal({
  terminalId,
  canType,
  cols,
  rows,
  footer,
  ref,
}: {
  terminalId: string;
  canType: boolean;
  cols: number | null;
  rows: number | null;
  footer?: ReactNode;
  ref?: Ref<SharedTabTerminalHandle>;
}) {
  const outerRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const footerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const deliveryRef = useRef<DeliveryTarget | null>(null);
  const fitRef = useRef<() => void>(() => {});
  const canTypeRef = useRef(canType);
  const { fontSize } = useTerminalFontSize();
  const { fontFamily, lineHeight } = useTerminalFont();
  const preferredRef = useRef(fontSize);
  const initialSize = useRef({ cols: cols ?? 80, rows: rows ?? 24 });
  const { theme: terminalTheme } = useTerminalTheme();
  const colors = useMemo(() => getTerminalThemeColors(terminalTheme), [terminalTheme]);
  // The user's own terminal theme, as their tabs have it; without one, the app's.
  const themeOf = useRef<() => ITheme>(getTerminalTheme);
  themeOf.current = () => (colors ? terminalXtermTheme(colors) : getTerminalTheme());

  useEffect(() => {
    const host = hostRef.current;
    const outer = outerRef.current;
    if (!host || !outer) return;
    const term = new Terminal({
      cols: initialSize.current.cols,
      rows: initialSize.current.rows,
      fontSize: preferredRef.current,
      fontFamily,
      lineHeight,
      cursorBlink: false,
      disableStdin: !canTypeRef.current,
      scrollback: 5000,
      theme: themeOf.current(),
      allowProposedApi: true,
    });
    try {
      term.loadAddon(new Unicode11Addon());
      term.unicode.activeVersion = "11";
    } catch {}
    term.open(host);
    termRef.current = term;
    const delivery: DeliveryTarget = { term, sessionDead: false, lastOutputAt: 0, delivering: false };
    deliveryRef.current = delivery;

    const state: FitState = { overflowsAt: Infinity };
    let frame = 0;
    const fit = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const screen = term.element?.querySelector<HTMLElement>(".xterm-screen");
        if (!screen || !host.offsetWidth || !screen.offsetHeight) return;
        const footerHeight = footerRef.current?.offsetHeight ?? 0;
        const ratio = Math.min(
          outer.clientWidth / host.offsetWidth,
          (outer.clientHeight - footerHeight) / screen.offsetHeight,
        );
        const current = term.options.fontSize ?? preferredRef.current;
        const next = nextFontSize(current, preferredRef.current, ratio, state);
        if (next !== current) {
          term.options.fontSize = next;
          fit();
        }
      });
    };
    const refit = () => {
      state.overflowsAt = Infinity;
      fit();
    };
    fitRef.current = refit;

    let disposed = false;
    let offOutput: (() => void) | null = null;
    // Listening before subscribing: the subscribe's replay is the screen.
    void EventsOnReady("pty-output-" + terminalId, (d: string) => {
      delivery.lastOutputAt = performance.now();
      term.write(d);
    }).then((off) => {
      if (disposed) return off();
      offOutput = off;
      void PeerTermAttach(terminalId, false);
    });
    const offSize = EventsOn("pty-size-" + terminalId, (s: { cols?: number; rows?: number }) => {
      if (!s?.cols || !s?.rows) return;
      if (s.cols === term.cols && s.rows === term.rows) return;
      term.resize(s.cols, s.rows);
      refit();
    });
    const offExit = EventsOn("pty-exit-" + terminalId, () => {
      delivery.sessionDead = true;
      term.write("\r\n\x1b[90m[This tab's session ended]\x1b[0m\r\n");
    });
    const input = (d: string) => {
      if (canTypeRef.current) sendTerminalInput(terminalId, d).catch(() => {});
    };
    const onData = term.onData(input);
    const onBinary = term.onBinary(input);

    const resize = new ResizeObserver(refit);
    resize.observe(outer);
    if (footerRef.current) resize.observe(footerRef.current);
    const themeWatch = new MutationObserver(() => {
      term.options.theme = themeOf.current();
    });
    themeWatch.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    refit();

    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      offOutput?.();
      offSize();
      offExit();
      onData.dispose();
      onBinary.dispose();
      resize.disconnect();
      themeWatch.disconnect();
      void PeerTermDetach(terminalId);
      term.dispose();
      termRef.current = null;
      deliveryRef.current = null;
    };
    // The emulator lives as long as the stream it shows; settings apply below.
  }, [terminalId]);

  useImperativeHandle(
    ref,
    () => ({
      submitInput: (input) => {
        const delivery = deliveryRef.current;
        return canTypeRef.current && delivery ? deliverInput(delivery, terminalId, input) : false;
      },
      focus: () => termRef.current?.focus(),
      asks: () => !!termRef.current && !!screenDialog(termRef.current),
      text: () => (termRef.current ? bufferToPlainText(termRef.current) : ""),
    }),
    [terminalId],
  );

  useEffect(() => {
    canTypeRef.current = canType;
    const term = termRef.current;
    if (!term) return;
    term.options.disableStdin = !canType;
  }, [canType]);

  useEffect(() => {
    if (termRef.current) termRef.current.options.theme = themeOf.current();
  }, [colors]);

  useEffect(() => {
    preferredRef.current = fontSize;
    const term = termRef.current;
    if (!term) return;
    term.options.fontFamily = fontFamily;
    term.options.lineHeight = lineHeight;
    term.options.fontSize = fontSize;
    fitRef.current();
  }, [fontSize, fontFamily, lineHeight]);

  return (
    <div ref={outerRef} className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="terminal-surface shrink-0 overflow-hidden bg-[var(--terminal-bg)]">
        <div ref={hostRef} className="w-fit" />
      </div>
      <div ref={footerRef} className="shrink-0">
        {footer}
      </div>
    </div>
  );
}
