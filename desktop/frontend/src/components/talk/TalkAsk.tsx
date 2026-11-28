import { useEffect, useRef, useState } from "react";
import { CornerDownLeft, Keyboard } from "lucide-react";
import { VoiceToTextAvailable } from "../../../bridge/commands";
import { DICTATION_DELIVERED } from "../../dictation/insert";
import { useDelayedFlag } from "../../hooks/useDelayedFlag";
import { useDictationHost } from "../../hooks/useDictationHost";
import { DICTATION_AVAILABLE, useVoiceDictation } from "../../hooks/useVoiceDictation";
import { isImeComposing } from "../../imeComposing";
import { ACTIVE_PHASES, useDictationStore } from "../../store/dictation";
import { useTalkStore } from "../../store/talk";
import { DictationStrip } from "../dictation/DictationStrip";
import { DictationTimer } from "../dictation/DictationTimer";
import { MicIcon } from "../icons";
import { BTN_PRIMARY, BTN_QUIET } from "../ui/buttons";
import { FLOATING_CARD } from "../ui/floatingCard";
import { Tooltip } from "../ui/Tooltip";
import { VoiceToTextInstallModal } from "../VoiceToTextInstallModal";
import { TalkCardHeader, type TalkTile } from "./TalkCardHeader";
import { TalkVoiceTrace } from "./TalkVoiceTrace";
import { TalkWaitFooter } from "./TalkWaitFooter";
import { TALK_QUIET_ACTION } from "./talkStyles";

const HINT = "Name the project, say if you want a copy, and what to do";
// A warm model is ready in milliseconds; only a longer wait says so.
const LOADING_REVEAL_MS = 300;

