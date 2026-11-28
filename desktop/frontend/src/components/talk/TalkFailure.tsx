import { AudioLines } from "lucide-react";
import { useTalkStore } from "../../store/talk";
import { BTN_QUIET, BTN_SECONDARY } from "../ui/buttons";
import { FLOATING_CARD, FLOATING_CARD_TILE } from "../ui/floatingCard";

// Why there is no plan, or why it didn't run, with the sentence kept for
// another go.
export function TalkFailure() {
  const failure = useTalkStore((s) => s.failure);
  const { askAgain, close } = useTalkStore.getState();

  if (!failure) return null;
  return (
    <section
      aria-labelledby="talk-failure-title"
      className={FLOATING_CARD}
      onKeyDown={(e) => {
        if (e.key !== "Escape") return;
        e.preventDefault();
        close();
      }}
    >
      <div className="flex items-start gap-2.5">
        <span className={FLOATING_CARD_TILE}>
          <AudioLines size={15} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 id="talk-failure-title" className="text-sm font-semibold text-[var(--text-primary)]">
            {failure.title}
          </h2>
          <p className="mt-0.5 whitespace-pre-wrap break-words text-xs leading-relaxed text-[var(--text-secondary)]">
            {failure.message}
          </p>
        </div>
      </div>
      <div className="flex items-center justify-end gap-2">
        <button type="button" onClick={close} className={BTN_QUIET}>
          Cancel
        </button>
        <button type="button" autoFocus onClick={askAgain} className={BTN_SECONDARY}>
          Try again
        </button>
      </div>
    </section>
  );
}
