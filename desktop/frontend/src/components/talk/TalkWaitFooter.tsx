import { BTN_QUIET } from "../ui/buttons";
import { TALK_KEYCAP } from "./talkStyles";

export function TalkWaitFooter({ onCancel }: { onCancel: () => void }) {
  return (
    <div className="flex items-center gap-2">
      <span className="min-w-0 flex-1 text-[11px] text-[var(--text-muted)]">Nothing runs until you approve</span>
      <button type="button" onClick={onCancel} className={`${BTN_QUIET} flex items-center gap-2`}>
        Cancel
        <kbd className={TALK_KEYCAP}>esc</kbd>
      </button>
    </div>
  );
}
