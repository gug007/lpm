import SwiftUI

/// Where a tapped Activity row goes. Kept local to this screen so its rows push
/// their own destinations instead of depending on the projects list's routes.
private enum ActivityRoute: Hashable, Identifiable {
    case project(String)
    case terminal(project: String, id: String)
    case automation(project: String, id: String)

    var id: String {
        switch self {
        case .project(let name): return "project:\(name)"
        case .terminal(let project, let id): return "terminal:\(project):\(id)"
        case .automation(let project, let id): return "automation:\(project):\(id)"
        }
    }
}

/// One project's rows while the list is grouped.
private struct ActivityGroup: Identifiable {
    let id: String
    let project: ActivityIdentity
    var rows: [ActivityRow]
}

/// How long a held order outlives the drag that started it.
private let activityResettleSeconds: UInt64 = 1_200_000_000

/// Every agent, automation, and running service across the paired Mac's projects,
/// ordered by what is waiting on you. The phone's port of the desktop's Activity
/// view: the same rows, the same attention order, the same words.
struct ActivityScreen: View {
    @Environment(AppModel.self) private var model
    @Environment(\.scenePhase) private var scenePhase

    @State private var kind: ActivityKindFilter = .all
    @State private var query = ""
    // Sticky: the screen is pushed and popped, so plain view state would forget the
    // layout the user chose every time they leave.
    @AppStorage("activity.groupByProject") private var grouped = false
    @State private var route: ActivityRoute?
    // Unix millis, ticked once a second so the elapsed labels stay live.
    @State private var now = Int(Date().timeIntervalSince1970 * 1000)
    // The order frozen while the list is being dragged, so rows never move out
    // from under a thumb. Nil means "sort freely".
    @State private var frozenRanks: [String: Int]?
    @State private var releaseTask: Task<Void, Never>?
    // The reason a row refused to be cleared, shown once the user asks why.
    @State private var blockedReason: String?
    @State private var onScreen = false

    /// The elapsed labels only need a clock while someone can read them — not
    /// behind a pushed terminal, and not while the app is in the background.
    private var ticking: Bool { onScreen && scenePhase == .active }

    private var activity: Activity {
        buildActivity(projects: model.projects,
                      jobs: model.automations,
                      now: now,
                      terminalTitles: model.activityTerminalTitles)
    }

