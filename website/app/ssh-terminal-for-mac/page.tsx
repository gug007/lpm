import type { Metadata } from "next";
import { DemoSection } from "@/components/home/demo";
import { RelatedPages } from "@/components/related-pages";
import {
  GIT_TERMINAL_MAC_PATH,
  MAC_TERMINAL_DEVELOPERS_PATH,
  SITE_URL,
  SSH_TERMINAL_MAC_PATH,
} from "@/lib/links";
import Benefits from "./_components/benefits";
import Comparison from "./_components/comparison";
import Cta from "./_components/cta";
import Faq from "./_components/faq";
import Features from "./_components/features";
import Hero from "./_components/hero";
import Problem from "./_components/problem";
import Workflows from "./_components/workflows";

const pageUrl = `${SITE_URL}${SSH_TERMINAL_MAC_PATH}`;

export const metadata: Metadata = {
  title: "SSH Terminal for Mac — Port Forwarding & Remote Dev",
  description:
    "lpm is a native SSH terminal for Mac developers. Import ~/.ssh/config hosts, forward remote ports to localhost, and run remote dev box services beside your local stack.",
  keywords: [
    "ssh terminal for mac",
    "ssh client for mac",
    "macos ssh terminal",
    "ssh port forwarding mac terminal",
    "mac terminal for remote development",
    "ssh terminal mac developers",
  ],
  alternates: {
    canonical: SSH_TERMINAL_MAC_PATH,
  },
  openGraph: {
    title: "SSH Terminal for Mac — Remote Dev Boxes in One Window",
    description:
      "Import ~/.ssh/config hosts, forward remote ports to localhost, and run remote services beside local ones in one native Mac terminal.",
    type: "website",
    url: pageUrl,
    siteName: "lpm",
  },
  twitter: {
    card: "summary_large_image",
    title: "SSH Terminal for Mac — ~/.ssh/config, Ports, Remote Dev",
    description:
      "A native macOS SSH terminal that imports your ~/.ssh/config, forwards remote ports, and keeps remote services next to your local stack.",
  },
};

const structuredData = [
  {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: "SSH Terminal for Mac",
    url: pageUrl,
    description: metadata.description,
    isPartOf: {
      "@type": "WebSite",
      name: "lpm",
      url: SITE_URL,
    },
    about: [
      "SSH terminal for Mac",
      "macOS SSH client",
      "remote port forwarding",
      "~/.ssh/config host picker",
      "remote development terminal",
    ],
  },
  {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "Home",
        item: SITE_URL,
      },
      {
        "@type": "ListItem",
        position: 2,
        name: "SSH Terminal for Mac",
        item: pageUrl,
      },
    ],
  },
];

export default function SshTerminalForMacPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
      <Hero />
      <DemoSection />
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
        ]}
      />
      <Cta />
    </>
  );
}
