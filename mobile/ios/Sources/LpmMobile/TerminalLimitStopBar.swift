import SwiftUI

/// Above the composer when a Claude tab stopped at a usage limit, as the
/// desktop's bar: which account ran out, when it resets, and the account the
/// conversation can carry on with, moved only on a tap. A hold or one model's
/// limit offers no account.
struct TerminalLimitStopBar: View {
    @Environment(AppModel.self) private var model
    let term: TerminalInfo
    let stop: LimitStop

    private var tone: Color { ActionTint(stop.kind == "model" ? "amber" : "red")?.accent ?? .red }
    private var offer: LimitStop.Offer? {
        model.canSwitchTabAccounts && term.canSwitchAccount ? stop.offer : nil
    }

    var body: some View {
        TimelineView(.periodic(from: .now, by: 60)) { context in
            let now = context.date.timeIntervalSince1970 * 1000
            if stop.holds(now: now) {
                card(now: now)
            }
        }
    }

    private func card(now: Double) -> some View {
        let reset = stop.reset(now: now)
        return VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .top, spacing: 8) {
                Circle().fill(tone).frame(width: 6, height: 6).padding(.top, 6)
                VStack(alignment: .leading, spacing: 3) {
                    (Text(stop.headline).fontWeight(.semibold)
                        + Text(reset.isEmpty ? "" : " · \(reset)").foregroundStyle(.white.opacity(0.6)))
                        .font(.footnote)
                    Text(stop.detail(now: now))
                        .font(.caption)
                        .foregroundStyle(.white.opacity(0.55))
                }
                Spacer(minLength: 0)
                Button { model.dismissLimitStop(term) } label: {
                    Image(systemName: "xmark")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(.white.opacity(0.6))
                        .frame(width: 24, height: 24)
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Dismiss")
            }
            if let offer {
                Button { model.switchTerminalAccount(term, to: offer.account, label: offer.label) } label: {
                    Text("Continue on \(offer.label)")
                        .font(.subheadline.weight(.semibold))
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 9)
                        .background(.white, in: RoundedRectangle(cornerRadius: 10))
                        .foregroundStyle(.black)
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("limit-stop-continue")
                if let accounts = model.claudeAccounts, accounts.hasAdded {
                    Menu {
                        TabClaudeAccountChoices(term: term, working: false, accounts: accounts)
                    } label: {
                        Text("Other account")
                            .font(.footnote)
                            .foregroundStyle(.white.opacity(0.7))
                            .frame(maxWidth: .infinity)
                    }
                }
            }
        }
        .padding(12)
        .background(tone.opacity(0.06), in: RoundedRectangle(cornerRadius: 14))
        .overlay(RoundedRectangle(cornerRadius: 14).strokeBorder(tone.opacity(0.4), lineWidth: 1))
        .padding(.horizontal, 10)
        .padding(.vertical, 8)
        .environment(\.colorScheme, .dark)
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("terminal-limit-stop")
    }
}
