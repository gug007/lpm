export function StatuslineCodexAppearance({
  useColors,
  onToggleColors,
}: {
  useColors: boolean;
  onToggleColors: () => void;
}) {
  return (
    <div className="mt-4">
      <button
        type="button"
        onClick={onToggleColors}
        aria-pressed={useColors}
        className="flex min-h-14 w-full items-center justify-between rounded-xl border border-gray-200 px-3 text-left transition hover:border-gray-300 dark:border-gray-800 dark:hover:border-gray-700"
      >
        <span>
          <span className="block text-xs font-semibold text-gray-800 dark:text-gray-200">
            Use theme colors
          </span>
          <span className="mt-0.5 block text-[11px] text-gray-500 dark:text-gray-400">
            Let Codex color the fields from its active{" "}
            <code className="font-mono">/theme</code>.
          </span>
        </span>
        <span
          className={`relative ml-3 h-6 w-11 shrink-0 rounded-full transition-colors ${
            useColors ? "bg-[#10A37F]" : "bg-gray-300 dark:bg-gray-700"
          }`}
        >
          <span
            className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${
              useColors ? "translate-x-6" : "translate-x-1"
            }`}
          />
        </span>
      </button>
      <p className="mt-3 text-[11px] leading-relaxed text-gray-500 dark:text-gray-400">
        Codex controls separators and rendering. lpm gives you its built-in
        fields, ordering, presets, colors, and an Off state without opening
        config.toml.
      </p>
    </div>
  );
}
