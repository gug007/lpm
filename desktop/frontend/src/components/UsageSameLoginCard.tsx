import { providerMeta } from "./stats/limitsFormat";

interface UsageSameLoginCardProps {
  name: string;
  email?: string;
  sameAsName: string;
  onSignIn?: () => void;
}

/** A profile signed in as the same Claude account as an earlier one, which
 *  happens when `/login` inside it picks that account: its usage is that
 *  account's, shown on the earlier card, so this one only says so. */
export function UsageSameLoginCard({ name, email, sameAsName, onSignIn }: UsageSameLoginCardProps) {
  return (
    <section className="rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-4">
      <header className="flex items-center gap-2 border-b border-[var(--border)]/50 pb-3">
        <span
          aria-hidden="true"
          className="h-2 w-2 shrink-0 rounded-full opacity-50"
          style={{ backgroundColor: providerMeta("claude").dot }}
        />
        <span className="shrink-0 text-sm font-medium tracking-tight text-[var(--text-primary)]">{name}</span>
        {email && <span className="min-w-0 truncate text-[11px] text-[var(--text-muted)]">{email}</span>}
      </header>
      <p className="pt-4 text-[13px] leading-relaxed text-[var(--accent-orange-text)]">
        Signed in as the same Claude account as {sameAsName}, so its usage shows on that card.
      </p>
      {onSignIn && (
        <button
          type="button"
          onClick={onSignIn}
          className="mt-3 w-fit rounded-md border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-hover)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent-blue)]"
        >
          Sign in again
        </button>
      )}
    </section>
  );
}
