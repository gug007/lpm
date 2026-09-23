import type { DetectionRow } from "./detection-data";

export function DetectionCommand({ row }: { row: DetectionRow }) {
  return (
    <>
      {row.command && (
        <code className="block font-mono text-[11px] text-gray-700 dark:text-gray-300 break-words">
          {row.command}
        </code>
      )}
      {row.alt && (
        <span
          className={`block text-[11px] leading-snug text-gray-500 dark:text-gray-400 ${
            row.command ? "mt-0.5" : ""
          }`}
        >
          {row.alt}
        </span>
      )}
    </>
  );
}
