export type RivalSource = { href: string; label: string };

type RivalFacts = {
  checked: string;
  sources: RivalSource[];
  [fact: string]: string | RivalSource[];
};

// What other tools charge and ship changes without notice, so every such fact
// the site repeats lives here with the day it was last read from its source.
// Re-read the sources, then move `checked` forward, in the same change.
export const CMUX_FACTS = {
  checked: "2026-11-19",
  sources: [
    { href: "https://cmux.com/docs", label: "cmux's documentation" },
    {
      href: "https://cmux.com/docs/configuration",
      label: "its configuration reference",
    },
    { href: "https://cmux.com/pricing", label: "its pricing page" },
    {
      href: "https://github.com/manaflow-ai/cmux",
      label: "the cmux repository",
    },
  ],
  license: "GPL-3.0-or-later, commercial terms on request",
  cheapestPlan: "$15 a month",
  paidPlansAdd: "cloud VMs",
  phoneApp: "an iOS app in beta on TestFlight, early access with the Pro plan",
} satisfies RivalFacts;

const dateFmt = new Intl.DateTimeFormat("en-US", {
  month: "long",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

export const checkedLabel = (iso: string): string =>
  dateFmt.format(new Date(`${iso}T00:00:00Z`));
