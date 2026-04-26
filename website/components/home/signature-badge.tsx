import { ShieldCheck } from "lucide-react";

export function SignatureBadge() {
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] text-gray-500 dark:text-gray-400">
      <ShieldCheck className="w-3 h-3" aria-hidden="true" />
      Signed &amp; notarized by Apple
    </span>
  );
}
