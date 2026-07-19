import Charts
import SwiftUI

/// The Stats screen: local agent token-usage for the paired Mac, mirroring the
/// desktop Stats page. Pushed as a NavigationLink destination, so it only sets an
/// inline title and leans on the wrapping NavigationStack.
///
/// A period segmented control sits at the top; below it a scroll of grouped-style
/// cards: four summary tiles, a daily activity chart, provider / project
/// breakdowns, recent sessions, and a privacy footer. While a reload is in flight
/// with data already on screen, the content dims rather than blanking.
struct StatsScreen: View {
    @Environment(AppModel.self) private var model

    private let periods: [(days: Int, label: String)] = [
        (1, "Today"), (7, "7 days"), (30, "30 days"), (0, "All time"),
    ]

    var body: some View {
        ScrollView {
            VStack(spacing: 16) {
                periodPicker
                stateContent
            }
            .padding(.horizontal, 16)
            .padding(.top, 10)
            .padding(.bottom, 28)
        }
        .background(Color(.systemGroupedBackground).ignoresSafeArea())
        .navigationTitle("Stats")
        .navigationBarTitleDisplayMode(.inline)
        .refreshable { await model.refreshStats() }
        .task { model.loadStats(days: model.statsDays) }
        .onDisappear { model.statsScreenDidClose() }
    }

    private var periodPicker: some View {
        Picker("Period", selection: Binding(
            get: { model.statsDays },
            set: { model.loadStats(days: $0) }
        )) {
            ForEach(periods, id: \.days) { period in
                Text(period.label).tag(period.days)
            }
        }
        .pickerStyle(.segmented)
    }

    @ViewBuilder
    private var stateContent: some View {
        if let stats = model.stats {
            StatsBody(stats: stats, days: model.statsDays)
                .opacity(model.statsLoading ? 0.6 : 1)
                .animation(.easeOut(duration: 0.2), value: model.statsLoading)
        } else if model.statsLoading {
            StatsLoadingSkeleton()
        } else if let error = model.statsError {
            StatsErrorCard(message: error) { model.loadStats(days: model.statsDays) }
        } else {
            StatsLoadingSkeleton()
        }
    }
}

// MARK: - Body

private struct StatsBody: View {
    let stats: AgentStats
    let days: Int

    private var chartDays: [UsageDaily] {
        days == 0 ? Array(stats.daily.suffix(28)) : stats.daily
    }
    private var totalFiles: Int {
        stats.sources.reduce(0) { $0 + $1.files }
    }

    var body: some View {
        VStack(spacing: 16) {
            if stats.totals.totalTokens == 0 {
                StatsEmptyCard()
            } else {
                StatsSummaryTiles(stats: stats, days: days)
                if !chartDays.isEmpty {
                    DailyActivityCard(daily: chartDays)
                }
                ProviderBreakdownCard(providers: stats.providers, total: stats.totals.totalTokens)
                TopProjectsCard(projects: stats.projects, days: days)
                RecentSessionsCard(sessions: stats.recentSessions, days: days)
            }
            StatsFooter(totalFiles: totalFiles)
        }
    }
}

// MARK: - Summary tiles

private struct StatsSummaryTiles: View {
    let stats: AgentStats
    let days: Int

    private var columns: [GridItem] {
        [GridItem(.flexible(), spacing: 12), GridItem(.flexible(), spacing: 12)]
    }

