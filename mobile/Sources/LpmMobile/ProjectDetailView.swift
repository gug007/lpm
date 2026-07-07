import SwiftUI

/// A project's screen: a hero card with the project's identity + a single primary
/// Start/Stop action, then its open terminals as tappable cards. Custom layout
/// (not a stock grouped List) for a cleaner, more modern feel.
struct ProjectDetail: View {
    @EnvironmentObject var model: AppModel
    let project: Project

    private var terminals: [TerminalInfo] { model.terminals[project.name] ?? [] }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 26) {
                ProjectHeroCard(project: project) {
                    project.running ? model.stopProject(project) : model.startProject(project)
                }

                VStack(alignment: .leading, spacing: 12) {
                    DetailSectionHeader(title: "Terminals", count: terminals.count)
                    if terminals.isEmpty {
                        EmptyTerminalsCard()
                    } else {
                        VStack(spacing: 10) {
                            ForEach(terminals) { t in
                                NavigationLink { TerminalScreen(term: t) } label: {
                                    TerminalCard(term: t)
                                }
                                .buttonStyle(.plain)
                            }
                        }
                    }
                }
            }
            .padding(20)
        }
        .background(Color(.systemGroupedBackground))
        .navigationTitle(project.label)
        .navigationBarTitleDisplayMode(.inline)
        .onAppear { model.loadTerminals(project.name) }
    }
}

/// Identity + primary action. The avatar seeds its tint from the project name so
/// projects are visually distinct at a glance.
private struct ProjectHeroCard: View {
    let project: Project
    let onToggle: () -> Void

    private var running: Bool { project.running }

    private var tint: SwiftUI.Color {
        let palette: [SwiftUI.Color] = [.blue, .purple, .pink, .orange, .teal, .indigo, .green]
        return palette[abs(project.name.hashValue) % palette.count]
    }

    var body: some View {
        VStack(spacing: 18) {
            HStack(spacing: 14) {
                Text(String(project.label.prefix(1)).uppercased())
                    .font(.system(size: 24, weight: .bold, design: .rounded))
                    .foregroundStyle(.white)
                    .frame(width: 56, height: 56)
                    .background(
                        LinearGradient(colors: [tint, tint.opacity(0.7)],
                                       startPoint: .topLeading, endPoint: .bottomTrailing)
                    )
                    .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))

                VStack(alignment: .leading, spacing: 5) {
                    Text(project.label)
                        .font(.system(size: 22, weight: .bold))
                        .lineLimit(1)
                    HStack(spacing: 6) {
                        RunningDot(running: running, size: 7)
                        Text(running ? "Running" : "Stopped")
                            .font(.system(size: 14, weight: .medium))
                            .foregroundStyle(.secondary)
                    }
                }
                Spacer(minLength: 0)
            }

            Button(action: onToggle) {
                HStack(spacing: 8) {
                    Image(systemName: running ? "stop.fill" : "play.fill")
                    Text(running ? "Stop" : "Start")
                }
                .font(.system(size: 16, weight: .semibold))
                .frame(maxWidth: .infinity)
                .padding(.vertical, 14)
                .foregroundStyle(running ? SwiftUI.Color.red : .white)
                .background(running ? SwiftUI.Color.red.opacity(0.12) : SwiftUI.Color.green)
                .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
            }
        }
        .padding(18)
        .card(radius: 22)
    }
}

private struct DetailSectionHeader: View {
    let title: String
    let count: Int

    var body: some View {
        HStack(spacing: 6) {
            Text(title.uppercased())
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(.secondary)
            if count > 0 {
                Text("\(count)")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(.tertiary)
                    .monospacedDigit()
            }
            Spacer()
        }
        .padding(.horizontal, 4)
    }
}

private struct TerminalCard: View {
    let term: TerminalInfo

    var body: some View {
        HStack(spacing: 14) {
            Image(systemName: "terminal.fill")
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(.secondary)
                .frame(width: 40, height: 40)
                .background(Color(.tertiarySystemGroupedBackground))
                .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))

            Text(term.label)
                .font(.system(size: 16, weight: .medium))
                .foregroundStyle(.primary)
                .lineLimit(1)

            Spacer(minLength: 8)

            if term.remote {
                Text("remote")
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(.secondary)
                    .padding(.horizontal, 7).padding(.vertical, 3)
                    .background(Color(.tertiarySystemGroupedBackground))
                    .clipShape(Capsule())
            }
            Image(systemName: "chevron.right")
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(.tertiary)
        }
        .padding(14)
        .card()
    }
}

private struct EmptyTerminalsCard: View {
    var body: some View {
        HStack(spacing: 10) {
            Image(systemName: "terminal")
                .font(.system(size: 15))
                .foregroundStyle(.tertiary)
            Text("No open terminals")
                .font(.system(size: 15))
                .foregroundStyle(.secondary)
            Spacer()
        }
        .padding(16)
        .frame(maxWidth: .infinity)
        .card()
    }
}

private extension View {
    /// The shared card chrome: a grouped-background fill clipped to a continuous
    /// rounded rectangle. Callers add their own padding.
    func card(radius: CGFloat = 16) -> some View {
        background(Color(.secondarySystemGroupedBackground))
            .clipShape(RoundedRectangle(cornerRadius: radius, style: .continuous))
    }
}
