import { unmanagedActionKeys } from "./actionYaml";

// Surfaces fields present on the action's on-disk payload that the form can't
// edit (env, inputs, hand-authored keys), nudging the user to the YAML editor
// where they can. Renders nothing when there are none.
export function AlsoConfiguredChip({
  payload,
  onOpenEditor,
}: {
  payload: Record<string, unknown> | null;
  onOpenEditor: () => void;
}) {
  const keys = unmanagedActionKeys(payload);
  if (keys.length === 0) return null;

  return (
    <button
      type="button"
      onClick={onOpenEditor}
      className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--bg-secondary)] px-2.5 py-1 text-[11px] text-[var(--text-secondary)] transition-colors hover:border-[var(--text-muted)] hover:text-[var(--text-primary)]"
    >
      <span className="text-[var(--text-muted)]">Also configured:</span>
      <span className="font-medium">{keys.join(", ")}</span>
      <span className="text-[var(--text-muted)]">— edit in YAML view</span>
    </button>
  );
}
