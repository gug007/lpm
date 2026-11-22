import Image from "next/image";
import type { Push } from "@/components/home/paired-devices-data";

export function PushCard({
  push,
  expanded = false,
  pressedAction = null,
  className = "",
}: {
  push: Push;
  expanded?: boolean;
  pressedAction?: string | null;
  className?: string;
}) {
  return (
    <div
      className={`overflow-hidden rounded-2xl backdrop-blur-md transition-all duration-300 ${className}`}
    >
      <div className="flex items-start gap-2 p-2.5">
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
          {push.subtitle && (
            <span className="mt-0.5 block truncate text-[10px] font-medium text-gray-100">
              {push.subtitle}
            </span>
          )}
          <span
            className={`mt-0.5 block text-[10px] leading-snug text-gray-200 ${
              expanded ? "" : "line-clamp-2"
            }`}
          >
            {push.body}
          </span>
        </span>
      </div>
      {push.actions && (
        <div
          className={`grid transition-[grid-template-rows] duration-300 ${
            expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
          }`}
        >
          <span className="min-h-0 overflow-hidden">
            {push.actions.map((action) => (
              <span
                key={action}
                className={`block border-t border-white/10 px-3 py-1.5 text-[10px] font-medium transition-colors duration-200 ${
                  action === "Deny" ? "text-[#ff6961]" : "text-gray-100"
                } ${pressedAction === action ? "bg-white/20" : ""}`}
              >
                {action}
              </span>
            ))}
          </span>
        </div>
      )}
    </div>
  );
}
