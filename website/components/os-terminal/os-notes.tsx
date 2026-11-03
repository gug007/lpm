import { SectionHeader } from "@/components/section-header";

export type OsNote = { title: string; body: string };

type Props = {
  title: string;
  description: string;
  notes: OsNote[];
};

export function OsNotes({ title, description, notes }: Props) {
  return (
    <section className="py-20 sm:py-24">
      <div className="mx-auto max-w-4xl px-6">
        <SectionHeader eyebrow="Good to know" title={title} description={description} />
        <dl className="grid gap-x-10 gap-y-8 sm:grid-cols-2">
          {notes.map(({ title: noteTitle, body }) => (
            <div key={noteTitle} className="border-l border-gray-200 pl-5 dark:border-gray-800">
              <dt className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                {noteTitle}
              </dt>
              <dd className="mt-1.5 text-sm leading-relaxed text-gray-500 dark:text-gray-400">
                {body}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
