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
} from "@/lib/links";
import { jsonLdString } from "@/lib/structured-data";
import { fetchLatestVersion } from "@/lib/github-stats";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "lpm — Free Mac App for Dev Projects & AI Coding Agents",
    template: "%s — lpm",
  },
  description:
    "Start, stop, switch, and duplicate local dev projects on your Mac — and run Claude Code, Codex, and Gemini side by side in a built-in terminal. Free download.",
  keywords: [
    "run claude code in parallel",
    "claude code multiple projects",
    "macOS app",
    "project switcher",
    "run multiple dev servers",
    "coding agents in parallel",
    "Claude Code",
    "Codex",
    "dev tools",
  ],
  openGraph: {
    title: "lpm — Free Mac App for Dev Projects & AI Coding Agents",
    description:
      "Start, stop, switch, and duplicate local dev projects on your Mac — and run Claude Code, Codex, and Gemini side by side in a built-in terminal. Free download.",
    type: "website",
    url: SITE_URL,
    siteName: "lpm",
  },
  twitter: {
    card: "summary_large_image",
    title: "lpm — Free Mac App for Dev Projects & AI Coding Agents",
    description:
      "Start, stop, switch, and duplicate local dev projects on your Mac — and run Claude Code, Codex, and Gemini side by side in a built-in terminal. Free download.",
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

const buildStructuredData = (softwareVersion: string | null) => ({
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": PUBLISHER_ID,
      name: "lpm",
      url: SITE_URL,
      logo: `${SITE_URL}/icon.png`,
      sameAs: [REPO_URL, TELEGRAM_URL],
      contactPoint: {
        "@type": "ContactPoint",
        contactType: "customer support",
        url: TELEGRAM_URL,
        availableLanguage: "English",
      },
    },
    {
      "@type": "SoftwareApplication",
      "@id": `${SITE_URL}/#app`,
      name: "lpm",
      description:
        "A free, open-source Mac app that starts, stops, duplicates, and switches between local dev projects, with a built-in terminal for running Claude Code, Codex, and other AI coding agents in parallel.",
      applicationCategory: "DeveloperApplication",
      operatingSystem: "macOS",
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
      "@id": `${SITE_URL}/#website`,
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
