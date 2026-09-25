import { LessonSection } from "@/components/lesson-section";

const STEPS = [
  {
    title: "Add an account and sign in once",
    body: "Settings, AI & Integrations, Multiple Claude accounts. Name it Work, click Sign in, and finish Claude's own login in the browser.",
  },
  {
    title: "Pick it from the project's menu",
    body: "Open the ⋮ menu on a project in the sidebar and choose the account under Claude account. New Claude sessions in that project run on it, while your other projects keep theirs at the same time.",
  },
  {
    title: "Switch when one runs low",
    body: "The same menu shows every account's 5-hour and weekly usage and when each resets, so moving a project to the account with room is one click.",
  },
];

export default function Lesson() {
  return (
    <LessonSection
      lesson="multiple-accounts"
      title="Two subscriptions, one Mac, no logging out"
      description="A short lesson from the lpm series: add a second Claude Code account, give a project its own, and switch when the main login is almost out."
      steps={STEPS}
    />
  );
}
