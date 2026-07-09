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

    // Current project object (fresh status/actions) from the store; falls back to
    // the one we were pushed with.
    private var live: Project { model.projects.first(where: { $0.name == project.name }) ?? project }
    private var terminals: [TerminalInfo] { model.terminals[project.name] ?? [] }
    // nil vs [] tells "still loading" apart from "no terminals".
    private var terminalsLoaded: Bool { model.terminals[project.name] != nil }
    private var creating: Bool { model.creatingTerminals.contains(project.name) }
    private var actions: [Action] { live.actions.flatMap { $0.runnableLeaves } }

    var body: some View {
        List {
            if !terminalsLoaded {
                Section("Tabs") {
                    ForEach(0..<3, id: \.self) { _ in
                        TerminalRowSkeleton()
                    }
                }
            } else if !terminals.isEmpty || creating {
                Section {
                    ForEach(terminals) { t in
                        NavigationLink(value: t) {
                            TerminalRow(term: t)
                        }
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
                    }
                } header: {
                    HStack {
                        Text("Tabs")
                        Spacer()
                        if !terminals.isEmpty {
                            Text("\(terminals.count)")
                                .monospacedDigit()
                        }
                    }
                }
            }
        }
        .listStyle(.insetGrouped)
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
        .navigationDestination(for: TerminalInfo.self) { TerminalScreen(term: $0) }
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

/// One terminal row: a Settings-style icon tile, the tab name, and pinned/remote
/// indicators. Tapping pushes the terminal; the same tab actions as the desktop
/// live on native swipe gestures (Pin from the leading edge; Rename / Close from
/// the trailing edge).
private struct TerminalRow: View {
    let term: TerminalInfo

    var body: some View {
        HStack(spacing: 12) {
            Group {
                if term.emoji.isEmpty {
                    Image(systemName: "terminal.fill")
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(.white)
                        .frame(width: 36, height: 36)
                        .background(Color.accentColor.gradient,
                                    in: RoundedRectangle(cornerRadius: 9, style: .continuous))
                } else {
                    Text(term.emoji)
                        .font(.system(size: 20))
                        .frame(width: 36, height: 36)
                        .background(Color(.tertiarySystemFill),
                                    in: RoundedRectangle(cornerRadius: 9, style: .continuous))
                }
            }

            Text(term.label)
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
        .padding(.vertical, 4)
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
