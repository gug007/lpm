import { LessonSection } from "@/components/lesson-section";

const STEPS = [
  {
    title: "Pair the Mac mini",
    body: "On the Mac mini, click + above your projects, choose Another computer, then create an invite and copy it. On your laptop, click + above your projects, choose Another computer, paste it and click Connect. The Mac mini's projects appear in your sidebar.",
  },
  {
    title: "Start Claude Code and Codex there",
    body: "Open a project on the Mac mini and give each agent its task. They run on the Mac mini, signed in with its accounts, not on your laptop.",
  },
  {
    title: "Close the laptop, then come back",
    body: "Disconnect and walk away. When your laptop reconnects, both agents show Done and how long they worked, with their answers waiting in the tabs.",
  },
];

export default function Lesson() {
  return (
    <LessonSection
      lesson="keep-agents-running-on-server"
      title="Close the laptop, come back to finished work"
      description="A lesson from the lpm series, recorded with a Mac mini: start Claude Code and Codex there from the laptop, disconnect, and both are done when the laptop reconnects."
      steps={STEPS}
    />
  );
}
