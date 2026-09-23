import { Info } from "lucide-react";

export default function FeatureNote({ text }: { text: string }) {
  return (
    <p className="mt-2 flex gap-1.5 text-xs leading-relaxed text-gray-500 dark:text-gray-400">
      <Info className="mt-[3px] h-3 w-3 shrink-0" aria-hidden />
      <span>{text}</span>
    </p>
  );
}
