import SwiftUI

/// The state colours the Activity list speaks, shared by the rows and the header
/// counts so a dot means the same thing everywhere.
extension AgentState {
    var tint: SwiftUI.Color {
        switch self {
        case .needsYou: return .orange
        case .error: return .red
        case .working: return .blue
        case .done: return .green
        case .idle: return .secondary
        }
    }
}

/// One agent or automation: an icon tile, what it is, what it's doing, and how long
/// it has been doing it. The whole card is the tap target.
struct ActivityRowCard: View {
    let row: ActivityRow
    /// Unix millis, ticked by the screen so the elapsed label stays live.
    let now: Int
    /// The section header already carries the project's name and tags.
    var hideProject = false
    let onOpen: () -> Void

    private var named: Bool { !row.project.name.isEmpty && !hideProject }
    /// What the row calls the thing that is running: the tab's own name for an
    /// agent, the job's name for an automation. Nil when it has none of its own.
    private var subject: String? { row.kind == .automation ? row.title : row.tabTitle }
    private var headline: String { named ? row.project.label : (subject ?? row.title) }
    /// The subject earns its own line whenever the headline isn't already it — the
    /// project name and the tab name each get the full width instead of sharing one.
    private var subtitle: String? { subject == headline ? nil : subject }
    private var meta: String {
        [row.kind == .automation ? nil : row.title, row.detail]
            .compactMap { $0 }
            .joined(separator: " · ")
    }

