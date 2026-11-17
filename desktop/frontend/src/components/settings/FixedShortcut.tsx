import { Lock } from "lucide-react";
import { SHORTCUT_BOX } from "./shortcutBox";
import { ShortcutKeys } from "./ShortcutKeys";

// A shortcut lpm owns: its keys where a changeable one's would be, with a lock
// where the pencil would be.
export function FixedShortcut({ keys }: { keys: string }) {
  return (
    <span className={`${SHORTCUT_BOX} border-transparent`} title="Built in, can't be changed">
      <ShortcutKeys label={keys} />
      <Lock size={12} aria-hidden className="shrink-0 text-[var(--text-muted)] opacity-50" />
    </span>
  );
}