    var body: some View {
        let totals = stats.totals
        let peak = mostActiveDay(stats.daily)
        let cache = cacheShare(totals)
        let reasoning = reasoningShare(totals)
        let cost = estimateTotalCost(stats.models)
        let singleDay = days == 1
        let modelCount = distinctModelCount(stats.recentSessions)
        let projectCount = stats.projects.count

        LazyVGrid(columns: columns, spacing: 12) {
            StatTile(
                label: "Total tokens",
                value: formatTokenCount(totals.totalTokens),
                aside: cost > 0 ? "≈ \(formatUsd(cost))" : nil,
                caption: singleDay
                    ? "so far today"
                    : peak.map { "peak \(formatTokenCount($0.totalTokens)) · \(shortUsageDate($0.date))" }
            )

            StatTile(
                label: "Input",
                value: formatTokenCount(totals.inputTokens),
                caption: cache > 0 ? "\(formatPercent(cache)) from cache" : "no cache"
            ) {
                if cache > 0 {
                    ShareBar(fraction: cache, color: .accentColor)
                }
            }

            StatTile(
                label: "Output",
                value: formatTokenCount(totals.outputTokens),
                caption: reasoning > 0 ? "\(formatPercent(reasoning)) reasoning" : "no reasoning tokens"
            )

            StatTile(
                label: "Sessions",
                value: stats.sessions.formatted(),
                caption: "\(projectCount) project\(projectCount == 1 ? "" : "s") · \(modelCount) model\(modelCount == 1 ? "" : "s")"
            )
        }
    }
}

private struct StatTile<Accessory: View>: View {
    let label: String
    let value: String
    var aside: String? = nil
    var caption: String? = nil
    @ViewBuilder var accessory: () -> Accessory

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(label.uppercased())
                .font(.caption2.weight(.semibold))
                .foregroundStyle(.secondary)
                .lineLimit(1)

            HStack(alignment: .firstTextBaseline, spacing: 6) {
                Text(value)
                    .font(.title2.weight(.semibold))
                    .monospacedDigit()
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
                if let aside {
                    Text(aside)
                        .font(.subheadline.weight(.medium))
                        .foregroundStyle(.secondary)
                        .monospacedDigit()
                        .lineLimit(1)
                }
            }

            accessory()

            if let caption {
                Text(caption)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
            }
        }
        .frame(maxWidth: .infinity, minHeight: 84, alignment: .topLeading)
        .padding(14)
        .background(Color(.secondarySystemGroupedBackground),
                    in: RoundedRectangle(cornerRadius: 16, style: .continuous))
    }
}

extension StatTile where Accessory == EmptyView {
    init(label: String, value: String, aside: String? = nil, caption: String? = nil) {
        self.init(label: label, value: value, aside: aside, caption: caption) { EmptyView() }
    }
}

// MARK: - Shared bar

private struct ShareBar: View {
    var fraction: Double
    var color: Color
    var height: CGFloat = 5

    var body: some View {
        GeometryReader { geo in
            ZStack(alignment: .leading) {
                Capsule().fill(Color(.tertiarySystemFill))
                Capsule()
                    .fill(color)
                    .frame(width: max(0, min(1, fraction)) * geo.size.width)
            }
        }
        .frame(height: height)
    }
}

// MARK: - Daily activity chart

private struct DailyPoint: Identifiable {
    let id: String
    let day: Date
    let provider: String
    let tokens: Int
}

private struct DailyActivityCard: View {
    let daily: [UsageDaily]

    private var points: [DailyPoint] {
        daily.flatMap { day -> [DailyPoint] in
            guard let date = parseUsageDate(day.date) else { return [] }
            return [
                DailyPoint(id: "\(day.date)-claude", day: date,
                           provider: providerMeta("claude").short, tokens: day.claudeTokens),
                DailyPoint(id: "\(day.date)-codex", day: date,
                           provider: providerMeta("codex").short, tokens: day.codexTokens),
            ]
        }
    }

    private var strideDays: Int {
        switch daily.count {
        case ..<8: return 1
        case ..<15: return 2
        default: return 7
        }
    }

    var body: some View {
        SectionCard(title: "Token activity") {
            Chart(points) { point in
                BarMark(
                    x: .value("Day", point.day, unit: .day),
                    y: .value("Tokens", point.tokens)
                )
                .foregroundStyle(by: .value("Provider", point.provider))
            }
            .chartForegroundStyleScale([
                providerMeta("claude").short: providerMeta("claude").color,
                providerMeta("codex").short: providerMeta("codex").color,
            ])
            .chartLegend(position: .top, alignment: .leading, spacing: 8)
            .chartYAxis {
                AxisMarks(position: .leading) { value in
                    AxisGridLine()
                    AxisValueLabel {
                        if let raw = value.as(Double.self) {
                            Text(formatTokenCount(Int(raw)))
                        }
                    }
                }
            }
            .chartXAxis {
                AxisMarks(values: .stride(by: .day, count: strideDays)) { _ in
                    AxisGridLine()
                    AxisValueLabel(format: .dateTime.month(.abbreviated).day())
                }
            }
            .frame(height: 200)
        }
    }
}

