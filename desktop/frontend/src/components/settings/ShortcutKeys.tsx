import { Fragment } from "react";
import { shortcutKeyParts } from "./shortcutKeyParts";

const KEYCAP =
  "inline-flex h-6 min-w-6 items-center justify-center rounded-[5px] border border-[var(--border)] bg-[var(--bg-primary)] px-1.5 font-sans text-[13px] font-medium leading-none text-[var(--text-primary)] shadow-[inset_0_-1px_0_var(--border)]";

// A shortcut written as one keycap per key: "⌘⇧N" as ⌘ ⇧ N, "⌘1 – ⌘9" as a range.
export function ShortcutKeys({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap">
      {shortcutKeyParts(label).map((part, i) =>
        part.kind === "sep" ? (
          <span key={i} className="px-0.5 text-[12px] text-[var(--text-muted)]">
            {part.text}
          </span>
        ) : (
          <Fragment key={i}>
            {part.keys.map((key, j) => (
              <kbd key={j} className={KEYCAP}>
                {key}
              </kbd>
            ))}
          </Fragment>
        ),
      )}
    </span>
  );
}
