import { ChevronDown } from "lucide-react";

export function ReplicaFormRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-2.5">
      <span className="shrink-0 text-[13px] text-[#b3b3b3]">{label}</span>
      <span className="flex min-w-0 items-center gap-1 text-[13px] text-[#e5e5e5]">
        <span className="truncate">{value}</span>
        <ChevronDown className="h-3 w-3 shrink-0 text-[#919191]" strokeWidth={2} />
      </span>
    </div>
  );
}
