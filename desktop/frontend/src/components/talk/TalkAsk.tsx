import { useEffect, useRef } from "react";
import { AudioLines, CornerDownLeft, Loader2 } from "lucide-react";
import { VoiceToTextAvailable } from "../../../bridge/commands";
import { DICTATION_DELIVERED } from "../../dictation/insert";
import { useDictationHost } from "../../hooks/useDictationHost";
import { DICTATION_AVAILABLE, useVoiceDictation } from "../../hooks/useVoiceDictation";
import { isImeComposing } from "../../imeComposing";
import { ACTIVE_PHASES, useDictationStore } from "../../store/dictation";
import { useTalkStore } from "../../store/talk";
import { DictationStrip } from "../dictation/DictationStrip";
import { MicIcon, StopIcon } from "../icons";
import { BTN_PRIMARY, BTN_QUIET } from "../ui/buttons";
import { FLOATING_CARD, FLOATING_CARD_TILE } from "../ui/floatingCard";
import { Tooltip } from "../ui/Tooltip";
import { VoiceToTextInstallModal } from "../VoiceToTextInstallModal";

// Where the sentence comes in: spoken through VoiceToText where it is
// installed, typed everywhere. A take that ends with words sends itself.
export function TalkAsk() {
  const phase = useTalkStore((s) => s.phase);
  const text = useTalkStore((s) => s.text);
  const { setText, submit, close } = useTalkStore.getState();
  const { toggle, installOpen, setInstallOpen, startAfterInstall } = useVoiceDictation();
  const boxRef = useRef<HTMLDivElement>(null);
  const fieldRef = useRef<HTMLTextAreaElement>(null);
  const voice = useDictationHost(boxRef);
  const planning = phase === "planning";

  useEffect(() => {
    const field = fieldRef.current;
    if (!field) return;
    let live = true;
    const onSaid = () => void submit(field.value);
    field.addEventListener(DICTATION_DELIVERED, onSaid);
    if (DICTATION_AVAILABLE && !field.value) {
      VoiceToTextAvailable().then(
        (there) => {
          if (live && there && useDictationStore.getState().phase === "idle") void toggle(field);
        },
        () => {},
      );
    }
    return () => {
      live = false;
      field.removeEventListener(DICTATION_DELIVERED, onSaid);
      const dictation = useDictationStore.getState();
      if (dictation.target?.element === field && ACTIVE_PHASES.has(dictation.phase)) dictation.cancel();
    };
  }, [toggle, submit]);

  const recording = voice === "recording";
  const micLabel = recording ? "Stop and make a plan" : "Speak";

  return (
    <section aria-labelledby="talk-ask-title" className={FLOATING_CARD}>
      <div className="flex items-center gap-2.5">
        <span className={FLOATING_CARD_TILE}>
          <AudioLines size={15} />
        </span>
        <h2 id="talk-ask-title" className="min-w-0 flex-1 text-sm font-semibold text-[var(--text-primary)]">
          {planning ? "Making the plan…" : "What should I do?"}
        </h2>
        {planning && <Loader2 size={14} className="animate-spin text-[var(--text-muted)]" />}
      </div>
      <div
        ref={boxRef}
        data-dictation-scope
        className="flex flex-col gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2"
      >
        <textarea
          ref={fieldRef}
          value={text}
          onChange={(e) => {
            const dictation = useDictationStore.getState();
            if (dictation.target?.element === e.target && ACTIVE_PHASES.has(dictation.phase)) dictation.cancel();
            setText(e.target.value);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              close();
            } else if (e.key === "Enter" && !e.shiftKey && !isImeComposing(e)) {
              e.preventDefault();
              void submit();
            }
          }}
          rows={2}
          autoFocus
          readOnly={planning}
          placeholder="Say or type what to do"
          aria-label="What to do"
          className="min-w-0 resize-none bg-transparent text-[13px] leading-relaxed text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]"
        />
        <div data-dictation-host className="flex min-h-7 items-center gap-2">
          {voice !== null ? (
            <div className="dictation-tone-composer flex min-w-0 flex-1">
              <DictationStrip />
            </div>
          ) : (
            <span className="min-w-0 flex-1 truncate text-[11px] text-[var(--text-muted)]">
              Name the project, say if you want a copy, and what to do
            </span>
          )}
          {DICTATION_AVAILABLE && !planning && voice !== "error" && (
            <Tooltip content={micLabel} delay={400}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => void toggle(fieldRef.current)}
                disabled={voice === "transcribing"}
                aria-label={micLabel}
                aria-pressed={recording}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] disabled:opacity-40"
              >
                {recording ? <StopIcon /> : <MicIcon />}
              </button>
            </Tooltip>
          )}
        </div>
      </div>
      <div className="flex items-center justify-end gap-2">
        <button type="button" onClick={close} className={BTN_QUIET}>
          Cancel
        </button>
        <button
          type="button"
          disabled={planning || !text.trim()}
          onClick={() => void submit()}
          className={`${BTN_PRIMARY} flex items-center gap-2`}
          title="Return"
        >
          Make a plan
          <CornerDownLeft size={12} aria-hidden className="opacity-60" />
        </button>
      </div>
      <VoiceToTextInstallModal
        open={installOpen}
        onClose={() => setInstallOpen(false)}
        onInstalled={() => void startAfterInstall()}
      />
    </section>
  );
}
