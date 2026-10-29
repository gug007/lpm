import { LessonSection } from "@/components/lesson-section";

const STEPS = [
  {
    title: "Turn on auto pull from Pull",
    body: "When a project's branch on origin moves on, its sidebar row shows ↓3. Rest on Pull and turn auto pull on for that project or for all of them.",
  },
  {
    title: "Let new commits come in by themselves",
    body: "lpm fast-forwards a project only when its branch has no uncommitted changes and nothing to push, and waits while an agent is working. Every pull comes with Undo.",
  },
  {
    title: "Choose which projects pull",
    body: "Set Off, Chosen or All in Settings › Git › Auto pull, or turn it off for one project or duplicate from its Git menu.",
  },
];

export default function Lesson() {
  return (
    <LessonSection
      lesson="auto-pull-complete-guide"
      title="Keep every project up to date with auto pull"
      description="A lesson from the lpm series: turn auto pull on, watch a teammate's commit come in by itself, undo a pull, and see when it waits instead of touching your work."
      steps={STEPS}
    />
  );
}
