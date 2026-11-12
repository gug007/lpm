import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import { Nav } from "@/components/nav";
import { Footer } from "@/components/footer";
import { ConsentBanner } from "@/components/consent-banner";
import { DownloadInstallNote } from "@/components/download-install-note";
import { ReleaseProvider } from "@/components/release-context";
import { getReleaseInfo } from "@/lib/release-info";
import {
  APP_STORE_URL,
  RELEASES_URL,
  REPO_URL,
  SITE_URL,
  TELEGRAM_URL,
  THEME_STORAGE_KEY,
  TIKTOK_URL,
  YOUTUBE_CHANNEL_URL,
} from "@/lib/links";
import { APP_DESCRIPTION, FEATURE_LIST, OPERATING_SYSTEMS } from "@/lib/app-facts";
import { APP_ID, WEBSITE_ID, jsonLdString } from "@/lib/structured-data";
import { consentDefaultsScript } from "@/lib/consent";
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
    default: "lpm — Free Desktop App to Run Claude Code, Codex & Dev Projects",
    template: "%s — lpm",
  },
  description:
    "Start, switch, and duplicate dev projects, and run Claude Code and Codex side by side with live status. Free and open source for Mac, Windows and x86-64 Linux.",
  keywords: [
    "run claude code in parallel",
    "claude code multiple projects",
    "schedule claude code tasks",
    "macOS app",
    "Windows app",
    "Linux app",
    "project switcher",
    "run multiple dev servers",
    "coding agents in parallel",
    "Claude Code",
    "Codex",
    "dev tools",
  ],
  openGraph: {
    title: "lpm — Free Desktop App to Run Claude Code, Codex & Dev Projects",
    description:
      "Start, switch, and duplicate dev projects, and run Claude Code and Codex side by side with live status. Free and open source for Mac, Windows and x86-64 Linux.",
    type: "website",
    url: SITE_URL,
    siteName: "lpm",
  },
  twitter: {
    card: "summary_large_image",
    title: "lpm — Free Desktop App to Run Claude Code, Codex & Dev Projects",
    description:
      "Start, switch, and duplicate dev projects, and run Claude Code and Codex side by side with live status. Free and open source for Mac, Windows and x86-64 Linux.",
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
      sameAs: [
        REPO_URL,
        APP_STORE_URL,
        TELEGRAM_URL,
        YOUTUBE_CHANNEL_URL,
        TIKTOK_URL,
      ],
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
      description: APP_DESCRIPTION,
      applicationCategory: "DeveloperApplication",
      operatingSystem: OPERATING_SYSTEMS,
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
  const [softwareVersion, releaseInfo] = await Promise.all([
    fetchLatestVersion(),
    getReleaseInfo(),
  ]);

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
        <ReleaseProvider value={releaseInfo}>
          <Nav />
          <main id="main" className="flex-1">
            {children}
          </main>
          <Footer />
        </ReleaseProvider>
        <DownloadInstallNote />
        <ConsentBanner />
        {/* /join holds a shared tab's invite in its address, so nobody else's
            script runs there. */}
        <Script id="ga-init" strategy="afterInteractive">
          {`
            if (!/^\\/join\\/?$/.test(location.pathname)) {
              window.dataLayer = window.dataLayer || [];
              window.gtag = function gtag(){dataLayer.push(arguments);};
              ${consentDefaultsScript}
              gtag('js', new Date());
              var page = { page_location: location.href.split('#')[0] };
              gtag('config', '${GA_ID}', page);
              gtag('config', '${GOOGLE_ADS_ID}', page);
              var tag = document.createElement('script');
              tag.async = true;
              tag.src = 'https://www.googletagmanager.com/gtag/js?id=${GA_ID}';
              document.head.appendChild(tag);
            }
          `}
        </Script>
      </body>
    </html>
  );
}
