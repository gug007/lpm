import { Fragment, type ReactNode } from "react";

type Props = {
  items: ReactNode[];
  stackOnMobile?: boolean;
  wideTail?: ReactNode;
};

const DOT = "leading-none text-gray-300 dark:text-gray-700";

// A wrapped row would leave a dot hanging at a line end, so rows that may not
// fit a phone stack there instead and only show dots from sm up. A wide tail
// joins only from lg up and carries its own dot, for the same reason.
export function DotRow({ items, stackOnMobile = false, wideTail }: Props) {
  const shown = items.filter(Boolean);
  const layout = stackOnMobile
    ? "flex flex-col gap-y-1 sm:flex-row sm:flex-wrap"
    : "inline-flex flex-wrap";
  return (
    <span className={`${layout} items-center justify-center gap-x-2`}>
      {shown.map((item, index) => (
        <Fragment key={index}>
          {index > 0 && (
            <span
              className={`${DOT} ${stackOnMobile ? "hidden sm:inline" : ""}`}
              aria-hidden
            >
              ·
            </span>
          )}
          {item}
        </Fragment>
      ))}
      {wideTail && (
        <span className="hidden items-center gap-x-2 lg:inline-flex">
          <span className={DOT} aria-hidden>
            ·
          </span>
          {wideTail}
        </span>
      )}
    </span>
  );
}
