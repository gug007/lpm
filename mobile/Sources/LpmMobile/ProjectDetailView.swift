import SwiftUI

/// A project's screen: the project's open terminals as tappable cards, with a
/// single "more" menu in the nav bar for Start/Stop, actions, and services.
/// Terminal tab actions (Pin / Rename / Close) live on native swipe gestures.
struct ProjectDetail: View {
    @EnvironmentObject var model: AppModel
    let project: Project
    @State private var renaming: TerminalInfo?
    @State private var renameText = ""
    @State private var openTerminal: TerminalInfo?

    // Current project object (fresh status/actions) from the store; falls back to
    // the one we were pushed with.
    private var live: Project { model.projects.first(where: { $0.name == project.name }) ?? project }
    private var terminals: [TerminalInfo] { model.terminals[project.name] ?? [] }
    private var actions: [Action] { live.actions.flatMap { $0.runnableLeaves } }

    var body: some View {
        // A List (not a ScrollView) so the terminal rows support native
        // drag-to-reorder via `.onMove` (long-press a row and drag). Styled plain
        // with cleared row chrome so the custom `.card()` rows keep their look.
        List {
            Section {
                if terminals.isEmpty {
                    EmptyTerminalsCard()
                        .terminalRowChrome()
                } else {
                    ForEach(terminals) { t in
                        TerminalRow(term: t, onOpen: { openTerminal = t })
                            .terminalRowChrome()
                            .swipeActions(edge: .leading, allowsFullSwipe: true) {
                                Button {
                                    model.pinTerminal(project.name, id: t.id)
                                } label: {
                                    Label(t.pinned ? "Unpin" : "Pin",
                                          systemImage: t.pinned ? "pin.slash" : "pin")
                                }
                                .tint(.orange)
                            }
                            .swipeActions(edge: .trailing, allowsFullSwipe: true) {
                                Button(role: .destructive) {
                                    model.closeTerminal(project.name, id: t.id)
                                } label: {
                                    Label("Close", systemImage: "xmark")
                                }
                                Button {
                                    renameText = t.label
                                    renaming = t
                                } label: {
                                    Label("Rename", systemImage: "pencil")
                                }
                                .tint(.gray)
                            }
                    }
                    .onMove(perform: moveTerminals)
                }
            } header: {
                DetailSectionHeader(title: "Tabs", count: terminals.count) {
                    Button { model.newTerminal(project.name) } label: {
                        Label("New", systemImage: "plus")
                            .font(.system(size: 13, weight: .semibold))
                    }
                    .tint(.accentColor)
                }
                .textCase(nil)
                .listRowInsets(EdgeInsets(top: 4, leading: 20, bottom: 8, trailing: 20))
            }
        }
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
        .background(Color(.systemGroupedBackground))
        .refreshable {
            model.loadTerminals(project.name)
        }
        .navigationTitle(project.label)
        .navigationBarTitleDisplayMode(.inline)
        .navigationDestination(item: $openTerminal) { TerminalScreen(term: $0) }
        .alert("Rename terminal", isPresented: Binding(
            get: { renaming != nil },
            set: { if !$0 { renaming = nil } }
        )) {
            TextField("Name", text: $renameText)
            Button("Cancel", role: .cancel) { renaming = nil }
            Button("Rename") {
                let name = renameText.trimmingCharacters(in: .whitespacesAndNewlines)
                if let t = renaming, !name.isEmpty {
                    model.renameTerminal(project.name, id: t.id, label: name)
                }
                renaming = nil
            }
        }
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                ProjectRunControl(project: live,
                                  actions: actions,
                                  onStart: { profile in model.startProject(live, profile: profile) },
                                  onStop: { model.stopProject(live) },
                                  onToggleService: { model.toggleService(live.name, service: $0) },
                                  onRunAction: { model.runAction(live.name, action: $0) })
            }
        }
        .onAppear { model.loadTerminals(project.name) }
    }

    private func moveTerminals(from source: IndexSet, to destination: Int) {
        var order = terminals.map(\.id)
        order.move(fromOffsets: source, toOffset: destination)
        model.reorderTerminals(project.name, order: order)
    }
}

