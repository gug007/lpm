import { APP_STORE_URL, SITE_URL } from "@/lib/links";
import sitemapDates from "@/lib/sitemap-dates.json";
import {
  youtubeEmbedUrl,
  youtubeLesson,
  youtubeThumbnailUrl,
  youtubeWatchUrl,
  type YouTubeLessonId,
} from "@/lib/youtube-lessons";

const absoluteUrl = (path: string): string =>
  path === "/" ? SITE_URL : `${SITE_URL}${path}`;

export const jsonLdString = (data: unknown): string =>
  JSON.stringify(data).replace(/</g, "\\u003c");

export const APP_ID = `${SITE_URL}/#app`;
export const WEBSITE_ID = `${SITE_URL}/#website`;

const contentDates: Record<string, string> = sitemapDates;

type WebPageInput = {
  title: string;
  description: string;
  path: string;
  about?: string[];
  dateModified?: string;
};

export function webPageJsonLd({
  title,
  description,
  path,
  about,
  dateModified,
}: WebPageInput) {
  const url = absoluteUrl(path);
  const modified = dateModified ?? contentDates[path];
  return {
    "@context": "https://schema.org",
    "@type": "WebPage",
    "@id": `${url}#webpage`,
    name: title,
    url,
    description,
    ...(modified ? { dateModified: modified } : {}),
    isPartOf: { "@id": WEBSITE_ID },
    about: { "@id": APP_ID },
    ...(about?.length ? { keywords: about.join(", ") } : {}),
  };
}

type FaqItem = {
  question: string;
  answer: string;
};

export function faqJsonLd(items: FaqItem[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map(({ question, answer }) => ({
      "@type": "Question",
      name: question,
      acceptedAnswer: {
        "@type": "Answer",
        text: answer,
      },
    })),
  };
}

const SCREEN_RECORDINGS = {
  "add-project": {
    name: "Add a new project in lpm",
    description:
      "Adding a new project in the lpm desktop app: click + in the sidebar, browse to a directory, define services in the built-in editor, and save.",
    uploadDate: "2026-06-12T09:00:00+00:00",
  },
  "start-project": {
    name: "Start a project in lpm",
    description:
      "Starting a project in lpm: all services launch in parallel with live terminal output side by side.",
    uploadDate: "2026-06-12T09:00:00+00:00",
  },
  "add-action": {
    name: "Add an action in lpm",
    description:
      "Adding a one-shot action to a project in lpm — linters, test runners, or deploy scripts become buttons you trigger without leaving the app.",
    uploadDate: "2026-06-12T09:00:00+00:00",
  },
  "run-profile-project": {
    name: "Switch between profiles in lpm",
    description:
      "Running a project with multiple profiles in lpm and toggling between subsets of services with the profile switcher in the header.",
    uploadDate: "2026-06-12T09:00:00+00:00",
  },
  "start-project-claude": {
    name: "Launch Claude Code on a project in lpm",
    description:
      "Launching Claude Code on a project in lpm: one click opens a terminal with the agent already running in the right directory.",
    uploadDate: "2026-06-12T09:00:00+00:00",
  },
  "duplicate-project": {
    name: "Duplicate a project in lpm",
    description:
      "Duplicating a project in lpm to create an independent copy with its own services, terminals, and agents for parallel work.",
    uploadDate: "2026-06-12T09:00:00+00:00",
  },
  "agent-run-command": {
    name: "An agent runs a command in a new lpm terminal",
    description:
      "Claude Code uses the lpm CLI to run a git log command, and a fresh terminal tab opens in lpm with the output.",
    uploadDate: "2026-07-11T09:00:00+00:00",
  },
  "agent-parallel-tabs": {
    name: "An agent opens three parallel Claude tabs",
    description:
      "Claude Code drives the lpm CLI to open three Claude tabs in the same project, each already working on its prompt.",
    uploadDate: "2026-07-11T09:00:00+00:00",
  },
  "agent-duplicate-fanout": {
    name: "An agent fans out into three project copies",
    description:
      "Claude Code duplicates a project into three copies with lpm, each running its own Claude agent on the same prompt.",
    uploadDate: "2026-07-11T09:00:00+00:00",
  },
} as const;

export type ScreenRecordingId = keyof typeof SCREEN_RECORDINGS;

export function screenRecordingJsonLd(id: ScreenRecordingId) {
  const { name, description, uploadDate } = SCREEN_RECORDINGS[id];
  return {
    "@context": "https://schema.org",
    "@type": "VideoObject",
    name,
    description,
    contentUrl: absoluteUrl(`/screenrecording/${id}.mp4`),
    thumbnailUrl: absoluteUrl(`/screenrecording/${id}-poster.jpg`),
    uploadDate,
  };
}

export function youtubeLessonJsonLd(lesson: YouTubeLessonId) {
  const { id, name, description, uploadDate } = youtubeLesson(lesson);
  return {
    "@context": "https://schema.org",
    "@type": "VideoObject",
    name,
    description,
    url: youtubeWatchUrl(id),
    embedUrl: youtubeEmbedUrl(id),
    thumbnailUrl: youtubeThumbnailUrl(id),
    uploadDate,
  };
}

type BreadcrumbItem = {
  name: string;
  path: string;
};

export function breadcrumbJsonLd(items: BreadcrumbItem[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: absoluteUrl(item.path),
    })),
  };
}

type ItemListEntry = {
  name: string;
  path: string;
  description: string;
};

export function itemListJsonLd(items: ItemListEntry[]) {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      url: absoluteUrl(item.path),
      description: item.description,
    })),
  };
}

export function iosAppJsonLd({ description }: { description: string }) {
  return {
    "@context": "https://schema.org",
    "@type": "MobileApplication",
    "@id": `${SITE_URL}/#ios-app`,
    name: "lpm Link",
    description,
    operatingSystem: "iOS",
    applicationCategory: "DeveloperApplication",
    url: APP_STORE_URL,
    downloadUrl: APP_STORE_URL,
    isRelatedTo: { "@id": APP_ID },
    publisher: { "@id": `${SITE_URL}/#publisher` },
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
    },
  };
}
