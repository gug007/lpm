import { CommandBlock } from "@/components/command-block";
import { LINK } from "@/components/prose";
import type { InstallStep } from "@/lib/install-steps";

export function InstallStepsList({
  steps,
  compact = false,
}: {
  steps: InstallStep[];
  compact?: boolean;
}) {
  return (
    <ol className={compact ? "space-y-2" : "space-y-3"}>
      {steps.map((step, i) => (
        <li key={step.text} className="flex gap-3">
          <span
            aria-hidden
            className="mt-px flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gray-100 text-[11px] font-semibold tabular-nums text-gray-700 dark:bg-white/10 dark:text-gray-200"
          >
            {i + 1}
          </span>
          <div
            className={`min-w-0 flex-1 leading-relaxed text-gray-600 dark:text-gray-400 ${
              compact ? "text-[13px]" : "text-sm"
            }`}
          >
            <p>
              {step.text}
              {step.link && (
                <>
                  {" "}
                  <a
                    href={step.link.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={LINK}
                  >
                    {step.link.label}
                  </a>
                </>
              )}
            </p>
            {step.command && (
              <CommandBlock size="sm" className="mt-1.5">
                {step.command}
              </CommandBlock>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}
