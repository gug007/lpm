import { LessonSection } from "@/components/lesson-section";

const STEPS = [
  {
    title: "See which account a tab runs on",
    body: "Hover a Claude tab. With more than one Claude account, its card shows the account that conversation uses.",
  },
  {
    title: "Right-click the tab, then Claude account",
    body: "Each account shows its 5-hour and weekly usage beside its name. Pick one with room left.",
  },
  {
    title: "Keep going on the new account",
    body: "If Claude is still working, lpm interrupts the turn and carries it on there. Same tab, same conversation.",
  },
];

export default function SwitchTabLesson() {
  return (
    <LessonSection
      id="watch-switch-tab"
      lesson="switch-claude-account-mid-session"
      title="Move a running conversation to another account"
      description="When the account a tab runs on is almost out in the middle of a task, move just that tab to another of your accounts. This lesson switches a Claude tab while Claude is still working, and the conversation keeps going."
      steps={STEPS}
    />
  );
}
