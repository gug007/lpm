import { ClockIcon, PlusIcon } from "./icons";
import { EmptyState } from "./ui/EmptyState";

const BUTTON =
  "mt-4 flex items-center gap-1.5 rounded-lg bg-[var(--text-primary)] px-3.5 py-2 text-[13px] font-medium text-[var(--bg-primary)] shadow-sm transition hover:opacity-90";

// What the automations list shows while it has no rows: why it couldn't load,
// that it's loading, or how to make the first one.
export function AutomationsPlaceholder({
  error,
  loading,
  scoped,
  onRetry,
  onNewJob,
}: {
  error: string | null;
  loading: boolean;
  // A project's own tab rather than the app-wide page.
  scoped: boolean;
  onRetry: () => void;
  onNewJob: () => void;
}) {
  if (error) {
    return (
      <EmptyState title="Couldn't load automations" body={error}>
        <button type="button" onClick={onRetry} className={BUTTON}>
          Try again
        </button>
      </EmptyState>
    );
  }
  if (loading) {
    return <p className="py-8 text-center text-[12px] text-[var(--text-muted)]">Loading…</p>;
  }
  return (
    <EmptyState
      icon={<ClockIcon />}
      title="Nothing scheduled yet"
      body={
        scoped
          ? "Create an automation to run an AI prompt, a command, or an action in this project on a schedule."
          : "Create an automation to run an AI prompt, a command, or an action on a schedule — for one project or all of them."
      }
    >
      <button type="button" onClick={onNewJob} className={BUTTON}>
        <PlusIcon />
        New automation
      </button>
    </EmptyState>
  );
}
