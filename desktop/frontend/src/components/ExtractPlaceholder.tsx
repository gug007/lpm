interface ExtractPlaceholderProps {
  compact: boolean;
}

// Takes no room: a gap that opened would slide the row's buttons away from
// the places the drag measured them at. A zero-width item whose negative
// margin cancels the row's gap, with a bar drawn down the middle of that gap.
// The bar reaches past the row so it shows above and below the dragged
// button, which is centred on the pointer right over it.
export function ExtractPlaceholder({ compact }: ExtractPlaceholderProps) {
  return (
    <div aria-hidden className={`relative w-0 shrink-0 ${compact ? "-mr-1 h-[26px]" : "-mr-2 h-8"}`}>
      <span
        className={`absolute -inset-y-2 flex w-0.5 flex-col items-center justify-between rounded-full bg-[var(--accent-blue)] ${
          compact ? "-left-[3px]" : "-left-[5px]"
        }`}
      >
        <span className="-mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--accent-blue)]" />
        <span className="-mb-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--accent-blue)]" />
      </span>
    </div>
  );
}
