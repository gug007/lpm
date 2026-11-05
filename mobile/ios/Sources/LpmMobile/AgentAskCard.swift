import SwiftUI

/// Under an agent waiting on a choice: what it asks, read off its terminal, with
/// the agent's own options to answer from the list — the desktop sidebar's card
/// (SidebarAgentAsk.tsx), in its amber.
struct AgentAskCard: View {
    @Environment(AppModel.self) private var model
    let read: AgentDialogRead
    let dialog: AgentDialog
    /// Opens the agent's tab: a typed option is answered there.
    let open: () -> Void

    private var store: AgentDialogStore { model.agentDialogs }
    private var picking: String? { store.picking[read.terminalId] }
    private var answered: Bool { store.isAnswered(read) }
    private var error: String? { store.errors[read.terminalId] }
    private var busy: Bool { picking != nil || answered }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            if !dialog.question.isEmpty {
                Text(dialog.question)
                    .font(.subheadline.weight(.semibold))
                    .fixedSize(horizontal: false, vertical: true)
            }
            ForEach(Array(dialog.details.prefix(2).enumerated()), id: \.offset) { _, detail in
                Text(detail)
                    .font(.footnote.monospaced())
                    .foregroundStyle(.secondary)
                    .lineLimit(3)
            }
            ForEach(dialog.options) { option in
                optionButton(option)
            }
            if let error {
                Label(error, systemImage: "exclamationmark.circle")
                    .font(.footnote)
                    .foregroundStyle(.red)
                    .fixedSize(horizontal: false, vertical: true)
            } else if answered {
                Label("Sent", systemImage: "checkmark")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.orange.opacity(0.08), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .strokeBorder(Color.orange.opacity(0.3))
        }
        .accessibilityElement(children: .contain)
    }

    private func optionButton(_ option: AgentDialogOption) -> some View {
        Button {
            store.pick(option, of: read)
            if option.typed { open() }
        } label: {
            HStack(alignment: .firstTextBaseline, spacing: 10) {
                Text(option.key)
                    .font(.caption.weight(.semibold))
                    .monospacedDigit()
                    .foregroundStyle(.orange)
                    .frame(minWidth: 22, minHeight: 22)
                    .background(Color.orange.opacity(0.15), in: Circle())
                VStack(alignment: .leading, spacing: 2) {
                    Text(option.label)
                        .font(.subheadline)
                        .foregroundStyle(.primary)
                        .fixedSize(horizontal: false, vertical: true)
                    if !option.description.isEmpty {
                        Text(option.description)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
                Spacer(minLength: 4)
                if picking == option.key {
                    ProgressView().controlSize(.small)
                } else if option.typed {
                    Image(systemName: "keyboard")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 9)
            .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
            .background(Color(.secondarySystemGroupedBackground),
                        in: RoundedRectangle(cornerRadius: 10, style: .continuous))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(busy)
        .opacity(busy && picking != option.key ? 0.5 : 1)
        .accessibilityLabel("Option \(option.key): \(option.label)")
        .accessibilityHint(option.typed ? "Opens the tab to type an answer" : "Sends this answer to the agent")
    }
}
