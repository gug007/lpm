import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { PageHeader, type PageBack } from "../ui/PageHeader";

export const SUBPAGE_COLUMN = "mx-auto w-full max-w-4xl px-6";

interface ProjectSubpageProps {
  back: PageBack;
  title: ReactNode;
  icon?: LucideIcon;
  description?: ReactNode;
  actions?: ReactNode;
  // Controls for the page's content, on a row of their own under the header.
  toolbar?: ReactNode;
  // false when the page lays out its own body under the header (an editor
  // that fills the height, a list over a docked composer).
  scroll?: boolean;
  children: ReactNode;
}

// A project's own page in place of its terminals (Config, Notes, AI
// Instructions): one header, column and spacing for all of them.
export function ProjectSubpage({
  back,
  title,
  icon,
  description,
  actions,
  toolbar,
  scroll = true,
  children,
}: ProjectSubpageProps) {
  const header = (
    <>
      <PageHeader
        back={back}
        title={title}
        icon={icon}
        description={description}
        actions={actions}
        className="mb-5"
      />
      {toolbar && <div className="-mt-1 mb-5">{toolbar}</div>}
    </>
  );
  if (!scroll) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <div className={`${SUBPAGE_COLUMN} shrink-0 pt-5`}>{header}</div>
        <div className="flex min-h-0 flex-1 flex-col">{children}</div>
      </div>
    );
  }
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className={`${SUBPAGE_COLUMN} pb-12 pt-5`}>
        {header}
        {children}
      </div>
    </div>
  );
}
