import { Copy } from "lucide-react";
import { copyText } from "../files/fileActions";
import { BrainIcon, PlusIcon } from "../icons";
import { BTN_PRIMARY } from "../ui/buttons";
import { EmptyState } from "../ui/EmptyState";

const SKILL_COMMAND = "/lpm-memory";

// No memory session in the project yet: what one is, the two ways to start it.
export function MemoryEmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center pb-16">
      <EmptyState
        icon={<BrainIcon size={18} />}
        title="No memory yet"
        body="A memory session is a shared log of the work, so any agent can pick it up later and continue where the last one stopped."
      >
        <button
          type="button"
          onClick={onCreate}
          className={`${BTN_PRIMARY} mt-4 flex items-center gap-1.5`}
        >
          <PlusIcon />
          New memory session
        </button>
        <p className="mt-8 flex items-center gap-1.5 text-[12px] text-[var(--text-muted)]">
          or ask an agent to run
          <span className="inline-flex items-center gap-1 rounded-md bg-[var(--bg-secondary)] py-0.5 pl-1.5 pr-0.5 font-mono text-[12px] text-[var(--text-muted)]">
            {SKILL_COMMAND} &lt;name&gt;
            <button
              type="button"
              onClick={() => void copyText(SKILL_COMMAND)}
              aria-label="Copy command"
              title="Copy command"
              className="flex h-5 w-5 items-center justify-center rounded text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
            >
              <Copy size={12} />
            </button>
          </span>
        </p>
      </EmptyState>
    </div>
  );
}
