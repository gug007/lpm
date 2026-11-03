import { dayLabel } from "../sendLater/time";
import { useReleaseNotesBetween } from "../store/releaseNotes";

/** Releases listed in full; older ones are counted. */
export const TIMELINE_SHOWN = 5;

const STEP = "relative pb-3 pl-5 last:pb-0";
const RAIL =
  "before:absolute before:left-[4px] before:top-3 before:-bottom-0.5 before:w-px before:bg-[var(--border)] last:before:hidden";
const NODE = "absolute left-0 top-[3px] h-[9px] w-[9px] rounded-full border-[1.5px]";
const TAG = "rounded px-1 text-[10px] leading-4";

function releaseDay(publishedAt: string, now: number): string {
  const at = Date.parse(publishedAt);
  return Number.isNaN(at) ? "" : dayLabel(at, now);
}

// Every release between the running version and the one on offer, newest at
// the top and the running one at the bottom, so it's clear how far behind this
// is and what each skipped release brought.
export function UpdateTimelineCard({ since, until }: { since: string; until: string }) {
  const entry = useReleaseNotesBetween(since, until);
  const ready = entry?.status === "ready" ? entry : null;
  const releases = ready?.releases ?? [];
  const shown = releases.slice(0, TIMELINE_SHOWN);
  const earlier = releases.length - shown.length;
  const more = ready && !ready.complete ? "+" : "";
  const releasesWord = (n: number) => (n === 1 && !more ? "release" : "releases");
  const now = Date.now();

  const status =
    entry?.status === "error"
      ? "Couldn't load the release notes."
      : ready
        ? "No release notes for this update."
        : "Loading release notes…";

  return (
    <section className="rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-3 text-xs text-[var(--text-primary)]">
      <header className="mb-2 flex items-baseline gap-2">
        <span className="font-semibold">
          {releases.length > 0
            ? `${releases.length}${more} ${releasesWord(releases.length)} behind`
            : "What's new"}
        </span>
        <span className="ml-auto shrink-0 text-[11px] tabular-nums text-[var(--text-muted)]">
          {since} → {until}
        </span>
      </header>

      {releases.length === 0 ? (
        <p className="text-[var(--text-muted)]">{status}</p>
      ) : (
        <ol>
          {shown.map((release, i) => {
            const day = releaseDay(release.publishedAt, now);
            const node = !release.notes
              ? "border-dashed border-[var(--text-muted)] bg-[var(--bg-secondary)]"
              : i === 0
                ? "border-[var(--accent-green)] bg-[var(--accent-green)]"
                : "border-[var(--accent-green)] bg-[var(--bg-secondary)]";
            return (
              <li key={release.version} className={`${STEP} ${RAIL}`}>
                <span aria-hidden="true" className={`${NODE} ${node}`} />
                <span className="flex items-baseline gap-2">
                  <span className="font-medium tabular-nums">{release.version}</span>
                  {day && <span className="text-[11px] text-[var(--text-muted)]">{day}</span>}
                  {i === 0 && (
                    <span className={`${TAG} bg-[var(--accent-green)]/15 text-[var(--accent-green-text)]`}>
                      Latest
                    </span>
                  )}
                  {release.beta && (
                    <span className={`${TAG} bg-[var(--accent-amber)]/15 text-[var(--accent-amber-text)]`}>
                      Beta
                    </span>
                  )}
                </span>
                <p
                  className={`mt-0.5 leading-snug ${
                    release.notes ? "text-[var(--text-secondary)]" : "italic text-[var(--text-muted)]"
                  }`}
                >
                  {release.notes || "No release notes"}
                </p>
              </li>
            );
          })}
          {earlier > 0 && (
            <li className={`${STEP} ${RAIL}`}>
              <span aria-hidden="true" className={`${NODE} border-dashed border-[var(--text-muted)] bg-[var(--bg-secondary)]`} />
              <span className="text-[var(--text-muted)]">
                {earlier}
                {more} earlier {releasesWord(earlier)}
              </span>
            </li>
          )}
          <li className={`${STEP} ${RAIL}`}>
            <span aria-hidden="true" className={`${NODE} border-[var(--text-muted)] bg-[var(--bg-secondary)]`} />
            <span className="flex items-baseline gap-2">
              <span className="font-medium tabular-nums">{since}</span>
              <span className={`${TAG} bg-[var(--bg-active)] text-[var(--text-secondary)]`}>You're here</span>
            </span>
          </li>
        </ol>
      )}
    </section>
  );
}
