import { useTalkStore } from "../../store/talk";
import { TalkAsk } from "./TalkAsk";
import { TalkFailure } from "./TalkFailure";
import { TalkPlanCard } from "./TalkPlanCard";
import { TalkPlanning } from "./TalkPlanning";

// The Talk button's panel: the card for wherever the sentence has got to.
export function TalkHost() {
  const phase = useTalkStore((s) => s.phase);
  if (phase === "closed") return null;
  if (phase === "ask") return <TalkAsk />;
  if (phase === "planning") return <TalkPlanning />;
  return phase === "failed" ? <TalkFailure /> : <TalkPlanCard />;
}
