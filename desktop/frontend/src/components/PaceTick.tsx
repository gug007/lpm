/** Where even use would put a usage bar by now: a tick that stands 3px proud of
 *  the bar it sits on, so it reads the same on a thin sidebar bar and a card's. */
export function PaceTick({ at, dim = false }: { at: number; dim?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className="absolute inset-y-[-3px] w-0.5 -translate-x-1/2 rounded-full bg-[var(--text-primary)]"
      style={{ left: `${at * 100}%`, opacity: dim ? 0.4 : 1 }}
    />
  );
}
