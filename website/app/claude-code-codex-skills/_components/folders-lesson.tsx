import { LessonSection } from "@/components/lesson-section";

const STEPS = [
  {
    title: "Make a folder",
    body: "In the Skills tab, click New folder beside This project or Global, name it, and press Return. Folders can sit inside folders.",
  },
  {
    title: "File your skills",
    body: "Drag a skill onto a folder, or pick several and drag them together. Move to and the Folder field do the same, and skills you made somewhere else can go in too.",
  },
  {
    title: "Find them in the slash menu",
    body: "Type a slash in lpm's input and each skill shows its folder beside it. Type a folder's name and the list narrows to it.",
  },
];

export default function FoldersLesson() {
  return (
    <LessonSection
      lesson="organize-claude-code-codex-skills-folders"
      id="watch-folders"
      title="Sort a long list of skills into folders"
      description="A lesson from the lpm series: turn one long list of Claude Code and Codex skills into folders you can scan, in the Skills tab and in the slash menu."
      steps={STEPS}
    />
  );
}
