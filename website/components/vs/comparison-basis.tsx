type Source = {
  href: string;
  label: string;
};

type Props = {
  reviewed: string;
  reviewedIso?: string;
  sources: Source[];
  lpmNote?: string;
};

const LINK_CLASS =
  "font-medium underline underline-offset-2 hover:text-gray-900 dark:hover:text-white";

// Past a handful of sources the run-on "A, B, C … and N" sentence stops being
// readable, so the list breaks out under the sentence instead of inside it.
const INLINE_LIMIT = 4;

export function ComparisonBasis({
  reviewed,
  reviewedIso,
  sources,
  lpmNote,
}: Props) {
  const date = reviewedIso ? (
    <time dateTime={reviewedIso}>{reviewed}</time>
  ) : (
    reviewed
  );
  const inline = sources.length <= INLINE_LIMIT;

  return (
    <div className="max-w-3xl mx-auto px-6 py-4">
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50/60 dark:bg-white/[0.03] px-4 py-3 text-xs leading-relaxed text-gray-500 dark:text-gray-400">
        <p className="text-center">
          Facts checked {date}
          {inline ? (
            <>
              {" "}
              against{" "}
              {sources.map((source, index) => (
                <span key={source.href}>
                  {index > 0 && (index === sources.length - 1 ? " and " : ", ")}
                  <a
                    href={source.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={LINK_CLASS}
                  >
                    {source.label}
                  </a>
                </span>
              ))}
            </>
          ) : (
            <> against {sources.length} sources</>
          )}
          .{lpmNote ? ` ${lpmNote}` : null}
        </p>

        {!inline && (
          <ul className="mt-3 flex flex-wrap justify-center gap-x-3 gap-y-1.5 border-t border-gray-200 dark:border-gray-800 pt-3">
            {sources.map((source) => (
              <li key={source.href}>
                <a
                  href={source.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={LINK_CLASS}
                >
                  {source.label}
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
