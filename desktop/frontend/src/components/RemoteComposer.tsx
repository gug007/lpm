import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { PeerSend } from "../../bridge/commands";
import { peerRequest } from "../store/peerRequest";
import { bracketedPaste } from "../remoteInput";
import type { RemoteTerminal } from "../store/peers";
import { SendIcon } from "./icons";

// A pared-down composer for a remote terminal — visual match for the local
// TerminalComposer's submit affordance, without its local-only features (slash,
// mentions, upload, AI transform, voice are intentionally omitted for the remote
// surface). Submitting auto-claims the terminal (so this Mac becomes the live
// owner, consistent with run-action) and sends the text as a bracketed paste
// followed by a separate carriage return, mirroring the local robust send path.
export function RemoteComposer({
  peerId,
  project,
  terminal,
}: {
  peerId: string;
  project: string;
  terminal: RemoteTerminal;
}) {
  const [text, setText] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const [histIdx, setHistIdx] = useState(-1);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const cli = terminal.cli || "";

  useEffect(() => {
    let cancelled = false;
    peerRequest(
      peerId,
      { t: "history", project, q: "" },
      (f) => f.t === "history" && f.project === project,
      8000,
    )
      .then((r) => {
        if (cancelled) return;
        const rows = (r.rows as { text?: string }[]) ?? [];
        setHistory(rows.map((x) => x.text ?? "").filter(Boolean));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [peerId, project]);

  const submit = async () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const body = text;
    setText("");
    setHistIdx(-1);
    try {
      // Sequential awaits keep the outbound order: the paste must reach the PTY
      // before the CR (a CR glued to or preceding the paste never submits).
      await PeerSend(peerId, { t: "claim", id: terminal.id });
      await PeerSend(peerId, { t: "in", id: terminal.id, d: bracketedPaste(body) });
      await PeerSend(peerId, { t: "in", id: terminal.id, d: "\r" });
      await PeerSend(peerId, { t: "historyAdd", project, id: terminal.id, label: terminal.label, text: trimmed });
    } catch {
      setText(body);
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
      return;
    }
    // Up/down recalls recent prompts when the caret is at the very start.
    if (e.key === "ArrowUp" && taRef.current?.selectionStart === 0 && history.length > 0) {
      e.preventDefault();
      const i = Math.min(histIdx + 1, history.length - 1);
      setHistIdx(i);
      setText(history[i] ?? "");
    } else if (e.key === "ArrowDown" && histIdx >= 0) {
      e.preventDefault();
      const i = histIdx - 1;
      setHistIdx(i);
      setText(i < 0 ? "" : history[i]);
    }
  };

  return (
    <div className="flex items-end gap-2 border-t border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-2">
      <textarea
        ref={taRef}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKeyDown}
        rows={1}
        placeholder={cli ? `Send to ${cli}…` : "Send to terminal…"}
        spellCheck={false}
        className="max-h-40 min-h-[2.25rem] min-w-0 flex-1 resize-none rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--accent-cyan)]"
      />
      <button
        onClick={submit}
        disabled={text.trim() === ""}
        aria-label="Send"
        className="flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-[var(--text-primary)] px-3 text-sm font-medium text-[var(--bg-primary)] transition-opacity hover:opacity-85 disabled:opacity-40"
      >
        <SendIcon />
      </button>
    </div>
  );
}
