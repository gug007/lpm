import { ArrowRight } from "lucide-react";
import {
  PROPERTIES,
  type Alternative,
  type CardTone,
} from "./alternatives-data";
import MechanismLine from "./mechanism-line";
import PropertyChip from "./property-chip";

const CARD = {
  plain: "border-gray-200 bg-white/80 dark:border-gray-800 dark:bg-white/[0.025]",
  emerald:
    "border-emerald-200 bg-emerald-50/35 dark:border-emerald-900/60 dark:bg-emerald-400/[0.045]",
};

const TILE: Record<CardTone, string> = {
  gray: "bg-gray-100 text-gray-600 dark:bg-white/[0.06] dark:text-gray-300",
  blue: "bg-blue-50 text-blue-700 dark:bg-blue-400/10 dark:text-blue-300",
  emerald:
    "bg-emerald-100 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-300",
};

export default function AlternativeCard({
  alternative,
}: {
  alternative: Alternative;
}) {
  const { name, icon: Icon, tone, tag, mechanisms, gets, chips, tradeOff, link } =
    alternative;
  const emerald = tone === "emerald";

  return (
    <article
      className={`flex w-full flex-col rounded-2xl border p-4 sm:p-5 ${emerald ? CARD.emerald : CARD.plain}`}
    >
      <div className="flex items-center gap-3">
        <span
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${TILE[tone]}`}
        >
          <Icon aria-hidden className="h-4 w-4" />
        </span>
        <h3 className="text-[15px] font-semibold leading-snug text-gray-900 dark:text-gray-100">
          {name}
        </h3>
        {tag && (
          <span className="ml-auto shrink-0 rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-blue-700 dark:bg-blue-400/10 dark:text-blue-300">
            {tag}
          </span>
        )}
      </div>

      <div className="mt-3 space-y-1.5 sm:mt-4">
        {mechanisms.map((mechanism) => (
          <MechanismLine
            key={
              mechanism.kind === "menu"
                ? mechanism.steps.join(" > ")
                : mechanism.text
            }
            mechanism={mechanism}
          />
        ))}
      </div>

      <p className="mt-2.5 text-sm leading-relaxed text-gray-600 sm:mt-3 dark:text-gray-400">
        {gets}
      </p>

      <ul className="mt-3 grid grid-cols-2 gap-1.5 sm:mt-4 sm:flex sm:flex-wrap">
        {PROPERTIES.map((property) => (
          <PropertyChip
            key={property.key}
            label={property.label}
            chip={chips[property.key]}
          />
        ))}
      </ul>

      <div className="mt-auto pt-3 sm:pt-4">
        <p
          className={`border-t pt-2.5 text-xs leading-relaxed text-gray-500 sm:pt-3 dark:text-gray-400 ${
            emerald
              ? "border-emerald-100 dark:border-emerald-900/60"
              : "border-gray-100 dark:border-gray-800"
          }`}
        >
          <span className="font-semibold text-gray-700 dark:text-gray-300">
            Trade-off:
          </span>{" "}
          {tradeOff}
        </p>
        {link && (
          <a
            href={link.href}
            className={`mt-3 inline-flex items-center gap-1 text-xs font-medium underline-offset-4 hover:underline ${
              emerald
                ? "text-emerald-700 dark:text-emerald-300"
                : "text-gray-700 dark:text-gray-300"
            }`}
          >
            {link.label}
            <ArrowRight aria-hidden className="h-3 w-3" />
          </a>
        )}
      </div>
    </article>
  );
}
