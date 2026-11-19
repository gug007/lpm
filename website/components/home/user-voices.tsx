import { USER_VOICES, voiceUrl } from "./user-voices-data";

export function UserVoices() {
  return (
    <ul className="mb-8 grid gap-3 sm:grid-cols-3 lg:-mx-16">
      {USER_VOICES.map((voice) => (
        <li key={voice.discussion} className="flex">
          <a
            href={voiceUrl(voice)}
            target="_blank"
            rel="noopener noreferrer"
            className="group flex w-full flex-col rounded-2xl border border-gray-200 bg-gray-50/40 p-5 transition-colors duration-200 hover:border-gray-300 dark:border-gray-800 dark:bg-white/[0.02] dark:hover:border-gray-700"
          >
            <figure className="flex flex-1 flex-col">
              <blockquote className="text-pretty text-sm leading-relaxed text-gray-700 dark:text-gray-300">
                “{voice.quote}”
              </blockquote>
              <figcaption className="mt-auto flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 pt-4 text-xs text-gray-500 dark:text-gray-400">
                <span>
                  <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                    {voice.author}
                  </span>
                  {voice.about && <> {voice.about}</>}
                </span>
                <span className="tabular-nums underline-offset-4 decoration-gray-300 group-hover:underline dark:decoration-gray-600">
                  Discussion #{voice.discussion}
                  <span className="sr-only"> on GitHub</span>
                </span>
              </figcaption>
            </figure>
          </a>
        </li>
      ))}
    </ul>
  );
}
