import { LessonSection } from "@/components/lesson-section";

const STEPS = [
  {
    title: "Add an account and sign in once",
    body: "Settings, AI & Integrations, Claude accounts. Click Add account, name it, then Add and sign in, and finish Claude's own login in the browser.",
  },
  {
    title: "Give a project its own account",
    body: "Open the ⋮ menu on a project in the sidebar, then Claude account, and pick one under Always use one account. Each account shows its 5-hour and weekly usage beside its name.",
  },
  {
    title: "Let new sessions switch",
    body: "Turn on Switch accounts automatically and confirm each account is yours. New sessions start on the first account that isn't close to a limit, and running sessions stay where they are.",
  },
];

export default function Lesson() {
  return (
    <LessonSection
      lesson="accounts-switching"
      title="Two subscriptions, one Mac, no logging out"
      description="A lesson from the lpm series: add a second Claude Code account, give a project its own, and let new sessions move to the account with room when the main login is almost out."
      steps={STEPS}
    />
  );
}