    var body: some View {
        Button(action: onOpen) {
            HStack(alignment: .top, spacing: 14) {
                Image(systemName: row.kind == .automation ? "clock.arrow.circlepath" : "terminal.fill")
                    .font(.system(size: 17, weight: .medium))
                    .foregroundStyle(row.state == .working ? AnyShapeStyle(row.state.tint) : AnyShapeStyle(.secondary))
                    .frame(width: 40, height: 40)
                    .background(Color(.tertiarySystemGroupedBackground),
                                in: RoundedRectangle(cornerRadius: 12, style: .continuous))

                VStack(alignment: .leading, spacing: 4) {
                    HStack(spacing: 6) {
                        Text(headline)
                            .font(.system(size: 16, weight: .semibold))
                            .foregroundStyle(.primary)
                            .lineLimit(1)
                        if named {
                            ActivityTags(project: row.project)
                        }
                        Spacer(minLength: 0)
                    }

                    if let subtitle {
                        Text(subtitle)
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                            .lineLimit(1)
                    }

                    HStack(spacing: 5) {
                        Circle().fill(row.state.tint).frame(width: 6, height: 6)
                        Text(row.state.label)
                            .font(.caption.weight(.medium))
                            .foregroundStyle(row.state.tint)
                        if !meta.isEmpty {
                            Text("· \(meta)")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                                .lineLimit(1)
                        }
                        Spacer(minLength: 8)
                        // The elapsed label keeps its width: a truncated duration
                        // reads as a different number, a truncated agent name doesn't.
                        Text(activityElapsedLabel(row, now: now))
                            .font(.caption.monospacedDigit())
                            .foregroundStyle(.tertiary)
                            .lineLimit(1)
                            .layoutPriority(1)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .padding(14)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .background(Color(.secondarySystemGroupedBackground),
                    in: RoundedRectangle(cornerRadius: 20, style: .continuous))
    }
}

/// Copy / Worktree / SSH — what kind of project a row belongs to.
struct ActivityTags: View {
    let project: ActivityIdentity

    var body: some View {
        ForEach(project.tags, id: \.self) { tag in
            Text(tag)
                .font(.caption2.weight(.semibold))
                .foregroundStyle(.secondary)
                // A long project name truncates before a tag does: half a word in a
                // capsule says less than the name it stole the room from.
                .fixedSize()
                .padding(.horizontal, 6)
                .padding(.vertical, 2)
                .background(Color(.tertiarySystemFill), in: Capsule())
        }
    }
}

/// One project's running services: the profile / service chips that start and stop
/// them, the ports they declare, and a stop-everything control.
struct ActivityServiceCard: View {
    let group: ActivityServiceGroup
    /// Services with a toggle still in flight, spun rather than re-tappable.
    let pending: Set<String>
    let stopping: Bool
    let onChip: (ActivityChip) -> Void
    let onStop: () -> Void
    let onOpenProject: () -> Void

    private var ports: [(service: String, port: Int)] {
        group.running.compactMap { service in
            guard let port = group.ports[service], port > 0 else { return nil }
            return (service, port)
        }
    }

    var body: some View {
        HStack(alignment: .top, spacing: 14) {
            Image(systemName: "server.rack")
                .font(.system(size: 17, weight: .medium))
                .foregroundStyle(.green)
                .frame(width: 40, height: 40)
                .background(Color(.tertiarySystemGroupedBackground),
                            in: RoundedRectangle(cornerRadius: 12, style: .continuous))

            VStack(alignment: .leading, spacing: 8) {
                Button(action: onOpenProject) {
                    HStack(spacing: 6) {
                        Text(group.project.label)
                            .font(.system(size: 16, weight: .semibold))
                            .foregroundStyle(.primary)
                            .lineLimit(1)
                        ActivityTags(project: group.project)
                        Spacer(minLength: 0)
                    }
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)

                ActivityChipRow(chips: group.chips, pending: pending, onChip: onChip)

                // Under the chips rather than beside the name: a port belongs to a
                // service, so it says more paired with one than as a bare number.
                if !ports.isEmpty {
                    Text(ports.map { "\($0.service) :\($0.port)" }.joined(separator: "  "))
                        .font(.caption.monospacedDigit())
                        .foregroundStyle(.tertiary)
                        .lineLimit(1)
                }
            }

            Spacer(minLength: 4)

            if stopping {
                ProgressView().controlSize(.small).frame(width: 32, height: 32)
            } else {
                Button(action: onStop) {
                    Image(systemName: "stop.fill")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(.red)
                        .frame(width: 32, height: 32)
                        .background(Color(.tertiarySystemFill), in: Circle())
                }
                .buttonStyle(.borderless)
                .accessibilityLabel("Stop everything in \(group.project.label)")
            }
        }
        .padding(14)
        .background(Color(.secondarySystemGroupedBackground),
                    in: RoundedRectangle(cornerRadius: 20, style: .continuous))
    }
}

/// The start/stop chips under a service card. They scroll sideways rather than
/// wrapping, so a project with many services never grows the card unpredictably.
private struct ActivityChipRow: View {
    let chips: [ActivityChip]
    let pending: Set<String>
    let onChip: (ActivityChip) -> Void

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) {
                ForEach(chips) { chip in
                    ActivityChipButton(chip: chip,
                                       pending: chip.kind == .service && pending.contains(chip.name),
                                       action: { onChip(chip) })
                }
            }
            .padding(.vertical, 1)
        }
        .scrollClipDisabled()
    }
}

private struct ActivityChipButton: View {
    let chip: ActivityChip
    let pending: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 5) {
                if pending {
                    ProgressView().controlSize(.mini)
                } else {
                    Circle()
                        .fill(chip.running ? Color.green : Color(.systemGray3))
                        .frame(width: 5, height: 5)
                }
                Text(chip.name)
                    .font(.caption.weight(.medium))
                    .foregroundStyle(chip.running ? Color.green : Color.secondary)
                    .lineLimit(1)
            }
            .padding(.horizontal, 9)
            .padding(.vertical, 5)
            .background(Color(.tertiarySystemFill), in: Capsule())
        }
        .buttonStyle(.borderless)
        .disabled(pending)
        .accessibilityLabel("\(chip.running ? "Stop" : "Start") the \(chip.name) \(chip.noun)")
    }
}

/// The four attention counts, in the same order and colours as the desktop header.
struct ActivityCountsStrip: View {
    let counts: ActivityCounts

    private var items: [(label: String, value: Int, tint: SwiftUI.Color)] {
        [("needs you", counts.needsYou, .orange),
         ("problems", counts.error, .red),
         ("working", counts.working, .blue),
         ("done", counts.done, .green)]
    }

    var body: some View {
        HStack(spacing: 14) {
            ForEach(items, id: \.label) { item in
                HStack(spacing: 5) {
                    Circle().fill(item.tint).frame(width: 6, height: 6)
                    Text("\(item.value)")
                        .font(.caption.weight(.semibold).monospacedDigit())
                        .foregroundStyle(.primary)
                    Text(item.label)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                .opacity(item.value == 0 ? 0.4 : 1)
                .accessibilityElement(children: .combine)
                .accessibilityLabel("\(item.value) \(item.label)")
            }
            Spacer(minLength: 0)
        }
    }
}