/// Strips a List row's default chrome so a custom `.card()` row keeps its look:
/// transparent background, no separators, and the same insets/spacing the old
/// ScrollView cards used.
private extension View {
    func terminalRowChrome() -> some View {
        self
            .listRowInsets(EdgeInsets(top: 5, leading: 20, bottom: 5, trailing: 20))
            .listRowSeparator(.hidden)
            .listRowBackground(Color.clear)
    }
}

/// The project's control menu in the nav bar: a single "more" button whose native
/// menu holds Start/Stop, the run-actions submenu, and (when present) profiles and
/// per-service toggles.
private struct ProjectRunControl: View {
    let project: Project
    let actions: [Action]
    let onStart: (_ profile: String) -> Void
    let onStop: () -> Void
    let onToggleService: (_ service: String) -> Void
    let onRunAction: (_ name: String) -> Void

    private var running: Bool { project.running }
    private var runningServices: Set<String> { Set(project.services.map(\.name)) }

    var body: some View {
        Menu {
            Button {
                running ? onStop() : onStart(project.activeProfile)
            } label: {
                Label(running ? "Stop" : "Start",
                      systemImage: running ? "stop.fill" : "play.fill")
            }

            if !actions.isEmpty {
                Menu {
                    ForEach(actions) { a in
                        Button { onRunAction(a.name) } label: { actionLabel(a) }
                    }
                } label: {
                    Label("Actions", systemImage: "bolt")
                }
            }

            if !project.profiles.isEmpty {
                Section("Profiles") {
                    ForEach(project.profiles) { p in
                        Button { onStart(p.name) } label: { profileLabel(p) }
                    }
                }
            }
            if !project.allServices.isEmpty {
                Section("Services") {
                    ForEach(project.allServices) { s in
                        Button { onToggleService(s.name) } label: { serviceLabel(s) }
                    }
                }
            }
        } label: {
            Image(systemName: "ellipsis")
                .font(.system(size: 18, weight: .semibold))
                .foregroundStyle(running ? .green : .primary)
        }
    }

    @ViewBuilder
    private func actionLabel(_ a: Action) -> some View {
        if a.emoji.isEmpty {
            Text(a.label)
        } else {
            Text("\(a.emoji)  \(a.label)")
        }
    }

    @ViewBuilder
    private func profileLabel(_ p: Profile) -> some View {
        if running && project.activeProfile == p.name {
            Label(p.name, systemImage: "checkmark")
        } else {
            Text(p.name)
        }
    }

    @ViewBuilder
    private func serviceLabel(_ s: Service) -> some View {
        let title = s.port > 0 ? "\(s.name)  :\(s.port)" : s.name
        if runningServices.contains(s.name) {
            Label(title, systemImage: "checkmark")
        } else {
            Text(title)
        }
    }
}

private struct DetailSectionHeader<Trailing: View>: View {
    let title: String
    let count: Int
    @ViewBuilder var trailing: Trailing

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
            trailing
        }
        .padding(.horizontal, 4)
    }
}

extension DetailSectionHeader where Trailing == EmptyView {
    init(title: String, count: Int) {
        self.init(title: title, count: count) { EmptyView() }
    }
}

/// One terminal: tap the card to open it. The same tab actions as the desktop
/// live on native swipe gestures (Pin from the leading edge; Rename / Close from
/// the trailing edge).
private struct TerminalRow: View {
    let term: TerminalInfo
    let onOpen: () -> Void

    var body: some View {
        Button(action: onOpen) {
            HStack(spacing: 14) {
                // Tab icon, matching the desktop: the terminal's emoji when set,
                // else a generic terminal glyph.
                Group {
                    if term.emoji.isEmpty {
                        Image(systemName: "terminal.fill")
                            .font(.system(size: 15, weight: .semibold))
                            .foregroundStyle(.secondary)
                    } else {
                        Text(term.emoji).font(.system(size: 18))
                    }
                }
                    .frame(width: 40, height: 40)
                    .background(Color(.tertiarySystemGroupedBackground))
                    .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))

                if term.pinned {
                    Image(systemName: "pin.fill")
                        .font(.system(size: 11))
                        .foregroundStyle(.orange)
                }
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
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 14)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
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
