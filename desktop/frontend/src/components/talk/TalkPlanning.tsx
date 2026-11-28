import { useEffect, useRef } from "react";
import { useTalkStore } from "../../store/talk";
import { FLOATING_CARD } from "../ui/floatingCard";
import { TalkCardHeader } from "./TalkCardHeader";
import { TalkHeard } from "./TalkHeard";
import { TalkPlanSkeleton } from "./TalkPlanSkeleton";
import { TalkWaitFooter } from "./TalkWaitFooter";

// While the plan is made: the sentence, open to a fix, over the plan's rows
// waiting where they will fill in.
export function TalkPlanning() {
  const close = useTalkStore((s) => s.close);
  const cardRef = useRef<HTMLElement>(null);

  // The field that held focus has just gone; Escape needs somewhere to land.
  useEffect(() => {
    cardRef.current?.focus();
  }, []);

  return (
    <section
      ref={cardRef}
      tabIndex={-1}
      aria-labelledby="talk-planning-title"
      aria-busy
      className={`${FLOATING_CARD} outline-none`}
      onKeyDown={(e) => {
        if (e.key !== "Escape") return;
        e.preventDefault();
        close();
      }}
    >
      <TalkCardHeader
        id="talk-planning-title"
        tile="working"
        title="Making the plan"
        subtitle="Matching your words to a project, an agent and a prompt"
      />
      <TalkHeard fixed={false} />
      <TalkPlanSkeleton />
      <TalkWaitFooter onCancel={close} />
    </section>
  );
}