// Where the sentence comes in: spoken through VoiceToText where it is
// installed, typed everywhere. A take shows as its recording, not its words,
// and once transcribed it sends itself.
export function TalkAsk() {
  const text = useTalkStore((s) => s.text);
  const { setText, submit, close } = useTalkStore.getState();
  const { toggle, installOpen, setInstallOpen, startAfterInstall } = useVoiceDictation();
  const modelName = useDictationStore((s) => s.modelName);
  const progress = useDictationStore((s) => s.progress);
  const startedAt = useDictationStore((s) => s.startedAt);
  const boxRef = useRef<HTMLDivElement>(null);
  const fieldRef = useRef<HTMLTextAreaElement>(null);
  // Typing, or asking to, before the first take has started keeps it from starting.
  const autoStart = useRef(true);
  // The first take is on its way, so the card opens already listening.
  const [awaiting, setAwaiting] = useState(() => DICTATION_AVAILABLE && !useTalkStore.getState().text);
  const voice = useDictationHost(boxRef) ?? (awaiting ? "connecting" : null);
  const starting = voice === "connecting" || voice === "preparing";
  const loading = useDelayedFlag(starting, LOADING_REVEAL_MS);
  const recording = voice === "recording";
  const transcribing = voice === "transcribing";
  const spoken = starting || recording || transcribing;

  useEffect(() => {
    const field = fieldRef.current;
    if (!field) return;
    let live = true;
    const settle = () => {
      if (live) setAwaiting(false);
    };
    const onSaid = () => void submit(field.value);
    field.addEventListener(DICTATION_DELIVERED, onSaid);
    if (field.value) {
      field.setSelectionRange(field.value.length, field.value.length);
    } else if (DICTATION_AVAILABLE) {
      VoiceToTextAvailable().then((there) => {
        if (live && there && autoStart.current && useDictationStore.getState().phase === "idle") {
          void toggle(field).finally(settle);
        } else {
          settle();
        }
      }, settle);
    }
    return () => {
      live = false;
      field.removeEventListener(DICTATION_DELIVERED, onSaid);
      const dictation = useDictationStore.getState();
      if (dictation.target?.element === field && ACTIVE_PHASES.has(dictation.phase)) dictation.cancel();
    };
  }, [toggle, submit]);

  const typeInstead = () => {
    autoStart.current = false;
    setAwaiting(false);
    useDictationStore.getState().cancel();
    fieldRef.current?.focus();
  };

  const loadingLine =
    voice === "connecting" || !modelName
      ? "Starting VoiceToText…"
      : `Loading ${modelName}…${progress != null ? ` ${Math.round(progress * 100)}%` : ""}`;
  const [tile, title, subtitle]: [TalkTile, string, string] = transcribing
    ? ["working", "Transcribing", "Turning your recording into text"]
    : loading
      ? ["working", "Getting ready", loadingLine]
      : spoken
        ? ["listening", "Listening", HINT]
        : ["rest", "What should I do?", HINT];

  return (
    <section
      aria-labelledby="talk-ask-title"
      className={`${FLOATING_CARD} dictation-tone-app`}
      onKeyDown={(e) => {
        if (e.key !== "Escape" || e.defaultPrevented) return;
        e.preventDefault();
        close();
      }}
    >
      <TalkCardHeader id="talk-ask-title" tile={tile} title={title} subtitle={subtitle}>
        {spoken && !loading && <DictationTimer startedAt={startedAt} running={recording} />}
      </TalkCardHeader>
      <div
        ref={boxRef}
        data-dictation-scope
        data-dictation-host
        className="relative flex flex-col gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2"
      >
        <textarea
          ref={fieldRef}
          value={text}
          onChange={(e) => {
            autoStart.current = false;
            setAwaiting(false);
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
              if (recording) void toggle(fieldRef.current);
              else if (!spoken) void submit();
            }
          }}
          rows={2}
          autoFocus
          placeholder="Say or type what to do"
          aria-label="What to do"
          className={
            spoken
              ? "sr-only"
              : "min-w-0 resize-none bg-transparent text-[13px] leading-relaxed text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]"
          }
        />
        {spoken ? (
          <TalkVoiceTrace frozen={transcribing} busy={transcribing || loading} progress={transcribing ? null : progress} />
        ) : voice === "error" ? (
          <div className="flex min-h-7 items-center">
            <DictationStrip />
          </div>
        ) : (
          DICTATION_AVAILABLE && (
            <div className="flex min-h-7 items-center justify-end">
              <Tooltip content="Speak" delay={400}>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => void toggle(fieldRef.current)}
                  aria-label="Speak"
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
                >
                  <MicIcon />
                </button>
              </Tooltip>
            </div>
          )
        )}
      </div>
      {transcribing ? (
        <TalkWaitFooter onCancel={close} />
      ) : spoken ? (
        <div className="flex items-center gap-2">
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={typeInstead}
            className={`${TALK_QUIET_ACTION} mr-auto`}
          >
            <Keyboard size={13} aria-hidden className="text-[var(--text-muted)]" />
            Type instead
          </button>
          <button type="button" onClick={close} className={BTN_QUIET}>
            Cancel
          </button>
          <button
            type="button"
            disabled={!recording}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => void toggle(fieldRef.current)}
            className={`${BTN_PRIMARY} flex items-center gap-2`}
            title="Return"
          >
            Done
            <CornerDownLeft size={12} aria-hidden className="opacity-60" />
          </button>
        </div>
      ) : (
        <div className="flex items-center justify-end gap-2">
          <button type="button" onClick={close} className={BTN_QUIET}>
            Cancel
          </button>
          <button
            type="button"
            disabled={!text.trim()}
            onClick={() => void submit()}
            className={`${BTN_PRIMARY} flex items-center gap-2`}
            title="Return"
          >
            Make a plan
            <CornerDownLeft size={12} aria-hidden className="opacity-60" />
          </button>
        </div>
      )}
      <VoiceToTextInstallModal
        open={installOpen}
        onClose={() => setInstallOpen(false)}
        onInstalled={() => void startAfterInstall()}
      />
    </section>
  );
}