// MARK: - Provider breakdown

private struct ProviderBreakdownCard: View {
    let providers: [UsageBreakdown]
    let total: Int

    private var sorted: [UsageBreakdown] {
        providers.sorted { $0.tokens.totalTokens > $1.tokens.totalTokens }
    }

    var body: some View {
        SectionCard(title: "Providers") {
            if sorted.isEmpty {
                EmptyRow(text: "No provider usage yet")
            } else {
                VStack(spacing: 14) {
                    ForEach(sorted) { provider in
                        let meta = providerMeta(provider.key)
                        let share = Double(provider.tokens.totalTokens) / Double(max(1, total))
                        VStack(alignment: .leading, spacing: 6) {
                            HStack(spacing: 8) {
                                Circle().fill(meta.color).frame(width: 9, height: 9)
                                Text(meta.label).font(.subheadline.weight(.medium))
                                Spacer(minLength: 8)
                                Text(formatTokenCount(provider.tokens.totalTokens))
                                    .font(.subheadline.weight(.semibold))
                                    .monospacedDigit()
                            }
                            ShareBar(fraction: share, color: meta.color)
                            Text("\(provider.sessions) session\(provider.sessions == 1 ? "" : "s") · \(formatPercent(share))")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                                .monospacedDigit()
                        }
                    }
                }
            }
        }
    }
}

// MARK: - Top projects

private struct TopProjectsCard: View {
    let projects: [UsageBreakdown]
    let days: Int

    private static let cap = 8

    private var sorted: [UsageBreakdown] {
        projects.sorted { $0.tokens.totalTokens > $1.tokens.totalTokens }
    }
    private var maxTokens: Int {
        max(1, projects.map(\.tokens.totalTokens).max() ?? 0)
    }

    var body: some View {
        SectionCard(title: "Top projects") {
            if projects.isEmpty {
                EmptyRow(text: "Nothing in \(usagePeriodLabel(days))")
            } else {
                VStack(spacing: 12) {
                    ForEach(sorted.prefix(Self.cap)) { project in
                        let share = Double(project.tokens.totalTokens) / Double(maxTokens)
                        VStack(alignment: .leading, spacing: 5) {
                            HStack(spacing: 8) {
                                Text(project.label)
                                    .font(.subheadline.weight(.medium))
                                    .lineLimit(1)
                                Spacer(minLength: 8)
                                Text(formatTokenCount(project.tokens.totalTokens))
                                    .font(.subheadline.weight(.semibold))
                                    .monospacedDigit()
                            }
                            ShareBar(fraction: share, color: .accentColor)
                            Text("\(project.sessions) session\(project.sessions == 1 ? "" : "s")")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                                .monospacedDigit()
                        }
                    }
                    if projects.count > Self.cap {
                        Text("+\(projects.count - Self.cap) more")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }
                }
            }
        }
    }
}

// MARK: - Recent sessions

private struct RecentSessionsCard: View {
    let sessions: [UsageSession]
    let days: Int

    private static let cap = 10

    var body: some View {
        SectionCard(title: "Recent sessions") {
            if sessions.isEmpty {
                EmptyRow(text: "Nothing in \(usagePeriodLabel(days))")
            } else {
                VStack(spacing: 0) {
                    ForEach(Array(sessions.prefix(Self.cap).enumerated()), id: \.offset) { index, session in
                        if index > 0 { Divider() }
                        SessionRow(session: session)
                            .padding(.vertical, 8)
                    }
                }
            }
        }
    }
}

private struct SessionRow: View {
    let session: UsageSession

