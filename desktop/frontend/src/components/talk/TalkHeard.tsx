import { Mic, Pencil } from "lucide-react";
import { DICTATION_AVAILABLE } from "../../hooks/useVoiceDictation";
import { useTalkStore } from "../../store/talk";
import { TALK_QUIET_ACTION } from "./talkStyles";

// The sentence the plan is made from, as it was heard or typed. Edit takes it
// back to the field and Say again records a new one, either giving up a plan
// still on its way; once the plan runs it's only shown.
export function TalkHeard({ fixed }: { fixed: boolean }) {
  const text = useTalkStore((s) => s.text);
  const { askAgain, sayAgain } = useTalkStore.getState();
  return (
    <div className="flex items-start gap-1 rounded-lg bg-[var(--bg-primary)] py-1.5 pl-3 pr-1.5">
      <p className="min-w-0 flex-1 whitespace-pre-wrap break-words py-0.5 text-[13px] leading-5 text-[var(--text-primary)]">
        “{text}”
      </p>
      {!fixed && (
        <>
          <button type="button" onClick={askAgain} className={`${TALK_QUIET_ACTION} mt-0.5`}>
            <Pencil size={11} aria-hidden className="text-[var(--text-muted)]" />
            Edit
          </button>
          {DICTATION_AVAILABLE && (
            <button type="button" onClick={sayAgain} className={`${TALK_QUIET_ACTION} mt-0.5`}>
              <Mic size={11} aria-hidden className="text-[var(--text-muted)]" />
              Say again
            </button>
          )}
        </>
      )}
    </div>
  );
}
