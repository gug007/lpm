import type { ReactNode } from "react";
import { FileText } from "lucide-react";

export function CodeBlock({
  filename,
  children,
}: {
  filename?: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-gray-200 dark:border-gray-800 overflow-hidden mb-4">
      {filename && (
        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-gray-100 dark:border-gray-800 bg-gray-50/80 dark:bg-gray-900/80">
          <FileText className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500" />
          <span className="text-xs text-gray-400 dark:text-gray-500 font-mono">
            {filename}
          </span>
        </div>
      )}
      <pre className="px-4 py-3 text-xs font-mono text-gray-700 dark:text-gray-300 leading-relaxed overflow-x-auto">
        <code>{children}</code>
      </pre>
    </div>
  );
}

export function Comment({ children }: { children: ReactNode }) {
  return (
    <span className="text-gray-400 dark:text-gray-500">{children}</span>
  );
}
