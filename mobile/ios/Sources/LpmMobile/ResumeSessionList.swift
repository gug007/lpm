import SwiftUI

/// The project's past agent conversations — Claude Code, Codex, Gemini,
/// OpenCode and Cursor — newest first and grouped by day as the desktop's
/// Resume session list shows them. Picking one
/// continues it in a new tab, or opens the tab already holding it.
struct ResumeSessionList: View {
    @Environment(AppModel.self) private var model
    let project: Project
    /// Takes the sheet holding the list away once a row is picked.
    let onDone: () -> Void
    let onOpen: (TerminalInfo) -> Void

    /// A provider key, or `nil` for All.
    @State private var filter: String?
    @State private var search = ""

    private var list: AgentSessionList { model.agentLaunch.sessions[project.name] ?? AgentSessionList() }
    private var rows: [AgentSession] {
        guard let filter else { return list.rows }
        return list.rows.filter { $0.provider == filter }
    }
    private var providers: [String] { sessionFilterProviders(list.rows.map(\.provider), selected: filter) }
    private var query: String { search.trimmingCharacters(in: .whitespacesAndNewlines) }

    var body: some View {
        VStack(spacing: 0) {
            SessionProviderFilter(providers: providers, selection: $filter)
                .padding(.top, 8)
                .padding(.bottom, 10)
            content
        }
        .background(Color(.systemGroupedBackground).ignoresSafeArea())
        .navigationTitle("Resume Session")
        .navigationBarTitleDisplayMode(.inline)
        .searchable(text: $search, placement: .navigationBarDrawer(displayMode: .always),
                    prompt: "Search conversations")
        .task(id: query) {
            // The first load goes straight out; typing settles before it asks again.
            if !query.isEmpty || list.search != query {
                try? await Task.sleep(nanoseconds: 300_000_000)
                if Task.isCancelled { return }
            }
            model.agentLaunch.loadSessions(project.name, search: query)
        }
    }

    @ViewBuilder
    private var content: some View {
        if rows.isEmpty && !list.hasMore {
            if list.loading || !list.loaded {
                skeleton
            } else if let error = list.error {
                ContentUnavailableView {
                    Label("Couldn't Load Sessions", systemImage: "exclamationmark.triangle")
                } description: {
                    Text(error)
                } actions: {
                    Button("Try Again") { model.agentLaunch.loadSessions(project.name, search: query) }
                        .buttonStyle(.borderedProminent)
                }
                .frame(maxHeight: .infinity)
            } else if !query.isEmpty {
                ContentUnavailableView.search(text: query)
                    .frame(maxHeight: .infinity)
            } else {
                ContentUnavailableView {
                    Label("No Past Sessions", systemImage: "clock.arrow.circlepath")
                } description: {
                    Text("Conversations with Claude Code, Codex, Gemini, OpenCode or Cursor in this project show up here.")
                }
                .frame(maxHeight: .infinity)
            }
        } else {
            sessionList
        }
    }

    private var sessionList: some View {
        List {
            ForEach(agentSessionGroups(rows)) { group in
                Section {
                    ForEach(group.rows) { session in
                        ResumeSessionRow(session: session) { open(session) }
                            .compactRow()
                    }
                } header: {
                    SectionTitle(text: group.label)
                }
            }
            if list.hasMore || list.error != nil {
                Section {
                    olderRow
                }
            }
        }
        .listStyle(.insetGrouped)
        .listSectionSpacing(.compact)
    }

    @ViewBuilder
    private var olderRow: some View {
        if list.loading {
            HStack {
                Spacer()
                ProgressView()
                Spacer()
            }
            .frame(minHeight: 44)
        } else if let error = list.error {
            VStack(alignment: .leading, spacing: 6) {
                Text(error)
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                Button("Try Again") { model.agentLaunch.loadSessions(project.name, search: query) }
            }
            .padding(.vertical, 4)
        } else {
            Button("Show Older Sessions") { model.agentLaunch.loadOlderSessions(project.name) }
                .frame(minHeight: 44)
        }
    }

    private var skeleton: some View {
        List {
            Section {
                ForEach([180.0, 140.0, 200.0, 120.0, 160.0], id: \.self) { width in
                    TwoLineRowSkeleton(titleWidth: width, detailWidth: width + 70)
                        .compactRow()
                }
            }
        }
        .listStyle(.insetGrouped)
        .scrollDisabled(true)
        .allowsHitTesting(false)
    }

    private func open(_ session: AgentSession) {
        Haptics.tap()
        onDone()
        if let tab = model.openTab(for: session, project: project.name) {
            // A push raised while the sheet is still going away is dropped.
            let onOpen = onOpen
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.4) { onOpen(tab) }
        } else {
            model.resumeSession(session, project: project.name, onSpawn: onOpen)
        }
    }

}
