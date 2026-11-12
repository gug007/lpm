import { Check, X } from "lucide-react";
import { useActionRunMarks } from "../store/actionRunMarks";

// The corner mark a quick action's button carries after a run: green when it
// passed, red when it failed. A failed run's mark brings its output back.
export function ActionRunMarkBadge({ runKey }: { runKey: string }) {
  const mark = useActionRunMarks((s) => s.marks[runKey]);
  if (!mark) return null;
  const reopen = mark.reopen;
  const tone = mark.ok ? "bg-[var(--accent-green)]" : "bg-[var(--accent-red)]";
  const glyph = mark.ok ? <Check size={9} strokeWidth={3.5} /> : <X size={9} strokeWidth={3.5} />;
  const shape = `absolute -right-1 -top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full text-white shadow-[0_0_0_2px_var(--bg-primary)] ${tone}`;
  if (!reopen) {
    return (
      <span role="img" aria-label={mark.ok ? "Last run passed" : "Last run failed"} className={`pointer-events-none ${shape}`}>
        {glyph}
      </span>
    );
  }
  return (
    <span
      role="button"
      aria-label="Last run failed. Show its output"
      title="Last run failed · show its output"
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        reopen();
      }}
      className={`cursor-pointer transition-transform hover:scale-125 ${shape}`}
    >
      {glyph}
    </span>
  );
}
