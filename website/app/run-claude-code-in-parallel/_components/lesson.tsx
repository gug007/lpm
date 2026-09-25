import { LessonSection } from "@/components/lesson-section";

const STEPS = [
  {
    title: "Right-click the project, choose Duplicate",
    body: "Or start from the prompt you are writing: open the menu beside Send and pick Run in duplicates.",
  },
  {
    title: "Set the count and what runs in each copy",
    body: "An action such as Claude or Codex, or any shell command, plus the prompt to send it. Label the copies and group them in a sidebar folder if you like.",
  },
  {
    title: "Confirm, then watch them work",
    body: "The copies appear in the sidebar — under the original, or in the folder you named — and each agent reports its state as it goes.",
  },
];

export default function Lesson() {
  return (
    <LessonSection
      lesson="parallel-agents"
      title="One project, several copies, an agent in each"
      description="A short lesson from the lpm series: duplicate a project and send the same prompt to an agent in every copy."
      steps={STEPS}
    />
  );
}
