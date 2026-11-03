import { LessonCard } from "./lesson-card";
import type { LessonTopic } from "./lesson-topics";

export function LessonTopicSection({ topic }: { topic: LessonTopic }) {
  const headingId = `${topic.id}-heading`;
  return (
    <section
      id={topic.id}
      aria-labelledby={headingId}
      className="scroll-mt-20 border-t border-gray-200 py-12 sm:py-14 dark:border-gray-800"
    >
      <div className="mb-7 max-w-2xl">
        <h2
          id={headingId}
          className="text-balance text-xl font-bold tracking-tight text-gray-900 sm:text-2xl dark:text-white"
        >
          {topic.title}
        </h2>
        <p className="mt-1.5 text-pretty text-sm leading-relaxed text-gray-500 dark:text-gray-400">
          {topic.description}
        </p>
      </div>
      <ul className="grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
        {topic.lessons.map((lesson) => (
          <LessonCard key={lesson.lesson} {...lesson} />
        ))}
      </ul>
    </section>
  );
}
