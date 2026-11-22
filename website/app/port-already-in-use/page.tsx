import type { Metadata } from "next";
import { RelatedPages } from "@/components/related-pages";
import { docsPath } from "@/lib/docs-pages";
import {
  FEATURES_PATH,
  MAC_TERMINAL_DEVELOPERS_PATH,
  PARALLEL_PATH,
  PORT_IN_USE_PATH,
  WINDOWS_TERMINAL_DEVELOPERS_PATH,
} from "@/lib/links";
import {
  breadcrumbJsonLd,
  jsonLdString,
  webPageJsonLd,
  youtubeLessonJsonLd,
} from "@/lib/structured-data";
import Causes from "./_components/causes";
import Cta from "./_components/cta";
import Faq from "./_components/faq";
import Fix from "./_components/fix";
import Hero from "./_components/hero";
import LpmPorts from "./_components/lpm-ports";

const TITLE = "Port 3000 Already in Use? Find and Kill the Process (Mac, Windows, Linux)";
const DESCRIPTION =
  "Fix EADDRINUSE and \"port already in use\": find what holds port 3000 and stop it on macOS, Linux or Windows, with the exact commands, and why it keeps happening.";

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  keywords: [
    "port 3000 already in use",
    "port already in use",
    "eaddrinuse address already in use",
    "kill process on port",
    "kill process on port 3000 mac",
    "find process using port",
    "port in use windows",
    "lsof port",
    "port 5000 in use mac",
  ],
  alternates: {
    canonical: PORT_IN_USE_PATH,
  },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    type: "article",
    url: PORT_IN_USE_PATH,
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
    path: PORT_IN_USE_PATH,
    about: [
      "port already in use",
      "EADDRINUSE",
      "finding and stopping the process on a port",
      "dev server port conflicts",
    ],
  }),
  breadcrumbJsonLd([
    { name: "Home", path: "/" },
    { name: "Port already in use", path: PORT_IN_USE_PATH },
  ]),
  youtubeLessonJsonLd("lpm-in-3-minutes"),
];

export default function PortInUsePage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdString(structuredData) }}
      />
      <Hero />
      <Fix />
      <Causes />
      <LpmPorts />
      <Faq />
      <RelatedPages
        links={[
          {
            href: docsPath("services"),
            title: "Services in the docs",
            description:
              "Every key a service takes, including port and portConflict, with a live editor.",
          },
          {
            href: PARALLEL_PATH,
            title: "Run Claude Code in parallel",
            description:
              "Several agents, each in its own copy of the project, without their dev servers colliding unseen.",
          },
          {
            href: MAC_TERMINAL_DEVELOPERS_PATH,
            title: "A Mac terminal for developers",
            description:
              "Projects, their services and terminals in one window, started with one click.",
          },
          {
            href: WINDOWS_TERMINAL_DEVELOPERS_PATH,
            title: "A terminal for Windows developers",
            description:
              "The same projects and services on Windows 11, with Git Bash as the shell.",
          },
          {
            href: FEATURES_PATH,
            title: "Everything lpm does",
            description:
              "Projects, terminals, agents, Git and other computers: the full feature list in one place.",
          },
        ]}
      />
      <Cta />
    </>
  );
}
