import { ArrowRight } from "lucide-react";

const FILE = "min-w-0 overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)]/60 text-left";
const NAME = "truncate border-b border-[var(--border)] px-3 py-1.5 font-mono text-[12px] text-[var(--text-muted)]";
const CODE = "whitespace-pre px-3 py-2.5 font-mono text-[12px] leading-[18px] text-[var(--text-secondary)]";
const KEY = "text-[var(--text-primary)]";

// What a template is, shown rather than told: one file of shared actions, and a
// project's config taking them in.
export function TemplateExample() {
  return (
    <div aria-hidden className="mt-5 w-full max-w-xl">
      <div className="grid grid-cols-[1fr_auto_1fr] items-stretch gap-2">
        <div className={FILE}>
          <p className={NAME}>templates/rails.yml</p>
          <pre className={CODE}>
            <span className={KEY}>actions:</span>
            {"\n  test: bin/rails test\n  console:\n    cmd: bin/rails console\n    type: terminal"}
          </pre>
        </div>
        <ArrowRight size={14} className="self-center text-[var(--text-muted)]" />
        <div className={FILE}>
          <p className={NAME}>projects/shop.yml</p>
          <pre className={CODE}>
            {"name: shop\nroot: ~/code/shop\n"}
            <span className={KEY}>extends: [rails]</span>
          </pre>
        </div>
      </div>
      <p className="mt-2 text-[12px] text-[var(--text-muted)]">
        Both live in <code className="font-mono text-[var(--text-secondary)]">~/.lpm</code>. A project takes a template in
        with <code className="font-mono text-[var(--text-secondary)]">extends</code>.
      </p>
    </div>
  );
}
