import type { Metadata } from "next";
import { CtaBand } from "@/components/home/cta-band";
import { LESSONS_PATH } from "@/lib/links";
import {
  breadcrumbJsonLd,
  jsonLdString,
  webPageJsonLd,
  youtubeLessonJsonLd,
} from "@/lib/structured-data";
import Hero from "./_components/hero";
import { LessonTopicSection } from "./_components/lesson-topic-section";
import { LESSON_IDS, LESSON_TOPICS } from "./_components/lesson-topics";
import { TopicNav } from "./_components/topic-nav";

const TITLE = "Video Lessons for Dev Servers, Claude Code & Codex";
const DESCRIPTION = `${LESSON_IDS.length} short lpm lessons, recorded in the real app: add a project, start its dev servers, run Claude Code and Codex in parallel, automate, and drive it all from a server or your iPhone.`;

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  keywords: [
    "lpm tutorial",
    "lpm lessons",
    "claude code tutorial video",
    "run claude code in parallel video",
    "dev server manager tutorial",
  ],
  alternates: {
    canonical: LESSONS_PATH,
  },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    type: "website",
    url: LESSONS_PATH,
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
    path: LESSONS_PATH,
    about: ["lpm video lessons", "Claude Code and Codex tutorials"],
  }),
  breadcrumbJsonLd([
    { name: "Home", path: "/" },
    { name: "Lessons", path: LESSONS_PATH },
  ]),
  ...LESSON_IDS.map(youtubeLessonJsonLd),
];

export default function LessonsPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdString(structuredData) }}
      />
      <Hero />
      <TopicNav />
      <div className="mx-auto max-w-6xl px-6 pb-8">
        {LESSON_TOPICS.map((topic) => (
          <LessonTopicSection key={topic.id} topic={topic} />
        ))}
      </div>
      <CtaBand source="lessons-cta" />
    </>
  );
}
