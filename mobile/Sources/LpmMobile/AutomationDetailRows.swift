import SwiftUI

/// The one line that answers "what is this doing right now" — running (with a
/// clock), paused, broken, or waiting for a moment it names.
struct AutomationStatusPill: View {
    let job: AutomationJob

    var body: some View {
        if job.running, let since = job.runningSince {
            TimelineView(.periodic(from: .now, by: 1)) { context in
                pill(text: "Running for \(automationElapsedText(since: since, now: context.date))")
            }
        } else {
            pill(text: text)
        }
    }

    private func pill(text: String) -> some View {
        HStack(spacing: 7) {
            if job.running {
                ProgressView().controlSize(.mini)
            } else {
                Circle().fill(tint).frame(width: 8, height: 8)
            }
            Text(text)
                .font(.footnote.weight(.medium))
                .lineLimit(1)
                .minimumScaleFactor(0.85)
        }
        .padding(.horizontal, 11)
        .padding(.vertical, 7)
        .background(tint.opacity(0.15), in: Capsule())
        .foregroundStyle(job.valid ? Color.primary : Color.red)
    }

    private var text: String {
        if !job.valid { return "Can't run" }
        if job.running { return "Running" }
        if !job.enabled { return "Paused" }
        if let next = job.nextFireAt { return "Next run \(automationDateText(next))" }
        return "No run scheduled"
    }

    private var tint: Color {
        if !job.valid { return .red }
        if job.running { return .blue }
        if !job.enabled { return .orange }
        return job.nextFireAt == nil ? .secondary : .green
    }
}

/// A moment on the right of a row: the clock time it happened, and underneath
/// how long ago that was — one is precise, the other is the one you feel.
struct AutomationTimeRow: View {
    let title: String
    let value: String
    let detail: String
    var tint: Color = .secondary

    var body: some View {
        HStack(alignment: .firstTextBaseline) {
            Text(title)
            Spacer(minLength: 12)
            VStack(alignment: .trailing, spacing: 2) {
                Text(value).foregroundStyle(.secondary)
                Text(detail).font(.caption).foregroundStyle(tint)
            }
            .multilineTextAlignment(.trailing)
        }
    }
}

struct AutomationHistoryRow: View {
    let thread: AutomationThread
    let previews: Bool

    private var entry: AutomationHistoryEntry { thread.tail }

    private var meta: String {
        var parts = [automationClockText(entry.at)]
        if let duration = entry.durationSecs, duration > 0 {
            parts.append(automationDurationText(duration))
        }
        if let cost = entry.costUsd, cost > 0 { parts.append(formatUsd(cost)) }
        if entry.count > 1 { parts.append("×\(entry.count)") }
        if !thread.replies.isEmpty {
            parts.append("\(thread.replies.count) repl\(thread.replies.count == 1 ? "y" : "ies")")
        }
        if !entry.copy.isEmpty { parts.append(entry.copy) }
        return parts.joined(separator: " · ")
    }

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            Circle()
                .fill(automationResultColor(entry.result))
                .frame(width: 8, height: 8)
                .padding(.top, 6)
            VStack(alignment: .leading, spacing: 3) {
                Text(automationEntryLabel(entry))
                    .font(.subheadline.weight(.medium))
                    .lineLimit(1)
                if previews, let snippet = automationOutputSnippet(entry.output) {
                    Text(snippet)
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                        .lineLimit(2)
                }
                Text(meta)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }
        }
        .padding(.vertical, 3)
    }
}

/// The tail of a run that is still going. Capped to the last handful of lines so
/// a chatty agent can't push the rest of the page off screen, and scrolled
/// sideways rather than wrapped — wrapped log lines read as noise.
struct AutomationLiveTail: View {
    let text: String

    private static let maxLines = 12

    private var tail: String {
        let lines = text.split(separator: "\n", omittingEmptySubsequences: false)
        return lines.suffix(Self.maxLines).joined(separator: "\n")
    }

    var body: some View {
        if text.isEmpty {
            HStack(spacing: 8) {
                ProgressView().controlSize(.small)
                Text("Waiting for output…").font(.subheadline).foregroundStyle(.secondary)
            }
        } else {
            ScrollView(.horizontal, showsIndicators: false) {
                Text(tail)
                    .font(.system(.caption2, design: .monospaced))
                    .textSelection(.enabled)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}
