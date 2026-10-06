import { LessonSection } from "@/components/lesson-section";

const STEPS = [
  {
    title: "Open Review changes",
    body: "When the agent is done, click the ⋯ menu above the terminal and choose Review changes, or press ⌘⇧R (Ctrl+Alt+Shift+R on Windows and Linux).",
  },
  {
    title: "Read every change in one stack",
    body: "Every changed file is shown as a diff, one after another, with the files listed on the right. Click one to see just that file, as a diff or as the whole file.",
  },
  {
    title: "Undo what you don't want, commit the rest",
    body: "Hover a file and click the undo arrow to put it back the way it was, then click Commit in the footer.",
  },
];

export default function Lesson() {
  return (
    <LessonSection
      lesson="review-code-changes"
      title="Check Claude's edits before they're committed"
      description="A short lesson from the lpm series: Claude Code changes a page and a README, then you read every line, undo one file, and commit the rest without leaving lpm."
      steps={STEPS}
    />
  );
}
