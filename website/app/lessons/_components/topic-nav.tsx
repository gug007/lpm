import { LESSON_TOPICS } from "./lesson-topics";

export function TopicNav() {
  return (
    <nav aria-label="Lesson topics" className="pb-10">
      <ul className="flex flex-wrap justify-center gap-2">
        {LESSON_TOPICS.map((topic) => (
          <li key={topic.id}>
            <a
              href={`#${topic.id}`}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-gray-200 px-3.5 text-[13px] text-gray-700 transition-colors hover:border-gray-300 hover:text-gray-900 dark:border-gray-800 dark:text-gray-300 dark:hover:border-gray-700 dark:hover:text-white"
            >
              {topic.title}
              <span className="tabular-nums text-gray-400 dark:text-gray-500">
                {topic.lessons.length}
              </span>
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
