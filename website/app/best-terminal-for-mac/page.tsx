import type { Metadata } from "next";
import { BEST_TERMINAL_MAC_PATH } from "@/lib/links";
import Benefits from "./_components/benefits";
import Comparison from "./_components/comparison";
import Cta from "./_components/cta";
import Faq from "./_components/faq";
import Features from "./_components/features";
import Hero from "./_components/hero";
import WhyMac from "./_components/why-mac";
import Workflows from "./_components/workflows";

export const metadata: Metadata = {
  title: "Best Terminal for Mac — Native Apple Silicon Workspace",
  description:
    "lpm is the best terminal for Mac developers — a native Apple Silicon app with live output per service, a visual project switcher, and no Electron bloat.",
  keywords: [
    "best terminal for mac",
    "best terminal for macos",
    "best terminal for mac developers",
    "best terminal for mac m1",
    "best terminal for mac 2026",
    "best free terminal for mac",
    "best git terminal for mac",
    "best terminal for coding",
    "terminal for macbook pro",
    "mac terminal for developers",
    "developer terminal for mac",
    "iterm2 alternative mac",
    "hyper terminal for mac",
    "tabby terminal for mac",
    "terminal for web developers",
    "mac terminal for beginners",
    "download terminal for mac",
    "native mac terminal",
    "lpm",
    "local project manager",
  ],
  alternates: {
    canonical: BEST_TERMINAL_MAC_PATH,
  },
  openGraph: {
    title: "Best Terminal for Mac — Native Apple Silicon Workspace",
    description:
      "A native macOS terminal built for developers. Run every service side by side, switch projects visually, and skip the Electron bloat of Hyper or Tabby.",
    type: "website",
    url: BEST_TERMINAL_MAC_PATH,
    siteName: "lpm",
  },
  twitter: {
    card: "summary_large_image",
    title: "Best Terminal for Mac — Native Apple Silicon Workspace",
    description:
      "A native macOS terminal built for developers. Run every service side by side, switch projects visually, and skip the Electron bloat.",
  },
};

export default function BestTerminalForMacPage() {
  return (
    <>
      <Hero />
      <WhyMac />
      <Features />
      <Benefits />
      <Workflows />
      <Comparison />
      <Faq />
      <Cta />
    </>
  );
}
