import SwiftUI

/// A question an automation put to the user: the answers stacked like an action
/// sheet while it is open, then what became of it. `framed` draws its own card,
/// for the conversation; in a list the row is the frame.
struct AutomationAskCard: View {
    @Environment(AppModel.self) private var model
    let ask: AutomationAsk
    /// Where the automation waits — the project the answer goes to.
    let project: String
    let jobId: String
    var framed = true

    @State private var drafts: [String: AutomationAskDraft] = [:]

    private var key: String { model.automationKey(project, jobId) }
    private var busy: Bool { model.automationPending.contains(key) }
    /// The sheet's rows stand out from what's behind them: the conversation's
    /// grouped background, or a list row's own fill.
    private var sheetFill: Color {
        framed ? Color(.secondarySystemGroupedBackground) : Color(.tertiarySystemGroupedBackground)
    }

    var body: some View {
        if framed {
            content
                .padding(14)
                .overlay(
                    RoundedRectangle(cornerRadius: 16, style: .continuous)
                        .strokeBorder(Color.secondary.opacity(0.25))
                )
        } else {
            content.padding(.vertical, 4)
        }
    }

    @ViewBuilder
    private var content: some View {
        if ask.isOpen { form } else { closed }
    }

    // MARK: Open

    private var form: some View {
        let state = automationAskAnswers(ask.questions, drafts)
        let lead = ask.questions.count == 1
        return VStack(spacing: 16) {
            ForEach(ask.questions) { q in
                VStack(alignment: .leading, spacing: 10) {
                    VStack(alignment: .leading, spacing: 2) {
                        let (headline, details) = automationAskParts(q.text)
                        (Text(headline) + Text(q.optional ? "  optional" : "")
                            .font(.caption)
                            .foregroundColor(.secondary))
                            .font(lead ? .headline : .subheadline.weight(.semibold))
                            .fixedSize(horizontal: false, vertical: true)
                        if !details.isEmpty {
                            Text(details)
                                .font(.subheadline)
                                .foregroundStyle(.secondary)
                                .fixedSize(horizontal: false, vertical: true)
                                .padding(.top, 4)
                        }
                        if !lead, let d = q.defaultAnswer {
                            Text("Default: \(automationAskDisplay(q, d))")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }
                    field(q)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            if !ask.answersOnTap {
                sheet {
                    row(lead ? "Send answer" : "Send answers", bold: true,
                        enabled: state.missing == nil) { send(state.answers) }
                }
            }
            if let error = model.automationAskError[key] {
                Text(error)
                    .font(.caption)
                    .foregroundStyle(.red)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .fixedSize(horizontal: false, vertical: true)
            }
            VStack(spacing: 4) {
                if ask.expiresAt != nil {
                    TimelineView(.periodic(from: .now, by: 60)) { context in
                        Text(automationAskDeadlineNote(ask, now: context.date))
                            .font(.caption)
                            .foregroundStyle(.secondary)
                            .multilineTextAlignment(.center)
                    }
                }
                Button("Skip question") {
                    model.dismissAutomationQuestion(project: project, jobId: jobId, askId: ask.id)
                }
                .font(.subheadline)
                .buttonStyle(.borderless)
                .foregroundStyle(.secondary)
                .disabled(busy)
            }
        }
    }

    @ViewBuilder
    private func field(_ q: AutomationAskQuestion) -> some View {
        let draft = Binding(
            get: { drafts[q.id] ?? AutomationAskDraft() },
            set: { drafts[q.id] = $0 }
        )
        switch q.type {
        case "confirm":
            if ask.answersOnTap {
                sheet {
                    row(q.yesLabel, bold: true) { send([q.id: true]) }
                    Divider()
                    row(q.noLabel) { send([q.id: false]) }
                }
            } else {
                HStack(spacing: 10) {
                    ForEach([("yes", q.yesLabel), ("no", q.noLabel)], id: \.0) { value, label in
                        let picked = draft.wrappedValue.picks.first == value
                        sheet {
                            row(label, picked: picked) {
                                draft.wrappedValue.picks = picked ? [] : [value]
                            }
                        }
                    }
                }
            }
        case "choice":
            VStack(spacing: 10) {
                sheet {
                    ForEach(Array(q.options.enumerated()), id: \.element) { i, option in
                        if i > 0 { Divider() }
                        let picked = draft.wrappedValue.picks.contains(option.label)
                        row(option.label, detail: option.description, picked: picked) {
                            if ask.answersOnTap {
                                send([q.id: [option.label]])
                            } else {
                                draft.wrappedValue = automationAskToggle(q, draft.wrappedValue, option.label)
                            }
                        }
                    }
                }
                if q.other { otherField(q, draft: draft) }
            }
        default:
            answerBox(q.placeholder.isEmpty ? "Your answer" : q.placeholder,
                      text: Binding(get: { draft.wrappedValue.text },
                                    set: { draft.wrappedValue.text = $0 }),
                      lines: q.multiline ? 3...8 : 1...4)
        }
    }

    private func otherField(_ q: AutomationAskQuestion, draft: Binding<AutomationAskDraft>) -> some View {
        let text = Binding(
            get: { draft.wrappedValue.other },
            set: { value in
                var next = draft.wrappedValue
                next.other = value
                if !q.multiple, !value.isEmpty { next.picks = [] }
                draft.wrappedValue = next
            }
        )
        let own = draft.wrappedValue.other.trimmingCharacters(in: .whitespacesAndNewlines)
        return HStack(spacing: 10) {
            answerBox("Something else…", text: text, lines: 1...4)
            if ask.answersOnTap {
                sheet {
                    row("Send", bold: true, enabled: !own.isEmpty) { send([q.id: [own]]) }
                }
                .frame(width: 84)
            }
        }
    }

    private func answerBox(_ prompt: String, text: Binding<String>, lines: ClosedRange<Int>) -> some View {
        TextField(prompt, text: text, axis: .vertical)
            .lineLimit(lines)
            .padding(.horizontal, 14)
            .padding(.vertical, 13)
            .background(sheetFill, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
            .disabled(busy)
    }

    /// Rows on one rounded fill, split by hairlines — the action sheet's look.
    private func sheet<Rows: View>(@ViewBuilder _ rows: () -> Rows) -> some View {
        VStack(spacing: 0) { rows() }
            .background(sheetFill, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
    }

    private func row(_ label: String, detail: String = "", bold: Bool = false, picked: Bool = false,
                     enabled: Bool = true, action: @escaping () -> Void) -> some View {
        Button {
            Haptics.tap()
            action()
        } label: {
            VStack(spacing: 2) {
                Text(label)
                    .font(.body.weight(bold ? .semibold : .regular))
                    .foregroundStyle(enabled ? Color.accentColor : Color.secondary)
                if !detail.isEmpty {
                    Text(detail)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
            .multilineTextAlignment(.center)
            .frame(maxWidth: .infinity, minHeight: 50)
            .padding(.horizontal, 36)
            .padding(.vertical, detail.isEmpty ? 0 : 6)
            .background(picked ? Color.accentColor.opacity(0.14) : .clear)
            .overlay(alignment: .trailing) {
                if picked {
                    Image(systemName: "checkmark")
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(Color.accentColor)
                        .padding(.trailing, 14)
                }
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(picked ? .isSelected : [])
        .disabled(busy || !enabled)
    }

    private func send(_ answers: [String: Any]) {
        model.answerAutomationQuestion(project: project, jobId: jobId, askId: ask.id, answers: answers)
    }

    // MARK: Closed

    private var closed: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 7) {
                Circle().fill(Color.secondary).frame(width: 7, height: 7)
                Text(ask.statusLabel)
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.secondary)
                Spacer(minLength: 8)
                Text(automationClockText(ask.answeredAt ?? ask.askedAt))
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            VStack(alignment: .leading, spacing: 6) {
                ForEach(ask.questions) { q in
                    let answer = automationAskDisplay(q, ask.answers[q.id])
                    (Text(q.text).foregroundStyle(answer.isEmpty ? Color.secondary : Color.primary.opacity(0.75))
                        + Text(answer.isEmpty ? "" : " → ")
                        + Text(answer).fontWeight(.semibold))
                        .font(.subheadline)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
        }
    }
}
