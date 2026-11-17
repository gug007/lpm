import type { ReactNode } from "react";
import { SECTION_DESCRIPTION, CAPS_LABEL } from "./settings/sectionStyles";

export function StatusLineSection({
  title,
  description,
  children,
}: {
  title: string;
  description: ReactNode;
  children: ReactNode;
}) {
  return (
    <section>
      <div className="mb-2.5 px-0.5">
        <h2 className={CAPS_LABEL}>{title}</h2>
        <p className={SECTION_DESCRIPTION}>{description}</p>
      </div>
      {children}
    </section>
  );
}
