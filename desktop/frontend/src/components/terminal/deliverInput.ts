// Delivers a composed prompt into an interactive terminal: InteractivePane's
// sessions, and a tab someone shared with this machine (SharedTabTerminal),
// which mirrors the host's screen in an emulator of its own.
import type { Terminal } from "@xterm/xterm";
import { sendTerminalInput } from "../../terminal-io";
import { parseAgentDialog } from "../../agentDialog";
import { toast } from "../../notifications/toast";
import { bufferLines } from "./consoleActions";
import { unquotePastedPath } from "../../composerValue";
import {
  PASTE_QUIET_MS,
  PASTE_CEILING_MS,
  QUIET_POLL_MS,
  PASTE_IMAGE_CEILING_MS,
  CR_VERIFY_GRACE_MS,
  CR_MAX_RETRIES,
  canGlueCr,
  canSkipQuietGate,
  crWasSwallowed,
} from "./submitGate";

export const IMAGE_EXT_RE = /\.(png|jpe?g|gif|webp|bmp|tiff?|heic|heif)$/i;

// Permissive match so a label change ("[Image #1]" → "[Image:" …) still counts.
function countImageMarkers(text: string): number {
  return (text.match(/\[image/gi) ?? []).length;
}

// A permission prompt or approval with no text box takes Enter as its
// highlighted answer, so a message sent now would approve it and be lost.
function awaitsChoice(term: Terminal): boolean {
  const top = term.buffer.active.baseY;
  const dialog = parseAgentDialog(bufferLines(term, top, top + term.rows), term.cols);
  return !!dialog && !dialog.options.some((option) => option.typed);
}

// What a delivery reads and marks: the emulator showing the receiver (its
// bracketed-paste mode and visible lines), when it last drew, whether it is
// gone, and whether a delivery is already running.
export interface DeliveryTarget {
  term: Terminal;
  sessionDead: boolean;
  lastOutputAt: number;
  delivering: boolean;
  handleWriteError?: () => void;
}

// Send composed text to the PTY. A multi-line body is wrapped in bracketed-
// paste markers (when the program enabled them) so its newlines are pasted
// content, not executed; the trailing CR submits.
//
// With bracketed paste OFF (plain shell) a single-line body goes in one write
// (body+CR): there's no paste mode to fold the CR into. With bracketed paste ON
// (an interactive TUI like Claude Code) the CR must be its own pty write — a CR
// glued to the paste's closing marker is read as pasted content, so the text
// appears in the input but never submits — so every such body goes through the
// gated delivery: the CR is a separate write, verified, and re-sent if it drew
// no redraw. A short/uncollapsible body skips only the pre-write quiet gate (it
// won't collapse into a "[Pasted text]" placeholder); a longer body, a
// multi-line body, or an array still gates each part on the receiver going
// quiet, which also preserves multi-part image order.
export function deliverInput(session: DeliveryTarget, terminalId: string, input: string | string[]): boolean {
  if (session.sessionDead) return false;
  if (awaitsChoice(session.term)) {
    toast.error("Answer the agent first", {
      description:
        "It is waiting for a choice in the terminal, and Enter would pick the highlighted one. Your message is still here.",
    });
    return false;
  }
  // Mirror xterm's bracketTextForPaste: neutralize ESC in the body so the
  // composed text can't smuggle a \x1b[201~ to break out of the paste.
  const wrap = (s: string) => {
    const body = s.replace(/\r?\n/g, "\r");
    return session.term.modes.bracketedPasteMode
      ? `\x1b[200~${body.replace(/\x1b/g, "␛")}\x1b[201~`
      : body;
  };
  const fail = () => session.handleWriteError?.();
  // lpm clears the composer once this returns true, so a re-entrant submit
  // would interleave its writes into an in-flight one; refuse it (the draft is
  // kept). The glued body+CR path honors this too though it never sets the flag
  // — it must not splice a body+CR into a running multi-part delivery.
  if (session.delivering) return false;

  const bracketed = session.term.modes.bracketedPasteMode;

  // Plain shell (no bracketed paste): a single-line body+CR ships in one
  // zero-latency write, since there's no paste mode to fold the CR into.
  if (typeof input === "string" && canGlueCr(input, bracketed)) {
    sendTerminalInput(terminalId, `${wrap(input)}\r`).catch(fail);
    return true;
  }

  const parts = (Array.isArray(input) ? input : [input]).filter((p) => p.length > 0);
  if (parts.length === 0) return false;
  session.delivering = true;

  // Resolves true if `ready` became true, false if it hit the ceiling first.
  const waitUntil = (ready: () => boolean, ceiling: number, sentAt: number) =>
    new Promise<boolean>((resolve) => {
      const check = () => {
        if (ready()) resolve(true);
        else if (performance.now() - sentAt >= ceiling) resolve(false);
        else setTimeout(check, QUIET_POLL_MS);
      };
      setTimeout(check, QUIET_POLL_MS);
    });
  const settled = () => performance.now() - session.lastOutputAt >= PASTE_QUIET_MS;
  // Wait for `gate`; if the ceiling fires without it settling — the receiver is
  // still redrawing (e.g. an animating spinner keeps output fresh so quiet never
  // arrives) — grant one more bounded quiet window rather than writing
  // mid-redraw. If it still never settles, proceed anyway (never hang forever).
  const waitGated = async (gate: () => boolean, ceiling: number, sentAt: number) => {
    if (await waitUntil(gate, ceiling, sentAt)) return;
    await waitUntil(gate, ceiling, performance.now());
  };

  // baseY..length is the viewport; the count climbs once Claude Code lifts a
  // pasted path into an image placeholder.
  const visibleImageMarks = () => {
    const buf = session.term.buffer.active;
    let marks = 0;
    for (let i = buf.baseY; i < buf.length; i++) {
      marks += countImageMarkers(buf.getLine(i)?.translateToString(true) ?? "");
    }
    return marks;
  };

  // Submit, then verify. A real submit redraws immediately, so if no output at
  // all follows the CR within the grace window it was swallowed mid-collapse:
  // wait for quiet again (bounded) and re-send, up to CR_MAX_RETRIES. When
  // output DID follow, never retry — the message likely landed and a stray
  // extra Enter (e.g. into a permission dialog) would be harmful.
  const submitCr = async () => {
    for (let attempt = 0; ; attempt++) {
      if (session.sessionDead) return;
      await sendTerminalInput(terminalId, "\r");
      const crSentAt = performance.now();
      await waitUntil(() => session.lastOutputAt >= crSentAt, CR_VERIFY_GRACE_MS, crSentAt);
      if (!crWasSwallowed(session.lastOutputAt, crSentAt)) return;
      if (attempt >= CR_MAX_RETRIES) return;
      await waitGated(settled, PASTE_CEILING_MS, performance.now());
    }
  };

  // A lone short/uncollapsible body needs no pre-write quiet gate — it never
  // lifts into a "[Pasted text]" placeholder, so nothing is mid-collapse when
  // we write it — but its CR must still be a separate verified write, so it
  // rides the same delivery as one ungated part. A longer/multi-part body keeps
  // the per-part gate. (canGlueCr already peeled off the plain-shell case.)
  const skipPartGate = parts.length === 1 && canSkipQuietGate(parts[0], bracketed);
  const deliver = async () => {
    for (const part of parts) {
      if (session.sessionDead) return;
      // An image path resolves async and silently, so gate it on its placeholder
      // appearing rather than on quiet, else the next part overtakes its cursor
      // slot. sentAt is sampled after the write so in-flight output can't satisfy
      // the gate early.
      const isImage =
        bracketed && !/[\r\n]/.test(part) && IMAGE_EXT_RE.test(unquotePastedPath(part));
      const before = isImage ? visibleImageMarks() : 0;
      await sendTerminalInput(terminalId, wrap(part));
      const sentAt = performance.now();
      if (isImage) await waitUntil(() => visibleImageMarks() > before && settled(), PASTE_IMAGE_CEILING_MS, sentAt);
      else if (!skipPartGate) await waitGated(() => session.lastOutputAt >= sentAt && settled(), PASTE_CEILING_MS, sentAt);
    }
    await submitCr();
  };
  deliver()
    .catch(fail)
    .finally(() => {
      session.delivering = false;
    });
  return true;
}
