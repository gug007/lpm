export type VerdictCard = {
  label: string;
  title: string;
  body: string;
};

type Props = {
  cards: [VerdictCard, VerdictCard, VerdictCard];
};

export function VerdictCards({ cards }: Props) {
  return (
    <section className="py-16 sm:py-20">
      <div className="max-w-5xl mx-auto px-6">
        <div className="grid gap-4 md:grid-cols-3 text-left">
          {cards.map((card) => (
            <article
              key={card.label}
              className="rounded-2xl border border-gray-200 dark:border-gray-800 p-6"
            >
              <p className="text-xs font-medium uppercase tracking-widest text-gray-500 dark:text-gray-400">
                {card.label}
              </p>
              <h3 className="mt-2 font-semibold text-gray-900 dark:text-gray-100">
                {card.title}
              </h3>
              <p className="mt-3 text-sm leading-relaxed text-gray-600 dark:text-gray-400">
                {card.body}
              </p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
