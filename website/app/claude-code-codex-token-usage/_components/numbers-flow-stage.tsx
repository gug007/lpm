import Link from "next/link";
import type { FlowStage } from "./numbers-flow-data";
import { INLINE_CODE, TEXT_LINK } from "./page-styles";

export default function NumbersFlowStage({ stage }: { stage: FlowStage }) {
  return (
    <div
      className={`rounded-2xl border p-5 ${
        stage.highlight
          ? "border-emerald-200 bg-emerald-50/50 dark:border-emerald-400/20 dark:bg-emerald-400/[0.04]"
          : "border-gray-200 dark:border-gray-800"
      }`}
    >
      <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
        {stage.title}
      </h3>
      <ul className="mt-4 space-y-4">
        {stage.items.map(({ icon: Icon, lead, href, code, detail }) => (
          <li key={lead} className="flex gap-3">
            <span
              aria-hidden
              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${
                stage.highlight
                  ? "bg-emerald-100/80 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-300"
                  : "bg-gray-100 text-gray-600 dark:bg-white/[0.06] dark:text-gray-300"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
            </span>
            <div className="min-w-0 pt-0.5">
              <p className="text-sm font-medium leading-snug text-gray-900 dark:text-gray-100">
                {href ? (
                  <Link href={href} className={TEXT_LINK}>
                    {lead}
                  </Link>
                ) : (
                  lead
                )}
              </p>
              <p className="mt-1 text-[13px] leading-snug text-gray-500 dark:text-gray-400">
                {code && <code className={INLINE_CODE}>{code}</code>}
                {detail}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