    var body: some View {
        let activity = self.activity
        let visible = filterActivity(activity, query: query, kind: kind)
        let rows = ordered(visible.rows)
        let empty = rows.isEmpty && visible.services.isEmpty

        VStack(spacing: 0) {
            ActivityHeader(kind: $kind)
            list(rows: rows, services: visible.services, empty: empty, activity: activity)
        }
        .background(Color(.systemGroupedBackground).ignoresSafeArea())
        .searchable(text: $query,
                    placement: .navigationBarDrawer(displayMode: .always),
                    prompt: "Search projects and agents")
        .navigationTitle("Activity")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button { grouped.toggle() } label: {
                    Image(systemName: grouped ? "square.stack.3d.up.fill" : "square.stack.3d.up")
                        .foregroundStyle(grouped ? AnyShapeStyle(Color.accentColor) : AnyShapeStyle(.primary))
                }
                .accessibilityLabel("Group by project")
                .accessibilityValue(grouped ? "On" : "Off")
            }
        }
        .navigationDestination(item: $route) { destination($0) }
        .alert("This row stays until it's done",
               isPresented: Binding(get: { blockedReason != nil },
                                    set: { if !$0 { blockedReason = nil } })) {
            Button("OK", role: .cancel) { blockedReason = nil }
        } message: {
            Text(blockedReason ?? "")
        }
        .task {
            model.loadAutomations()
            model.loadActivityTerminals()
        }
        .task(id: ticking) {
            while ticking && !Task.isCancelled {
                now = Int(Date().timeIntervalSince1970 * 1000)
                try? await Task.sleep(nanoseconds: 1_000_000_000)
            }
        }
        .onAppear { onScreen = true }
        .onDisappear {
            onScreen = false
            releaseTask?.cancel()
        }
    }

    // MARK: List

    @ViewBuilder
    private func list(rows: [ActivityRow], services: [ActivityServiceGroup],
                      empty: Bool, activity: Activity) -> some View {
        List {
            if frozenRanks != nil && orderIsStale(rows) {
                Button {
                    withAnimation { resettle() }
                } label: {
                    Label("Newer rows are waiting to move up — sort now",
                          systemImage: "arrow.up.arrow.down")
                        .font(.caption.weight(.medium))
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.plain)
                .foregroundStyle(.secondary)
                .padding(.vertical, 8)
                .activityRowChrome()
            }

            if grouped {
                ForEach(groups(rows)) { group in
                    Section {
                        ForEach(group.rows) { row in
                            rowCard(row, hideProject: true)
                        }
                    } header: {
                        ActivitySectionHeader(project: group.project)
                    }
                }
            } else {
                ForEach(rows) { row in
                    rowCard(row, hideProject: false)
                }
            }

            if !services.isEmpty {
                Section {
                    ForEach(services) { group in
                        serviceCard(group)
                    }
                } header: {
                    ActivityServicesHeader(groups: services)
                }
            }

            if !empty {
                ActivityFooter(quietProjectCount: activity.quietProjectCount)
                    .activityRowChrome()
            }
        }
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
        .refreshable { await model.refreshActivity() }
        // Only a real drag holds the order — a tap must still reach the card
        // underneath, and a held list is what keeps rows from moving mid-reach.
        .simultaneousGesture(
            DragGesture(minimumDistance: 10)
                .onChanged { _ in hold(rows) }
                .onEnded { _ in scheduleRelease() }
        )
        .overlay {
            if empty { emptyState }
        }
    }

    private func rowCard(_ row: ActivityRow, hideProject: Bool) -> some View {
        ActivityRowCard(row: row, now: now, hideProject: hideProject) { open(row) }
            .activityRowChrome()
            .swipeActions(edge: .trailing, allowsFullSwipe: row.dismissable) {
                if row.dismissable {
                    Button(role: .destructive) { dismiss(row) } label: {
                        Label("Clear", systemImage: "xmark")
                    }
                } else if let reason = row.dismissBlocked {
                    Button { blockedReason = reason } label: {
                        Label("Why?", systemImage: "questionmark")
                    }
                    .tint(.gray)
                }
            }
    }

    private func serviceCard(_ group: ActivityServiceGroup) -> some View {
        let name = group.project.name
        return ActivityServiceCard(
            group: group,
            pending: Set((model.pendingServiceToggle[name] ?? [:]).keys),
            stopping: model.pendingRun[name] == false,
            onChip: { runChip(name, $0) },
            onStop: { if let p = model.projects.first(where: { $0.name == name }) { model.stopProject(p) } },
            onOpenProject: { route = .project(name) }
        )
        .activityRowChrome()
    }

    private var emptyState: some View {
        let narrowed = !query.trimmingCharacters(in: .whitespaces).isEmpty || kind != .all
        return ContentUnavailableView {
            Label(narrowed ? "Nothing matches" : "Nothing is running",
                  systemImage: narrowed ? "magnifyingglass" : "moon.zzz")
        } description: {
            Text(narrowed
                 ? "Try a different search, or switch back to All."
                 : "Start a supported agent in an open project, or run an automation. Terminal sessions aren't tracked.")
        }
    }

    // MARK: Navigation

    @ViewBuilder
    private func destination(_ route: ActivityRoute) -> some View {
        switch route {
        case .project(let name):
            if let project = model.projects.first(where: { $0.name == name }) {
                ProjectDetail(project: project)
            } else {
                ContentUnavailableView("Project unavailable", systemImage: "folder")
            }
        case .terminal(let project, let id):
            NotificationTerminalDestination(projectName: project, terminalId: id)
        case .automation(let project, let id):
            AutomationDetailView(project: project, jobId: id)
        }
    }

    private func open(_ row: ActivityRow) {
        switch row.kind {
        case .automation:
            guard let id = row.jobId else { return }
            route = .automation(project: row.jobProject ?? "", id: id)
        case .agent:
            let project = row.project.name
            guard !project.isEmpty else { return }
            if let terminal = row.terminalId {
                route = .terminal(project: project, id: terminal)
            } else {
                route = .project(project)
            }
        }
    }

    private func dismiss(_ row: ActivityRow) {
        guard let terminal = row.terminalId, let value = row.statusValue else { return }
        model.clearAgentStatus(project: row.project.name, paneId: terminal, value: value)
    }

    /// A lit profile means the project is running that profile and nothing else, so
    /// stopping it is stopping the project.
    private func runChip(_ project: String, _ chip: ActivityChip) {
        if chip.kind == .service {
            model.toggleService(project, service: chip.name)
            return
        }
        guard let p = model.projects.first(where: { $0.name == project }) else { return }
        if chip.running { model.stopProject(p) } else { model.startProject(p, profile: chip.name) }
    }

    // MARK: Grouping

    private func groups(_ rows: [ActivityRow]) -> [ActivityGroup] {
        var order: [String] = []
        var byProject: [String: ActivityGroup] = [:]
        for row in rows {
            // Rows naming no project have no name to group on, and the sets they
            // stand for differ — keep "No project" and "Multiple projects" apart.
            let key = row.project.name.isEmpty ? row.project.label : row.project.name
            if byProject[key] == nil {
                order.append(key)
                byProject[key] = ActivityGroup(id: key, project: row.project, rows: [])
            }
            byProject[key]?.rows.append(row)
        }
        return order.compactMap { byProject[$0] }
    }

    // MARK: Held order

    /// Rows the frozen order never saw sort to the bottom in attention order: a row
    /// that arrives mid-hold has no place to land without moving something.
    private func ordered(_ rows: [ActivityRow]) -> [ActivityRow] {
        guard let ranks = frozenRanks else { return rows }
        return rows.sorted { a, b in
            switch (ranks[a.id], ranks[b.id]) {
            case let (rankA?, rankB?): return rankA < rankB
            case (_?, nil): return true
            case (nil, _?): return false
            default: return activityRowPrecedes(a, b)
            }
        }
    }

    /// Whether some row belongs above the one ahead of it, which only a hold can cause.
    private func orderIsStale(_ rows: [ActivityRow]) -> Bool {
        rows.enumerated().contains { i, row in i > 0 && activityRowPrecedes(row, rows[i - 1]) }
    }

    private func hold(_ rows: [ActivityRow]) {
        releaseTask?.cancel()
        releaseTask = nil
        guard frozenRanks == nil else { return }
        frozenRanks = Dictionary(uniqueKeysWithValues: rows.enumerated().map { ($1.id, $0) })
    }

    private func scheduleRelease() {
        releaseTask?.cancel()
        releaseTask = Task {
            try? await Task.sleep(nanoseconds: activityResettleSeconds)
            guard !Task.isCancelled else { return }
            frozenRanks = nil
        }
    }

    private func resettle() {
        releaseTask?.cancel()
        releaseTask = nil
        frozenRanks = nil
    }
}
