import { SegmentedControl } from "../../ui/SegmentedControl";
import { RowSelect } from "./RowSelect";
import { Card, Row, TIME_INPUT_CLASS } from "./JobFormRows";
import type { JobDraft } from "../../../jobsFormat";
import {
  EVENT_LIMIT_OPTIONS,
  EVENT_NOTES,
  EVENT_OPTIONS,
  type JobEventKind,
} from "../../../jobsEvents";

type NamesField = "eventBranches" | "eventServices" | "eventFrom";

const FILTERS: Record<JobEventKind, { label: string; field: NamesField; placeholder: string }> = {
  ciFailed: { label: "Branches", field: "eventBranches", placeholder: "Any branch" },
  serviceCrashed: { label: "Services", field: "eventServices", placeholder: "Any service" },
  agentFinished: { label: "In", field: "eventFrom", placeholder: "This project" },
};

const NAMES_CLASS = `${TIME_INPUT_CLASS} min-w-0 flex-1 placeholder:text-[var(--text-muted)]`;

// What starts a job instead of the clock, the names it listens to (several
// separated by commas), and how often one may start it.
export function EventScheduleRows({
  draft,
  patch,
  problem,
}: {
  draft: JobDraft;
  patch: (values: Partial<JobDraft>) => void;
  problem: string | null;
}) {
  const filter = FILTERS[draft.eventOn];
  return (
    <>
      <Card>
        <Row label="Event">
          <RowSelect
            ariaLabel="Event"
            value={draft.eventOn}
            onChange={(on) => patch({ eventOn: on as JobEventKind })}
            options={EVENT_OPTIONS}
          />
        </Row>
        <Row label={filter.label}>
          <input
            aria-label={filter.label}
            value={draft[filter.field]}
            placeholder={filter.placeholder}
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            onChange={(e) => patch({ [filter.field]: e.target.value } as Partial<JobDraft>)}
            className={NAMES_CLASS}
          />
        </Row>
        <Row label="At most">
          <SegmentedControl
            variant="subtle"
            ariaLabel="At most"
            value={draft.eventAtMost}
            onChange={(eventAtMost) => patch({ eventAtMost })}
            options={EVENT_LIMIT_OPTIONS}
          />
        </Row>
      </Card>
      <p className="mt-2 px-1 text-[12px] leading-snug text-[var(--text-muted)]">
        {EVENT_NOTES[draft.eventOn]}
      </p>
      {problem && (
        <p className="mt-1 px-1 text-[12px] leading-snug text-[var(--accent-amber-text)]">
          {problem}
        </p>
      )}
    </>
  );
}
