import { useEffect, useRef, useState } from "react";
import { AudioLines, ImageIcon, KeyRound } from "lucide-react";
import { BrowserOpenURL } from "../../bridge/runtime";
import { GET_KEY_URL, type GenerateDecision, type GenerateRequest } from "../generate";
import { isMac } from "../platform";
import { BTN_PRIMARY, BTN_QUIET, BTN_SECONDARY } from "./ui/buttons";

const CHIP = "rounded-full border border-[var(--border)] px-2 py-0.5 text-[11px] text-[var(--text-secondary)]";
const ALLOW_KEYS = isMac ? "⌘↩" : "Ctrl+Enter";

function anOrA(word: string): string {
  return /^[aeiou]/i.test(word) ? "an" : "a";
}

// One `lpm generate` request: what it will make, from which prompt, for how
// much, and where it goes. The prompt can be fixed before anything is spent,
// and a missing key is typed in right here.
export function GenerateRequestCard({
  request,
  waiting,
  onAnswer,
}: {
  request: GenerateRequest;
  waiting: number;
  onAnswer: (decision: GenerateDecision, prompt?: string, key?: string) => Promise<void>;
}) {
  const [prompt, setPrompt] = useState(request.prompt);
  const [editing, setEditing] = useState(false);
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const keyRef = useRef<HTMLInputElement>(null);
  const speech = request.kind === "speech";
  const who = request.agent || "An agent";
  const needsKey = request.needsKey !== null;
  const allowAsProject = request.projectGrant && !needsKey;

  useEffect(() => {
    if (needsKey) keyRef.current?.focus();
  }, [needsKey]);

  const send = async (decision: GenerateDecision) => {
    if (busy) return;
    if (decision !== "deny" && needsKey && !key.trim()) {
      keyRef.current?.focus();
      return;
    }
    setBusy(true);
    await onAnswer(decision, prompt, needsKey ? key.trim() : undefined);
    setBusy(false);
  };
  const primary: GenerateDecision = allowAsProject ? "project" : "once";

  return (
    <section
      aria-labelledby="generate-request-title"
      className="pointer-events-auto flex w-full max-w-[600px] flex-col gap-3 rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-4 shadow-2xl"
      onKeyDown={(e) => {
        if (e.key === "Enter" && (isMac ? e.metaKey : e.ctrlKey)) {
          e.preventDefault();
          void send(primary);
        }
      }}
    >
      <div className="flex items-center gap-2.5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--bg-active)] text-[var(--text-primary)]">
          {needsKey ? <KeyRound size={15} /> : speech ? <AudioLines size={15} /> : <ImageIcon size={15} />}
        </span>
        <div className="min-w-0 flex-1">
          <h2 id="generate-request-title" className="text-sm font-semibold text-[var(--text-primary)]">
            {needsKey
              ? `Add ${anOrA(request.keyLabel)} ${request.keyLabel} key to make this ${speech ? "audio" : "image"}`
              : `${who} wants to make ${speech ? "audio" : "an image"}`}
          </h2>
          <p className="truncate text-[11px] text-[var(--text-muted)]">
            {needsKey
              ? `${who} is waiting. The key stays on this computer, and ${who === "An agent" ? "the agent" : who} only gets the file back.`
              : [request.project, waiting > 0 ? `${waiting} more waiting` : ""].filter(Boolean).join(" · ")}
          </p>
        </div>
      </div>

      {needsKey && (
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={keyRef}
            type="password"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="Paste key"
            aria-label={`${request.keyLabel} API key`}
            autoComplete="off"
            spellCheck={false}
            className="min-w-0 flex-[1_1_240px] rounded-md border border-[var(--border)] bg-[var(--bg-primary)] px-2.5 py-1.5 text-sm text-[var(--text-primary)]"
          />
          <button
            type="button"
            onClick={() => request.needsKey && BrowserOpenURL(GET_KEY_URL[request.needsKey])}
            className="text-[11px] text-[var(--text-secondary)] underline underline-offset-2 hover:text-[var(--text-primary)]"
          >
            Get a key
          </button>
        </div>
      )}

      <div className="flex items-start gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2">
        {editing ? (
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={3}
            autoFocus
            aria-label={speech ? "Text to speak" : "Prompt"}
            className="min-w-0 flex-1 resize-y bg-transparent text-[13px] leading-relaxed text-[var(--text-primary)] outline-none"
          />
        ) : (
          <p className="max-h-28 min-w-0 flex-1 overflow-y-auto whitespace-pre-wrap text-[13px] leading-relaxed text-[var(--text-primary)]">
            {prompt}
          </p>
        )}
        <button
          type="button"
          onClick={() => setEditing((on) => !on)}
          className="shrink-0 text-xs text-[var(--text-secondary)] underline underline-offset-2 hover:text-[var(--text-primary)]"
        >
          {editing ? "Done" : "Edit"}
        </button>
      </div>

      <div className="flex flex-wrap gap-1.5">
        <span className={CHIP}>{`${request.model} · ${request.provider}`}</span>
        {request.details.map((d) => (
          <span key={d} className={CHIP}>
            {d}
          </span>
        ))}
        <span className={CHIP}>{request.cost}</span>
        <span className={`${CHIP} font-mono`}>{request.out}</span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`min-w-0 flex-[1_1_200px] text-[11px] ${
            request.overLimit ? "text-[var(--accent-amber-text)]" : "text-[var(--text-muted)]"
          }`}
        >
          {request.overLimit ? `This goes past today's limit. ${request.today}` : request.today}
        </span>
        <button type="button" disabled={busy} onClick={() => void send("deny")} className={BTN_QUIET}>
          {needsKey ? "Cancel" : "Deny"}
        </button>
        {allowAsProject && (
          <button type="button" disabled={busy} onClick={() => void send("once")} className={BTN_SECONDARY}>
            Just this once
          </button>
        )}
        <button
          type="button"
          disabled={busy}
          onClick={() => void send(primary)}
          className={`${BTN_PRIMARY} flex items-center gap-2`}
          title={ALLOW_KEYS}
        >
          {needsKey ? "Save and continue" : allowAsProject ? `Allow in ${request.project}` : "Allow"}
          <kbd className="font-sans text-[11px] opacity-60">{ALLOW_KEYS}</kbd>
        </button>
      </div>
    </section>
  );
}
