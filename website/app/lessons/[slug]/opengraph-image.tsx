import { OG_CONTENT_TYPE, OG_SIZE, ogImage } from "@/lib/og-template";
import { LESSON_CHAPTERS } from "@/lib/youtube-chapters";
import { formatLength } from "@/components/home/lesson-data";
import { findLesson, LESSON_IDS } from "../_components/lesson-topics";

export const alt = "An lpm video lesson, recorded in the real app";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export function generateStaticParams() {
  return LESSON_IDS.map((slug) => ({ slug }));
}

export default async function Image({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const found = findLesson((await params).slug);
  if (!found) return ogImage({ headline: "lpm lessons", subline: "", eyebrow: "Lesson" });
  const { seconds, chapters } = LESSON_CHAPTERS[found.lesson];
  return ogImage({
    headline: found.title,
    subline: `A ${formatLength(seconds)} lesson in ${chapters.length} chapters, recorded in the real app.`,
    eyebrow: "Lesson",
  });
}
