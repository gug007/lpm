import { LessonSection } from "@/components/lesson-section";

const STEPS = [
  {
    title: "Write a skill once",
    body: "Open Skills from More options, or press Command Shift O. Click New, name it and write the prompt. Double braces mark a value you fill in each time.",
  },
  {
    title: "Run it in Claude Code and Codex",
    body: "Type a slash in the input and your skills come first. Pick one and send it: both agents run the same file as one of their own skills.",
  },
  {
    title: "Keep every skill in one list",
    body: "Sort them into project and global lists and folders, search inside prompts, and import old commands. Skills you made somewhere else show up too, with the agents that can reach each one.",
  },
];

export default function Lesson() {
  return (
    <LessonSection
      lesson="manage-claude-code-codex-skills"
      title="Manage your skills in one place"
      description="A lesson from the lpm series: write a skill once, run it in Claude Code and Codex from the same file, and keep everything you've collected in one list."
      steps={STEPS}
    />
  );
}
