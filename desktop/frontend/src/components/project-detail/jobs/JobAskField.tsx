import { modalInputClass } from "../../../forms/styles";
import {
  askParts,
  displayAnswer,
  type JobAskAnswer,
  type JobAskDraft,
  type JobAskQuestion,
} from "../../../jobAsk";
import { JobAskChoices } from "./JobAskChoices";
import { JobAskConfirm } from "./JobAskConfirm";
import { JobAskInput } from "./JobAskInput";

export interface JobAskFieldProps {
  question: JobAskQuestion;
  draft: JobAskDraft;
  onChange: (draft: JobAskDraft) => void;
  // Set when a click on yes, no or an option is the whole answer.
  onAnswer?: (answer: JobAskAnswer) => void;
  disabled?: boolean;
}

interface Props extends JobAskFieldProps {
  // The ask's only question: its text leads the card, and the deadline under
  // the card names its default.
  lead: boolean;
}

// One question and the way it's answered: yes and no, the options to pick
// from, or a box to write in.
export function JobAskField({ question: q, draft, onChange, onAnswer, disabled, lead }: Props) {
  const { headline, details } = askParts(q.text);
  return (
    <div className="mt-4 first:mt-0">
      <p
        className={`whitespace-pre-wrap font-semibold leading-snug text-[var(--text-primary)] ${
          lead ? "text-[15px]" : "text-[13px]"
        }`}
      >
        {headline}
        {q.optional && <span className="ml-1.5 text-[11px] font-normal text-[var(--text-muted)]">optional</span>}
      </p>
      {details && (
        <p className="mt-1.5 max-h-[40vh] overflow-y-auto whitespace-pre-wrap break-words text-[13px] leading-[1.5] text-[var(--text-secondary)]">
          {details}
        </p>
      )}
      {!lead && q.default !== undefined && (
        <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">
          Default: {displayAnswer(q, q.default)}
        </p>
      )}
      <div className="mt-2.5">
        {q.type === "confirm" ? (
          <JobAskConfirm question={q} draft={draft} onChange={onChange} onAnswer={onAnswer} disabled={disabled} />
        ) : q.type === "choice" ? (
          <JobAskChoices question={q} draft={draft} onChange={onChange} onAnswer={onAnswer} disabled={disabled} />
        ) : q.multiline ? (
          <textarea
            value={draft.text}
            onChange={(e) => onChange({ ...draft, text: e.target.value })}
            placeholder={q.placeholder}
            disabled={disabled}
            rows={3}
            className={`${modalInputClass} resize-y leading-relaxed`}
          />
        ) : (
          <JobAskInput
            value={draft.text}
            onChange={(e) => onChange({ ...draft, text: e.target.value })}
            placeholder={q.placeholder}
            disabled={disabled}
            className="min-h-10"
          />
        )}
      </div>
    </div>
  );
}
