import type { Metadata } from "next";
import { DemoSection } from "@/components/home/demo";
import { RelatedPages } from "@/components/related-pages";
import {
  AI_AGENTS_PATH,
  GIT_TERMINAL_MAC_PATH,
  LINUX_HOST_PATH,
  MAC_TERMINAL_DEVELOPERS_PATH,
  SSH_TERMINAL_MAC_PATH,
} from "@/lib/links";
import { breadcrumbJsonLd, jsonLdString, webPageJsonLd } from "@/lib/structured-data";
import Benefits from "./_components/benefits";
import Comparison from "./_components/comparison";
import Cta from "./_components/cta";
import Faq from "./_components/faq";
import Features from "./_components/features";
import Hero from "./_components/hero";
import Problem from "./_components/problem";
import Workflows from "./_components/workflows";
import { SSH_DEMO } from "./_components/demo-tour";

const TITLE = "SSH Terminal for Mac with Built-In Port Forwarding";
const DESCRIPTION =
  "Reads your ~/.ssh/config hosts, forwards remote ports to localhost on its own, and streams remote dev-box services into panes. No hand-typed ssh -L.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  keywords: [
    "mac ssh client",
    "ssh terminal for mac",
    "ssh client for mac",
    "ssh app for mac",
    "macos ssh terminal",
    "ssh port forwarding mac terminal",
    "mac terminal for remote development",
    "ssh terminal mac developers",
  ],
  alternates: {
    canonical: SSH_TERMINAL_MAC_PATH,
  },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    type: "website",
    url: SSH_TERMINAL_MAC_PATH,
    siteName: "lpm",
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
};

const structuredData = [
  webPageJsonLd({
    title: TITLE,
    description: DESCRIPTION,
    path: SSH_TERMINAL_MAC_PATH,
    about: [
      "SSH terminal for Mac",
      "macOS SSH client",
      "remote port forwarding",
      "~/.ssh/config host picker",
      "remote development terminal",
    ],
  }),
  breadcrumbJsonLd([
    { name: "Home", path: "/" },
    { name: "SSH Terminal for Mac", path: SSH_TERMINAL_MAC_PATH },
  ]),
];

export default function SshTerminalForMacPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdString(structuredData) }}
      />
      <Hero />
      <DemoSection {...SSH_DEMO} />
      <Problem />
      <Features />
      <Benefits />
      <Workflows />
      <Comparison />
      <Faq />
      <RelatedPages
        links={[
          {
            href: GIT_TERMINAL_MAC_PATH,
            title: "Git terminal for Mac",
            description:
              "Branch, rebase, and ship while your dev servers stream in the same window.",
          },
          {
            href: MAC_TERMINAL_DEVELOPERS_PATH,
            title: "Mac terminal for developers",
            description:
              "Run your whole stack — services, logs, and agents — in one native Mac app.",
          },
          {
            href: LINUX_HOST_PATH,
            title: "Run Claude Code on a remote server",
            description:
              "Go a step further than SSH: install lpm on a Linux box and keep its projects and agents running when your Mac is closed.",
          },
          {
            href: AI_AGENTS_PATH,
            title: "Best terminal for Claude Code and Codex",
            description:
              "Agents on the remote box report their status to your Mac sidebar, with alerts when one needs you.",
          },
        ]}
      />
      <Cta />
    </>
  );
}
