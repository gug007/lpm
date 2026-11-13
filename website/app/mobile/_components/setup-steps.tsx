import type { ReactNode } from "react";
import { Laptop, Smartphone } from "lucide-react";
import { AppStoreButton } from "@/components/app-store-button";
import { GooglePlayButton } from "@/components/google-play-button";
import { StoreScan } from "@/components/store-scan";
import ComputerDownloadStep from "./computer-download-step";

type Step = {
  where: string;
  title: string;
  body: string;
  action: ReactNode;
};

function PairedLine() {
  return (
    <div
      aria-hidden="true"
      className="flex items-center gap-2 text-gray-600 dark:text-gray-300"
    >
      <Laptop className="h-5 w-5 shrink-0" />
      <span className="h-px flex-1 border-t border-dashed border-gray-300 dark:border-gray-700" />
      <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-300">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
        Paired
      </span>
      <span className="h-px flex-1 border-t border-dashed border-gray-300 dark:border-gray-700" />
      <Smartphone className="h-5 w-5 shrink-0" />
    </div>
  );
}

const STEPS: Step[] = [
  {
    where: "On your computer",
    title: "Install lpm",
    body: "The free desktop app your phone connects to, for macOS, Windows or Linux. Your terminals and agents run here.",
    action: <ComputerDownloadStep />,
  },
  {
    where: "On your phone or tablet",
    title: "Get lpm Link",
    body: "Free on the App Store and Google Play.",
    action: (
      <div className="flex flex-col items-start gap-3">
        <AppStoreButton source="mobile-hero" />
        <GooglePlayButton source="mobile-hero" />
        <StoreScan />
      </div>
    ),
  },
  {
    where: "Once",
    title: "Scan to pair",
    body: "lpm on your computer shows a one-time QR code. Scan it with lpm Link and your projects appear. No account, no sign-in.",
    action: <PairedLine />,
  },
];

// lpm Link does nothing until lpm runs on a computer, so setup reads in the
// order it happens.
export default function SetupSteps() {
  return (
    <ol className="mx-auto mt-[clamp(1.5rem,3.5vh,2.25rem)] grid max-w-5xl gap-3 px-6 text-left md:grid-cols-3 md:gap-4">
      {STEPS.map((step, i) => (
        <li
          key={step.title}
          className="flex flex-col rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.02]"
        >
          <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-widest text-gray-500 dark:text-gray-400">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-gray-900 text-[11px] tracking-normal text-white dark:bg-white dark:text-gray-900">
              {i + 1}
            </span>
            {step.where}
          </p>
          <h2 className="mt-3 text-base font-semibold text-gray-900 dark:text-gray-100">
            {step.title}
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-gray-600 dark:text-gray-400">
            {step.body}
          </p>
          <div className="mt-auto pt-4">{step.action}</div>
        </li>
      ))}
    </ol>
  );
}
