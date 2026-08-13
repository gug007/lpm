export type DotKind = "project" | "copy" | "worktree";

const DOT_CLASS = "inline-block h-2 w-2 shrink-0 rounded-full";
const MUTED = "var(--text-muted)";

function toneClass(running: boolean): string {
  return running
    ? "bg-[var(--accent-green)]"
    : "border border-[var(--text-muted)] bg-[var(--bg-primary)]";
}

export function dotKind(project: { parentName?: string; worktree?: boolean }): DotKind {
  if (!project.parentName) return "project";
  return project.worktree ? "worktree" : "copy";
}

/** The row's status light: filled for running, a ring for stopped.
 *
 *  `kind` says what the row is, without spending the fill — which is already
 *  taken by running vs stopped:
 *
 *    project   the dot alone
 *    copy      a fainter twin behind and up-left of it
 *    worktree  a small node on a stem running into it, the git branch glyph
 *
 *  Both marks are drawn outside the 8px dot and overflow into the row's left
 *  padding rather than widening the column, so the real dots stay in one
 *  straight line down the sidebar and no name moves. Neither mark carries state
 *  of its own: the twin tints with the dot because it stands for another
 *  instance, and the branch stays muted because it stands for the link. */
export function StatusDot({ running, kind = "project" }: { running: boolean; kind?: DotKind }) {
  if (kind === "project") return <span className={`${DOT_CLASS} ${toneClass(running)}`} />;

  return (
    <span className="relative inline-flex h-2 w-2 shrink-0">
      {kind === "copy" ? (
        <span
          className={`absolute -left-[3px] -top-[3px] h-[7px] w-[7px] rounded-full opacity-35 ${
            running ? "bg-[var(--accent-green)]" : "bg-[var(--text-muted)]"
          }`}
        />
      ) : (
        // A 14px canvas pinned over the 8px dot: the stem runs down from the
        // node and turns into the dot's left edge, where the dot covers its end.
        <svg
          className="absolute -left-[3px] -top-[3px] h-[14px] w-[14px]"
          viewBox="0 0 14 14"
          fill="none"
          shapeRendering="geometricPrecision"
          aria-hidden="true"
        >
          <path
            d="M1.6 1.8V5.4A2.4 2.4 0 0 0 4 7.8h.6"
            stroke={MUTED}
            strokeWidth="1"
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity="0.9"
          />
          <circle cx="1.6" cy="1.4" r="1.4" fill={MUTED} opacity="0.6" />
        </svg>
      )}
      <span className={`relative ${DOT_CLASS} ${toneClass(running)}`} />
    </span>
  );
}
