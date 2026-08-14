import { FIELD_CLASS } from "../components/ui/fields";

export const modalInputClass = `${FIELD_CLASS} px-3 py-2 disabled:opacity-60`;

export const modalErrorInputClass = "border-[var(--accent-red-text)]";

export const modalErrorTextClass = "text-[11px] text-[var(--accent-red-text)]";

export const modalErrorBannerClass =
  "rounded-md border border-[var(--accent-red)]/30 bg-[var(--accent-red)]/5 px-3 py-2 text-[12px] leading-relaxed text-[var(--accent-red-text)]";

export const modalInputDefaults = {
  autoComplete: "off",
  autoCorrect: "off",
  autoCapitalize: "off",
  spellCheck: false,
} as const;
