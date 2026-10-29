import SwiftUI

/// The weekly recap, the desktop's "My agents' week" card: last week or this one
/// so far, or a month, ready to share as an image. Pushed from the Stats screen.
struct WeeklyRecapScreen: View {
    @Environment(AppModel.self) private var model

    private var store: WeeklyRecapStore { model.weeklyRecap }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                Text("Your agents' \(store.pick.period.rawValue), ready to share.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                pickers
                content
                footnote
            }
            // On an iPad the card stays at its own size rather than filling the screen.
            .frame(maxWidth: RecapCardStyle.width)
            .frame(maxWidth: .infinity)
            .padding(.horizontal, 16)
            .padding(.top, 10)
            .padding(.bottom, 28)
        }
        .background(Color(.systemGroupedBackground).ignoresSafeArea())
        .navigationTitle(store.pick.period == .month ? "Monthly recap" : "Weekly recap")
        .navigationBarTitleDisplayMode(.inline)
        .refreshable { await store.refresh() }
        .task { store.screenDidOpen() }
        .onDisappear { store.screenDidClose() }
    }

    /// Last or this, then week or month, read as one phrase: "Last week".
    private var pickers: some View {
        HStack(spacing: 8) {
            Picker("Which", selection: Binding(get: { store.pick.week },
                                               set: { store.show(RecapPick(week: $0, period: store.pick.period)) })) {
                Text("Last").tag(RecapWeek.last)
                Text("This").tag(RecapWeek.this)
            }
            if model.canShowRecapMonth {
                Picker("Period", selection: Binding(get: { store.pick.period },
                                                    set: { store.show(RecapPick(week: store.pick.week, period: $0)) })) {
                    Text("Week").tag(RecapPeriod.week)
                    Text("Month").tag(RecapPeriod.month)
                }
            }
        }
        .pickerStyle(.segmented)
    }

    @ViewBuilder
    private var content: some View {
        let pick = store.pick
        if let error = store.errors[pick] {
            RecapErrorCard(message: error, period: pick.period) { store.load(pick) }
        } else if let recap = store.recaps[pick] {
            let card = RecapCardModel(recap)
            if card.empty {
                RecapEmptyCard(pick: pick) { store.show(RecapPick(week: .this, period: pick.period)) }
            } else {
                RecapCardShare(card: card)
                    .opacity(store.loading.contains(pick) ? 0.6 : 1)
                    .animation(.easeOut(duration: 0.2), value: store.loading.contains(pick))
            }
        } else {
            RecapLoadingCard()
        }
    }

    private var footnote: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("Names no projects, and nothing is uploaded: you add the card to the post yourself.")
            if let missing = store.recaps[store.pick]?.missing, !missing.isEmpty {
                Text(Self.missingNote(missing, period: store.pick.period))
            }
        }
        .font(.caption2)
        .foregroundStyle(.secondary)
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private static func missingNote(_ names: [String], period: RecapPeriod) -> String {
        let list = names.formatted(.list(type: .and).locale(Locale(identifier: "en_US")))
        return "Not counted: \(list), which couldn't send \(names.count == 1 ? "its" : "their") \(period.rawValue)."
    }
}

/// The card, then the button that shares it.
private struct RecapCardShare: View {
    let card: RecapCardModel

    @State private var image: RecapShareImage?

    var body: some View {
        VStack(spacing: 16) {
            RecapCardFit(card: card)
            if let image {
                ShareLink(item: image, message: Text(card.caption),
                          preview: SharePreview(card.title, image: image.preview)) {
                    shareLabel
                }
                .buttonStyle(.borderedProminent)
                .controlSize(.large)
            } else {
                Button {} label: { shareLabel }
                    .buttonStyle(.borderedProminent)
                    .controlSize(.large)
                    .disabled(true)
            }
        }
        .task(id: card) { image = RecapShareImage(card) }
    }

    private var shareLabel: some View {
        Label("Share", systemImage: "square.and.arrow.up")
            .frame(maxWidth: .infinity)
    }
}

/// A card-shaped placeholder while the Mac reads the week or month.
private struct RecapLoadingCard: View {
    private typealias S = RecapCardStyle

    var body: some View {
        let shape = RoundedRectangle(cornerRadius: 10, style: .continuous)
        VStack(spacing: 12) {
            Capsule()
                .fill(S.border)
                .frame(width: 120, height: 6)
                .shimmer()
            Text("Reading your agents' history…")
                .font(.footnote)
                .foregroundStyle(S.muted)
        }
        .frame(maxWidth: .infinity)
        .aspectRatio(S.width / 438, contentMode: .fit)
        .background(S.ground, in: shape)
        .overlay(shape.strokeBorder(S.border, lineWidth: 1))
        .transition(.opacity)
    }
}

private struct RecapEmptyCard: View {
    let pick: RecapPick
    let seeThisWeek: () -> Void

    var body: some View {
        VStack(spacing: 10) {
            Image(systemName: "calendar")
                .font(.system(size: 32))
                .foregroundStyle(.secondary)
            let period = pick.period.rawValue
            Text(pick.week == .last ? "No agent work last \(period)" : "No agent work this \(period) yet")
                .font(.headline)
            Text("The recap counts Claude Code and Codex sessions run in your projects.")
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
            if pick.week == .last {
                Button("See this \(period) so far", action: seeThisWeek)
                    .font(.subheadline.weight(.medium))
                    .padding(.top, 2)
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 32)
        .padding(.horizontal, 20)
        .background(Color(.secondarySystemGroupedBackground),
                    in: RoundedRectangle(cornerRadius: 20, style: .continuous))
    }
}

private struct RecapErrorCard: View {
    let message: String
    let period: RecapPeriod
    let retry: () -> Void

    var body: some View {
        VStack(spacing: 12) {
            Image(systemName: "exclamationmark.triangle")
                .font(.system(size: 32))
                .foregroundStyle(.orange)
            Text("Couldn't read the \(period.rawValue): \(message)")
                .font(.subheadline)
                .multilineTextAlignment(.center)
            Button("Try again", action: retry)
                .buttonStyle(.borderedProminent)
                .buttonBorderShape(.capsule)
                .padding(.top, 2)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 32)
        .padding(.horizontal, 20)
        .background(Color(.secondarySystemGroupedBackground),
                    in: RoundedRectangle(cornerRadius: 20, style: .continuous))
    }
}
