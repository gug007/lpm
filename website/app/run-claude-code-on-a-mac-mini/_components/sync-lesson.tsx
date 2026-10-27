import { LessonSection } from "@/components/lesson-section";

const STEPS = [
  {
    title: "Open Sync Ignored Files",
    body: "With the Mac mini paired and the project cloned on both, right-click it in your sidebar and choose Sync Ignored Files. It lists everything git ignores on either Mac, and where each file is.",
  },
  {
    title: "Check what's ticked",
    body: "Secrets and local config like .env, .env.local and certificates are ticked for you; node_modules and build output aren't. Compare shows two .env files key by key, with the values hidden.",
  },
  {
    title: "Sync, then forget about it",
    body: "Click Sync and the files land in the Mac mini's copy. From then on, a change on either Mac reaches the other while they're connected.",
  },
];

export default function SyncLesson() {
  return (
    <LessonSection
      id="watch-sync"
      lesson="sync-ignored-files"
      title="Bring your .env to the Mac mini"
      description="Git doesn't carry your .env files, so a fresh clone on the Mac mini can't run the project. This lesson syncs what git ignores from the laptop and keeps it the same on both."
      steps={STEPS}
    />
  );
}
