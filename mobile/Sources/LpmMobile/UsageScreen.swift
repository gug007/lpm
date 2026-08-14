import SwiftUI

/// The Usage screen: how much of each AI coding tool's plan has been used in the
/// current 5-hour and weekly windows on the paired Mac, mirroring the desktop
/// Usage page. Pushed as a NavigationLink destination, so it only sets an inline
/// title and leans on the wrapping NavigationStack.
///
/// The reset countdowns have to keep moving without new data arriving, so the
/// whole body is driven by a 30-second clock. While a reload is in flight with
/// cards already on screen, the content dims rather than blanking.
///
/// The screen reads two clocks. A window's turnover time is stamped by the tool's
/// own servers, so the meters are judged against the phone's clock — the same one
/// the absolute reset time is printed in. Only "last reported" is stamped by the
/// Mac, so that one comparison is shifted onto the Mac's clock.
struct UsageScreen: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        TimelineView(.periodic(from: .now, by: 30)) { context in
            ScrollView {
                VStack(spacing: 16) {
                    stateContent(
                        now: context.date.timeIntervalSince1970 * 1000,
                        macNow: model.usage.macMillis(context.date)
                    )
                }
                .padding(.horizontal, 16)
                .padding(.top, 10)
                .padding(.bottom, 28)
            }
        }
        .background(Color(.systemGroupedBackground).ignoresSafeArea())
        .navigationTitle("Usage")
        .navigationBarTitleDisplayMode(.inline)
        .refreshable { await model.usage.refresh() }
        .task { model.usage.screenDidOpen() }
        .onDisappear { model.usage.screenDidClose() }
    }

    @ViewBuilder
    private func stateContent(now: Double, macNow: Double) -> some View {
        let usage = model.usage

        if let snapshot = usage.snapshot {
            if let error = usage.error {
                UsageRefreshBanner(message: error) {
                    Task { await usage.refresh() }
                }
            }
            VStack(spacing: 16) {
                cards(snapshot, now: now, macNow: macNow)
            }
            .opacity(usage.loading ? 0.6 : 1)
            .animation(.easeOut(duration: 0.2), value: usage.loading)
        } else if usage.loading {
            UsageSkeleton()
        } else if let error = usage.error {
            UsageErrorCard(message: error) {
                Task { await usage.refresh() }
            }
        } else {
            UsageSkeleton()
        }
    }

    @ViewBuilder
    private func cards(_ snapshot: LimitsSnapshot, now: Double, macNow: Double) -> some View {
        let claude = snapshot.claudeEnabled ? claudeCards(snapshot) : []

        ForEach(claude, id: \.key) { card in
            UsageProviderCardView(
                data: card.data,
                now: now,
                macNow: macNow,
                title: card.title,
                subtitle: card.subtitle
            )
        }

        if claude.isEmpty {
            if snapshot.claudeEnabled {
                UsageEmptyPanel(
                    provider: "claude",
                    name: "Claude",
                    dim: true,
                    text: "Waiting for a Claude session. Your usage appears here as soon as you run Claude in a project."
                )
            } else {
                UsageEmptyPanel(
                    provider: "claude",
                    name: "Claude",
                    dim: false,
                    text: "Claude usage is off on this Mac. Turn it on in lpm on your Mac and the meters appear here."
                )
            }
        }

        if let codex = codexEntry(snapshot) {
            UsageProviderCardView(data: codex, now: now, macNow: macNow, title: "Codex")
        } else {
            UsageEmptyPanel(
                provider: "codex",
                name: "Codex",
                dim: true,
                text: "Codex usage appears here automatically the first time you run Codex in a project."
            )
        }

        Text("Live plan usage for your AI coding tools")
            .font(.caption2)
            .foregroundStyle(.secondary)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.top, 4)
    }
}

// MARK: - Empty panel

/// Placeholder for a tool with nothing to show yet — dashed rather than solid so
/// it never reads as a card whose meters happen to be empty.
private struct UsageEmptyPanel: View {
    let provider: String
    let name: String
    let dim: Bool
    let text: String

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 8) {
                Circle()
                    .fill(providerMeta(provider).color)
                    .frame(width: 8, height: 8)
                    .opacity(dim ? 0.35 : 0.6)
                Text(name)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(.secondary)
            }
            Text(text)
                .font(.footnote)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(16)
        .background(
            RoundedRectangle(cornerRadius: 20, style: .continuous)
                .strokeBorder(Color(.separator), style: StrokeStyle(lineWidth: 1, dash: [5, 4]))
        )
        .accessibilityElement(children: .combine)
    }
}

// MARK: - Error / loading states

/// Shown above cards that are still on screen when a refresh fails: without it
/// the dim simply lifts and hours-old percentages read as current.
private struct UsageRefreshBanner: View {
    let message: String
    let retry: () -> Void

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            Image(systemName: "exclamationmark.triangle.fill")
                .font(.footnote)
                .foregroundStyle(.orange)
                .padding(.top, 1)

            VStack(alignment: .leading, spacing: 6) {
                Text("Couldn't refresh — these are the last numbers your Mac sent.")
                    .font(.footnote)
                    .foregroundStyle(.primary)
                    .fixedSize(horizontal: false, vertical: true)

                if message != usageGenericError, !message.isEmpty {
                    Text(message)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }

                Button("Try Again", action: retry)
                    .font(.footnote.weight(.medium))
                    .buttonStyle(.plain)
                    .foregroundStyle(Color.accentColor)
            }

            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(12)
        .background(Color.orange.opacity(0.12),
                    in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .strokeBorder(Color.orange.opacity(0.3))
        )
    }
}

private struct UsageErrorCard: View {
    let message: String
    let retry: () -> Void

    var body: some View {
        VStack(spacing: 12) {
            Image(systemName: "exclamationmark.triangle")
                .font(.system(size: 32))
                .foregroundStyle(.orange)
            Text("Couldn't load usage")
                .font(.headline)
            Text(message == usageGenericError ? "Pull to refresh." : message)
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
            Button(action: retry) {
                Text("Try Again")
            }
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

private struct UsageSkeleton: View {
    var body: some View {
        VStack(spacing: 16) {
            ForEach(0..<2, id: \.self) { _ in
                VStack(alignment: .leading, spacing: 0) {
                    HStack(spacing: 8) {
                        Circle()
                            .fill(Color(.tertiarySystemFill))
                            .frame(width: 8, height: 8)
                        SkeletonBar(width: 84, height: 12)
                        Spacer()
                        SkeletonBar(width: 72, height: 10)
                    }
                    Divider().padding(.vertical, 12)
                    VStack(spacing: 18) {
                        ForEach(0..<2, id: \.self) { _ in
                            VStack(alignment: .leading, spacing: 8) {
                                SkeletonBar(width: 52, height: 9)
                                SkeletonBar(width: 74, height: 22)
                                SkeletonBar(height: 6)
                                SkeletonBar(width: 168, height: 10)
                            }
                            .frame(maxWidth: .infinity, alignment: .leading)
                        }
                    }
                }
                .padding(16)
                .background(Color(.secondarySystemGroupedBackground),
                            in: RoundedRectangle(cornerRadius: 20, style: .continuous))
                .shimmer()
            }
        }
        .allowsHitTesting(false)
        .transition(.opacity)
    }
}