    var body: some View {
        let meta = providerMeta(session.provider)
        HStack(spacing: 10) {
            Circle().fill(meta.color).frame(width: 9, height: 9)
            VStack(alignment: .leading, spacing: 3) {
                Text(session.project)
                    .font(.subheadline.weight(.medium))
                    .lineLimit(1)
                HStack(spacing: 6) {
                    Text(session.model)
                        .lineLimit(1)
                    Text("·")
                    Text(relativeUsageTime(session.lastAt))
                        .lineLimit(1)
                }
                .font(.caption)
                .foregroundStyle(.secondary)
            }
            Spacer(minLength: 8)
            Text(formatTokenCount(session.tokens.totalTokens))
                .font(.subheadline.weight(.semibold))
                .monospacedDigit()
        }
    }
}

// MARK: - Footer

private struct StatsFooter: View {
    let totalFiles: Int

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("Usage metadata stays on your Mac. Prompts and responses aren't included.")
            Text("\(totalFiles.formatted()) local history files scanned")
        }
        .font(.caption2)
        .foregroundStyle(.secondary)
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.top, 4)
    }
}

// MARK: - Empty / error / loading states

private struct StatsEmptyCard: View {
    var body: some View {
        VStack(spacing: 12) {
            Image(systemName: "chart.bar.xaxis")
                .font(.system(size: 34, weight: .regular))
                .foregroundStyle(.secondary)
            Text("No local agent usage found")
                .font(.headline)
            Text("lpm reads token usage from Claude Code and Codex session histories. Usage appears here after an agent runs inside a local project.")
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
            HStack(spacing: 16) {
                ForEach(["claude", "codex"], id: \.self) { key in
                    let meta = providerMeta(key)
                    HStack(spacing: 6) {
                        Circle().fill(meta.color).frame(width: 8, height: 8)
                        Text(meta.label)
                    }
                }
            }
            .font(.caption)
            .foregroundStyle(.secondary)
            .padding(.top, 2)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 32)
        .padding(.horizontal, 20)
        .background(Color(.secondarySystemGroupedBackground),
                    in: RoundedRectangle(cornerRadius: 20, style: .continuous))
    }
}

private struct StatsErrorCard: View {
    let message: String
    let retry: () -> Void

    var body: some View {
        VStack(spacing: 12) {
            Image(systemName: "exclamationmark.triangle")
                .font(.system(size: 32))
                .foregroundStyle(.orange)
            Text("Couldn't load stats")
                .font(.headline)
            Text(message)
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

private struct StatsLoadingSkeleton: View {
    private var columns: [GridItem] {
        [GridItem(.flexible(), spacing: 12), GridItem(.flexible(), spacing: 12)]
    }

    var body: some View {
        VStack(spacing: 16) {
            LazyVGrid(columns: columns, spacing: 12) {
                ForEach(0..<4, id: \.self) { _ in
                    VStack(alignment: .leading, spacing: 10) {
                        SkeletonBar(width: 70, height: 10)
                        SkeletonBar(width: 96, height: 22)
                        SkeletonBar(width: 120, height: 9)
                    }
                    .frame(maxWidth: .infinity, minHeight: 84, alignment: .topLeading)
                    .padding(14)
                    .background(Color(.secondarySystemGroupedBackground),
                                in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                    .shimmer()
                }
            }

            ForEach([180, 150], id: \.self) { chartHeight in
                RoundedRectangle(cornerRadius: 20, style: .continuous)
                    .fill(Color(.secondarySystemGroupedBackground))
                    .frame(height: CGFloat(chartHeight))
                    .shimmer()
            }
        }
        .allowsHitTesting(false)
        .transition(.opacity)
    }
}

// MARK: - Building blocks

private struct SectionCard<Content: View>: View {
    let title: String
    @ViewBuilder var content: () -> Content

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(title)
                .font(.subheadline.weight(.semibold))
            content()
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(16)
        .background(Color(.secondarySystemGroupedBackground),
                    in: RoundedRectangle(cornerRadius: 20, style: .continuous))
    }
}

private struct EmptyRow: View {
    let text: String

    var body: some View {
        Text(text)
            .font(.caption)
            .foregroundStyle(.secondary)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.vertical, 4)
    }
}
