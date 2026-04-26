import type { Metadata } from "next";
import { DemoSection } from "@/components/home/demo";
import {
  RELEASES_URL,
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
  title: "SSH Terminal for Mac — ~/.ssh/config, Port Forwarding, Remote Dev",
  description:
    "lpm is a native SSH terminal for Mac developers. Import ~/.ssh/config hosts, forward remote ports to localhost, and run remote dev box services beside your local stack.",
  keywords: [
    "ssh terminal for mac",
    "ssh client for mac",
    "mac terminal ssh",
    "macos ssh terminal",
    "ssh terminal mac developers",
    "mac terminal with ssh config",
    "ssh config host picker mac",
    "ssh port forwarding mac terminal",
    "remote port forwarding mac",
    "mac terminal for remote dev box",
    "ssh and dev server mac terminal",
    "jump host terminal mac",
    "bastion host terminal mac",
    "ec2 ssh terminal mac",
    "mac terminal for remote development",
    "termius alternative mac",
    "iterm2 ssh workflow",
    "warp terminal ssh alternative",
    "lpm",
    "local project manager",
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
    "@type": "SoftwareApplication",
    name: "lpm",
    applicationCategory: "DeveloperApplication",
    operatingSystem: "macOS",
    url: pageUrl,
    downloadUrl: RELEASES_URL,
    description:
      "A native SSH terminal for Mac developers that imports ~/.ssh/config hosts, forwards remote ports to localhost, and runs remote services in panes beside local services.",
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
    },
    featureList: [
      "Import hosts from ~/.ssh/config",
      "Forward remote ports to localhost",
      "Run remote services in terminal panes",
      "Use ProxyJump and bastion hosts from existing SSH config",
      "Run remote or rsync-backed local actions",
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
      <Cta />
    </>
  );
}
