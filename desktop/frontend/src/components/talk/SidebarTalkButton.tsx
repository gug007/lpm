import { AudioLines } from "lucide-react";
import { toggleTalk, useTalkStore } from "../../store/talk";
import { Tooltip } from "../ui/Tooltip";

// The sidebar footer's Talk button: say or type what to do, in any project,
// and approve the plan it comes back with.
export function SidebarTalkButton({ className }: { className: string }) {
  const open = useTalkStore((s) => s.phase !== "closed");
  return (
    <Tooltip content="Talk" triggerClassName="ml-auto inline-flex shrink-0">
      <button
        type="button"
        onClick={toggleTalk}
        className={`${className} ${
          open
            ? "bg-[var(--bg-active)] text-[var(--text-primary)]"
            : "text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
        }`}
        aria-label="Talk"
        aria-pressed={open}
      >
        <AudioLines size={16} />
      </button>
    </Tooltip>
  );
}
