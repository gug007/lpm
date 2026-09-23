export default function KeyChips({ keys }: { keys: string[] }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <span className="sr-only">Shortcut:</span>
      {keys.map((key) => (
        <kbd
          key={key}
          className="rounded-md border border-gray-200 bg-white px-1.5 py-0.5 font-mono text-[11px] leading-none text-gray-600 shadow-[0_1px_0_rgba(17,17,17,0.06)] dark:border-gray-700 dark:bg-white/[0.05] dark:text-gray-300 dark:shadow-none"
        >
          {key}
        </kbd>
      ))}
    </span>
  );
}
