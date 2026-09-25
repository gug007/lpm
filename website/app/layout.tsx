import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import { Nav } from "@/components/nav";
import { Footer } from "@/components/footer";
import {
  RELEASES_URL,
  REPO_URL,
  SITE_URL,
  TELEGRAM_URL,
  THEME_STORAGE_KEY,
  YOUTUBE_CHANNEL_URL,
} from "@/lib/links";
import { APP_ID, WEBSITE_ID, jsonLdString } from "@/lib/structured-data";
import { fetchLatestVersion } from "@/lib/github-stats";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  preload: false,
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "lpm — Free Mac App to Run Claude Code, Codex & Dev Projects",
    template: "%s — lpm",
  },
  description:
    "Start, switch, and duplicate local dev projects on your Mac, and run Claude Code and Codex side by side with live agent status. Free and open source.",
  keywords: [
    "run claude code in parallel",
    "claude code multiple projects",
    "schedule claude code tasks",
    "macOS app",
    "project switcher",
    "run multiple dev servers",
    "coding agents in parallel",
    "Claude Code",
    "Codex",
    "dev tools",
  ],
  openGraph: {
    title: "lpm — Free Mac App to Run Claude Code, Codex & Dev Projects",
    description:
      "Start, switch, and duplicate local dev projects on your Mac, and run Claude Code and Codex side by side with live agent status. Free and open source.",
    type: "website",
    url: SITE_URL,
    siteName: "lpm",
  },
  twitter: {
    card: "summary_large_image",
    title: "lpm — Free Mac App to Run Claude Code, Codex & Dev Projects",
    description:
      "Start, switch, and duplicate local dev projects on your Mac, and run Claude Code and Codex side by side with live agent status. Free and open source.",
  },
};

const THEME_COLOR_LIGHT = "#ffffff";
const THEME_COLOR_DARK = "#111111";

const themeScript = `
(function() {
  try {
    var t = localStorage.getItem('${THEME_STORAGE_KEY}') ||
      (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    if (t === 'dark') document.documentElement.classList.add('dark');
    var m = document.createElement('meta');
    m.name = 'theme-color';
    m.content = t === 'dark' ? '${THEME_COLOR_DARK}' : '${THEME_COLOR_LIGHT}';
    document.head.appendChild(m);
  } catch (e) {}
})();
`;

const PUBLISHER_ID = `${SITE_URL}/#publisher`;

const FEATURE_LIST = [
  "Detects a project's dev servers when you add or clone it",
  "One-click start and stop for every service, with profiles",
  "Live output per service with listening ports and port-conflict checks",
  "Built-in terminals with Claude Code, Codex, Gemini, and OpenCode launchers",
  "Live Claude Code and Codex status with sounds and macOS notifications",
  "Prompt composer with @ mentions, images, and slash-command autocomplete",
  "Duplicate a project or create Git worktrees to run agents in parallel",
  "Scheduled automations that run agent prompts, commands, or actions",
  "Review changes, AI commit messages, and GitHub pull requests",
  "Files tab with an editor, Git status, and editable diffs",
  "Claude Code and Codex token stats and plan-limit meters",
  "Multiple Claude Code accounts pinned per project",
  "SSH remote projects with port forwarding",
  "Control another Mac or a Linux server from your Mac",
  "iPhone companion with live terminals and push notifications",
  "lpm CLI and agent skills so coding agents can drive lpm",
];

const buildStructuredData = (softwareVersion: string | null) => ({
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": PUBLISHER_ID,
      name: "lpm",
      url: SITE_URL,
      logo: `${SITE_URL}/icon.png`,
      sameAs: [REPO_URL, TELEGRAM_URL, YOUTUBE_CHANNEL_URL],
      contactPoint: {
        "@type": "ContactPoint",
        contactType: "customer support",
        url: TELEGRAM_URL,
        availableLanguage: "English",
      },
    },
    {
      "@type": "SoftwareApplication",
      "@id": APP_ID,
      name: "lpm",
      description:
        "A free, open-source Mac app that starts, stops, duplicates, and switches between local dev projects, with a built-in terminal for running Claude Code, Codex, and other AI coding agents in parallel.",
      applicationCategory: "DeveloperApplication",
      operatingSystem: "macOS",
      featureList: FEATURE_LIST,
      url: SITE_URL,
      image: `${SITE_URL}/screenrecording/start-project-poster.jpg`,
      screenshot: `${SITE_URL}/screenrecording/agent-parallel-tabs-poster.jpg`,
      ...(softwareVersion ? { softwareVersion } : {}),
      downloadUrl: RELEASES_URL,
      softwareHelp: REPO_URL,
      author: { "@id": PUBLISHER_ID },
      publisher: { "@id": PUBLISHER_ID },
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "USD",
      },
    },
    {
      "@type": "WebSite",
      "@id": WEBSITE_ID,
      name: "lpm",
      url: SITE_URL,
      publisher: { "@id": PUBLISHER_ID },
    },
  ],
});

const GA_ID = "G-ZDCK654G10";
const GOOGLE_ADS_ID = "AW-16987247563";

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const softwareVersion = await fetchLatestVersion();

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script
          dangerouslySetInnerHTML={{ __html: themeScript }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: jsonLdString(buildStructuredData(softwareVersion)),
          }}
        />
      </head>
      <body className="min-h-full flex flex-col bg-white text-gray-900 dark:bg-[#111] dark:text-gray-200 font-sans">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-full focus:bg-gray-900 focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-white dark:focus:bg-white dark:focus:text-gray-900"
        >
          Skip to content
        </a>
        <Nav />
        <main id="main" className="flex-1">
          {children}
        </main>
        <Footer />
        <Script
          src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`}
          strategy="afterInteractive"
        />
        <Script id="ga-init" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', '${GA_ID}');
            gtag('config', '${GOOGLE_ADS_ID}');
          `}
        </Script>
      </body>
    </html>
  );
}
