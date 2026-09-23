import Image from "next/image";
import type { Push } from "@/components/home/paired-devices-data";

export function PushCard({
  push,
  className = "",
}: {
  push: Push;
  className?: string;
}) {
  return (
    <div
      className={`flex items-start gap-2 rounded-2xl p-2.5 backdrop-blur-md transition-all duration-300 ${className}`}
    >
      <Image
        src="/icon.png"
        alt=""
        width={22}
        height={22}
        className="h-[22px] w-[22px] shrink-0 rounded-[6px] bg-gray-700 p-0.5"
      />
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-2">
          <span className="truncate text-[10px] font-semibold text-gray-100">
            {push.title}
          </span>
          <span className="shrink-0 text-[8.5px] text-gray-400">
            {push.time}
          </span>
        </span>
        <span className="mt-0.5 block text-[10px] leading-snug text-gray-200">
          {push.body}
        </span>
      </span>
    </div>
  );
}
