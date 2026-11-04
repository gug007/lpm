import { useSkillsUnsaved } from "../../store/skillsUnsaved";

// A dot on a Skills tab while its editor has changes not saved yet.
export function SkillsUnsavedMark({ tabId }: { tabId: string }) {
  const unsaved = useSkillsUnsaved((s) => s.tabs.has(tabId));
  if (!unsaved) return null;
  return (
    <span
      title="Unsaved changes"
      aria-label="Unsaved changes"
      className="ml-1 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--accent-amber)]"
    />
  );
}
