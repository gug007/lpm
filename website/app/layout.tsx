import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import { Nav } from "@/components/nav";
import { Footer } from "@/components/footer";
import { SITE_URL, THEME_STORAGE_KEY } from "@/lib/links";

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
    default:
      "lpm — Project & Terminal Switcher for Claude Code & Codex",
    template: "%s — lpm",
  },
  description:
    "lpm is a CLI and native macOS desktop app for managing local dev projects. Start, stop, and switch between projects with one command. CLI and app stay fully in sync. Supports Rails, Next.js, Go, Django, Docker Compose, and more.",
  keywords: [
    "local project manager",
    "dev tools",
    "CLI",
    "macOS app",
    "process manager",
    "developer workflow",
    "terminal",
    "project switcher",
  ],
  alternates: {
    canonical: SITE_URL,
  },
  openGraph: {
    title: "lpm — Local Project Manager",
    description:
      "Use the CLI or the desktop app — they stay in sync. Start, stop, and switch between local dev projects with one command.",
    type: "website",
    url: SITE_URL,
    siteName: "lpm",
  },
  twitter: {
    card: "summary_large_image",
    title: "lpm — Local Project Manager",
    description:
      "Use the CLI or the desktop app — they stay in sync. Start, stop, and switch between local dev projects with one command.",
  },
};

const themeScript = `
(function() {
  try {
    var t = localStorage.getItem('${THEME_STORAGE_KEY}') ||
      (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    if (t === 'dark') document.documentElement.classList.add('dark');
  } catch (e) {}
})();
`;

const structuredData = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "lpm",
  alternateName: "Local Project Manager",
  description:
    "A CLI and native macOS desktop app to manage local dev projects. Start, stop, and switch with one command. CLI and app stay fully in sync.",
  applicationCategory: "DeveloperApplication",
  operatingSystem: "macOS",
  url: SITE_URL,
  downloadUrl: "https://github.com/gug007/lpm/releases/latest",
  softwareHelp: "https://github.com/gug007/lpm",
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "USD",
  },
};

const GA_ID = "G-ZDCK654G10";
const GOOGLE_ADS_ID = "AW-16987247563";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
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
          dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
        />
      </head>
      <body className="min-h-full flex flex-col bg-white text-gray-900 dark:bg-[#111] dark:text-gray-200 font-sans">
        <Nav />
        <main className="flex-1">{children}</main>
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
