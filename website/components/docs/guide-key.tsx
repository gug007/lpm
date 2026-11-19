import { ShortcutLabel } from "@/components/shortcut-label";

export function GuideKey({ mac }: { mac: string }) {
  return (
    <kbd className="rounded border border-gray-200 bg-gray-50 px-1.5 py-0.5 font-mono text-[12px] text-gray-700 dark:border-gray-700 dark:bg-white/[0.04] dark:text-gray-200">
      <ShortcutLabel mac={mac} />
    </kbd>
  );
}
