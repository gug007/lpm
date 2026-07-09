import SwiftUI

/// A project's screen: the project's open terminals as a native inset-grouped
/// list, with a nav-bar "+" for new terminals and a "more" menu for Start/Stop,
/// actions, and services. Terminal tab actions (Pin / Rename / Close) live on
/// native swipe gestures.
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
    // nil vs [] tells "still loading" apart from "no terminals".
    private var terminalsLoaded: Bool { model.terminals[project.name] != nil }
    private var creating: Bool { model.creatingTerminals.contains(project.name) }
    private var actions: [Action] { live.actions.flatMap { $0.runnableLeaves } }

    var body: some View {
        // A plain List (not insetGrouped) so each terminal renders as its own
        // spaced card while keeping native drag-to-reorder via `.onMove`.
        List {
            if !terminalsLoaded {
                Section {
                    ForEach(0..<3, id: \.self) { _ in
                        TerminalRowSkeleton()
                            .terminalRowChrome()
                    }
                } header: {
                    TabsSectionHeader(count: 0)
                }
            } else if !terminals.isEmpty || creating {
                Section {
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
                    if creating {
                        TerminalRowSkeleton()
                            .terminalRowChrome()
                    }
                } header: {
                    TabsSectionHeader(count: terminals.count)
                }
            }
        }
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
        .background(Color(.systemGroupedBackground))
        // Full-space overlay (not a list row): ContentUnavailableView is greedy
        // and inside a row it stretches the row — and its action button — to
        // fill the expanse.
        .overlay {
            if terminalsLoaded && terminals.isEmpty && !creating {
                EmptyTerminalsView(onNew: { model.newTerminal(project.name) })
            }
        }
        .animation(.default, value: terminalsLoaded)
        .animation(.default, value: creating)
        .refreshable {
            model.loadTerminals(project.name)
        }
        .navigationTitle(project.label)
        .navigationBarTitleDisplayMode(.inline)
        .navigationSubtitleCompat(live.running ? "Running" : "Stopped")
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
                                  pending: model.pendingRun[live.name] != nil,
                                  actions: actions,
                                  onStart: { profile in model.startProject(live, profile: profile) },
                                  onStop: { model.stopProject(live) },
                                  onToggleService: { model.toggleService(live.name, service: $0) },
                                  onRunAction: { model.runAction(live.name, action: $0) })
            }
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    model.newTerminal(project.name)
                } label: {
                    Label("New Terminal", systemImage: "plus")
                }
                .disabled(creating)
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

private extension View {
    @ViewBuilder
    func navigationSubtitleCompat(_ subtitle: String) -> some View {
        if #available(iOS 26.0, *) {
            navigationSubtitle(subtitle)
        } else {
            self
        }
    }

    /// Strips a List row's default chrome so the card rows keep their look:
    /// transparent background, no separators, spacing between cards.
    func terminalRowChrome() -> some View {
        self
            .listRowInsets(EdgeInsets(top: 6, leading: 20, bottom: 6, trailing: 20))
            .listRowSeparator(.hidden)
            .listRowBackground(Color.clear)
    }
}

private struct TabsSectionHeader: View {
    let count: Int

    var body: some View {
        HStack(spacing: 6) {
            Text("Tabs")
                .textCase(.uppercase)
            if count > 0 {
                Text("\(count)")
                    .foregroundStyle(.tertiary)
                    .monospacedDigit()
            }
            Spacer()
        }
        .font(.footnote.weight(.semibold))
        .foregroundStyle(.secondary)
        .listRowInsets(EdgeInsets(top: 4, leading: 24, bottom: 2, trailing: 24))
    }
}

/// The project's control menu in the nav bar: a single "more" button whose native
/// menu holds Start/Stop, the run-actions submenu, and (when present) profiles and
/// per-service toggles.
private struct ProjectRunControl: View {
    let project: Project
    let pending: Bool
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
            if pending {
                ProgressView()
                    .controlSize(.small)
            } else {
                Image(systemName: "ellipsis")
                    .foregroundStyle(running ? .green : .primary)
            }
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

/// One terminal card: a terminal-glyph icon tile and the tab name (prefixed with
/// the tab's emoji when set). Tapping the card opens the terminal; the same tab
/// actions as the desktop live on native swipe gestures (Pin from the leading
/// edge; Rename / Close from the trailing edge).
private struct TerminalRow: View {
    let term: TerminalInfo
    let onOpen: () -> Void

    private var title: String {
        term.emoji.isEmpty ? term.label : "\(term.emoji) \(term.label)"
    }

    var body: some View {
        Button(action: onOpen) {
            HStack(spacing: 16) {
                Image(systemName: "terminal.fill")
                    .font(.system(size: 18, weight: .medium))
                    .foregroundStyle(.secondary)
                    .frame(width: 40, height: 40)
                    .background(Color(.tertiarySystemGroupedBackground),
                                in: RoundedRectangle(cornerRadius: 12, style: .continuous))

                Text(title)
                    .font(.system(size: 17, weight: .semibold))
                    .foregroundStyle(.primary)
                    .lineLimit(1)

                Spacer(minLength: 8)

                if term.pinned {
                    Image(systemName: "pin.fill")
                        .font(.caption2)
                        .foregroundStyle(.orange)
                }
                if term.remote {
                    Text("Remote")
                        .font(.caption2.weight(.semibold))
                        .foregroundStyle(.secondary)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 3)
                        .background(Color(.tertiarySystemFill), in: Capsule())
                }
            }
            .padding(16)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .background(Color(.secondarySystemGroupedBackground),
                    in: RoundedRectangle(cornerRadius: 20, style: .continuous))
    }
}

private struct EmptyTerminalsView: View {
    let onNew: () -> Void

    var body: some View {
        ContentUnavailableView {
            Label("No Terminals", systemImage: "terminal")
        } description: {
            Text("Open a terminal to work in this project.")
        } actions: {
            Button(action: onNew) {
                Label("New Terminal", systemImage: "plus")
            }
            .buttonStyle(.borderedProminent)
            .buttonBorderShape(.capsule)
        }
    }
}
