type Source = {
  href: string;
  label: string;
};

type Props = {
  reviewed: string;
  sources: Source[];
};

export function ComparisonBasis({ reviewed, sources }: Props) {
  return (
    <div className="max-w-3xl mx-auto px-6">
      <p className="rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50/60 dark:bg-white/[0.03] px-4 py-3 text-center text-xs leading-relaxed text-gray-500 dark:text-gray-400">
        Facts checked {reviewed} against{" "}
        {sources.map((source, index) => (
          <span key={source.href}>
            {index > 0 && (index === sources.length - 1 ? " and " : ", ")}
            <a
              href={source.href}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium underline underline-offset-2 hover:text-gray-900 dark:hover:text-white"
            >
              {source.label}
            </a>
          </span>
        ))}
        .
      </p>
    </div>
  );
}
