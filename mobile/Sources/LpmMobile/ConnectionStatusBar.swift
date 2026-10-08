import SwiftUI

/// The bar over a screen for a problem a tap on this iPhone fixes, with that
/// fix. Connecting, and a Mac that's asleep or not answering, stay in the line
/// under the Mac's name.
struct ConnectionStatusBar: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        if let issue = model.link.barIssue {
            IssueContent(issue: issue, style: .bar)
                .padding(.horizontal, 16)
                .padding(.vertical, 12)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(.bar)
                .overlay(alignment: .bottom) { Divider() }
                .transition(.move(edge: .top).combined(with: .opacity))
        }
    }
}

/// An issue as a card, for screens that show it in place of their content.
struct IssueCard: View {
    let issue: ConnectionIssue
    var hidesDetails = false
    var onAction: ((IssueAction) -> Void)? = nil

    var body: some View {
        IssueContent(issue: issue, style: .card, hidesDetails: hidesDetails, onAction: onAction)
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color(uiColor: .secondarySystemGroupedBackground),
                        in: RoundedRectangle(cornerRadius: 18, style: .continuous))
    }
}

/// Icon, title, one sentence and the issue's buttons. Buttons go to the model
/// unless the host screen handles them itself.
struct IssueContent: View {
    enum Style { case bar, card }

    @Environment(AppModel.self) private var model
    let issue: ConnectionIssue
    let style: Style
    var hidesDetails = false
    var onAction: ((IssueAction) -> Void)? = nil

    private var copy: IssueCopy { issue.copy(mac: style == .bar ? model.link.macNoun : model.link.macLabel) }

    /// The bar leaves Details to the line under the Mac's name, which opens them.
    private var actions: [IssueAction] {
        copy.actions.filter { $0 != .details || !(hidesDetails || style == .bar) }
    }

    /// A bar with one fix puts it beside the words rather than under them.
    private var inlineAction: IssueAction? {
        style == .bar && actions.count == 1 ? actions[0] : nil
    }

    private var tint: Color { copy.tone == .waiting ? .orange : .red }

    private var message: String {
        if issue.isConnecting, let status = model.recoveryStatus { return status }
        if model.link.tailscaleWorking { return "Turning on Built-in Tailscale… Sign in once with your Tailscale account." }
        return copy.message
    }

    var body: some View {
        HStack(alignment: inlineAction == nil ? .top : .center, spacing: 12) {
            Group {
                if issue.isConnecting {
                    ProgressView().controlSize(.small)
                } else {
                    Image(systemName: copy.icon)
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(.white)
                }
            }
            .frame(width: 29, height: 29)
            .background(issue.isConnecting ? Color(.tertiarySystemFill) : tint,
                        in: RoundedRectangle(cornerRadius: 7, style: .continuous))

            VStack(alignment: .leading, spacing: 3) {
                Text(copy.title)
                    .font(style == .bar ? .subheadline.weight(.semibold) : .headline)
                Text(message)
                    .font(style == .bar ? .footnote : .subheadline)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
                if let failure = model.link.tailscaleFailure {
                    Text(failure).font(.footnote).foregroundStyle(.red)
                }
                if model.link.waitingCount > 0 && !model.link.pairing {
                    Text(model.link.waitingCount == 1 ? "1 action waiting for the Mac"
                                                      : "\(model.link.waitingCount) actions waiting for the Mac")
                        .font(.footnote.weight(.medium))
                        .foregroundStyle(.orange)
                }
                if !actions.isEmpty && inlineAction == nil {
                    HStack(spacing: 8) {
                        ForEach(Array(actions.enumerated()), id: \.offset) { index, action in
                            actionButton(action, primary: index == 0 && action != .details)
                        }
                    }
                    .padding(.top, 6)
                }
            }
            Spacer(minLength: 0)
            if let inlineAction {
                actionButton(inlineAction, primary: true)
            }
        }
    }

    @ViewBuilder
    private func actionButton(_ action: IssueAction, primary: Bool) -> some View {
        let label = Text(action.label(for: issue)).font(.footnote.weight(.semibold))
        let run = {
            if let onAction { onAction(action) } else { model.perform(action, for: issue) }
        }
        if primary && action == .retry && model.link.trying {
            Button(action: {}) {
                HStack(spacing: 6) {
                    ProgressView().controlSize(.mini)
                    Text("Trying…").font(.footnote.weight(.semibold))
                }
            }
            .buttonStyle(.borderedProminent)
            .buttonBorderShape(.capsule)
            .controlSize(.small)
            .disabled(true)
        } else if primary {
            Button(action: run) { label }
                .buttonStyle(.borderedProminent)
                .buttonBorderShape(.capsule)
                .controlSize(.small)
                .disabled(model.link.tailscaleWorking && (action == .turnOnTailscale || action == .signInTailscale))
        } else {
            Button(action: run) { label }
                .buttonStyle(.bordered)
                .buttonBorderShape(.capsule)
                .controlSize(.small)
        }
    }
}

/// Floating capsule over a terminal while the link is down: keystrokes and
/// scroll are dropped during a gap, so this is what says the frozen screen is the
/// connection and not a hung app. Same issue as the bar, with its first fix.
struct TerminalConnectionBanner: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        let issue = model.link.issue ?? .connecting(nil)
        let copy = issue.copy(mac: model.link.macLabel)
        let action = copy.actions.first { $0 != .details }
        HStack(spacing: 8) {
            if issue.isConnecting {
                ProgressView().controlSize(.small).tint(.white)
                Text("Reconnecting…")
            } else {
                Image(systemName: copy.icon)
                Text(copy.title).lineLimit(1)
                if let action {
                    Button(action.label(for: issue)) { model.perform(action, for: issue) }
                        .fontWeight(.semibold)
                }
            }
        }
        .font(.footnote)
        .foregroundStyle(.white)
        .padding(.horizontal, 14)
        .padding(.vertical, 8)
        .background(.black.opacity(0.6), in: Capsule())
        .overlay(Capsule().strokeBorder(.white.opacity(0.15)))
        .environment(\.colorScheme, .dark)
        .padding(.horizontal, 16)
    }
}
