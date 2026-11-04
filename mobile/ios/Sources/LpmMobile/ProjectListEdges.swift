import SwiftUI

/// One row under Projects, as the ends of the list read it: where it sits, and the
/// agent it stands for, if any. Rows off screen aren't drawn and can't be measured,
/// so the list's own order is what says which end a row has gone past.
struct ListEdgeRow: Equatable {
    let id: String
    /// Set for a state worth raising, on an agent's line or a folded header.
    let state: AgentState?

    static func folderID(_ id: String) -> String { "f:" + id }
    static func machineID(_ id: String) -> String { "m:" + id }
    static func pinnedID(_ name: String) -> String { "pin:" + name }
    static let tipID = "tip"
    static func usageID(_ id: String) -> String { usagePrefix + id }
    private static let usagePrefix = "u:"

    /// A usage row: the section the list ends on, so one on screen with none of
    /// the projects means they're all above.
    static func isUsage(_ id: String) -> Bool { id.hasPrefix(usagePrefix) }

    static func projectID(_ name: String, machine: String? = nil) -> String {
        "p:\(machine ?? "")/\(name)"
    }

    static func agentID(_ id: String, project: String, machine: String? = nil) -> String {
        "a:\(machine ?? "")/\(project)/\(id)"
    }

    /// A project's row and the agent lines under it.
    static func project(_ name: String, machine: String? = nil, agents: [ProjectAgentRow]) -> [ListEdgeRow] {
        [ListEdgeRow(id: projectID(name, machine: machine), state: nil)] + agents.map {
            ListEdgeRow(id: agentID($0.id, project: name, machine: machine), state: [$0].edgeState)
        }
    }
}

extension [ProjectAgentRow] {
    /// The most urgent agent still going or waiting on someone. Finished agents
    /// stay out, as they do from a folded folder on the desktop, and so does a
    /// row already looked at, however it ended.
    var edgeState: AgentState? {
        filter { !$0.seen }.map(\.state)
            .filter { [.needsYou, .error, .working].contains($0) }
            .min { $0.rank < $1.rank }
    }
}

/// The most urgent agent past each end of the list.
struct AgentsOutOfView: Equatable {
    var above: AgentState?
    var below: AgentState?

    init(rows: [ListEdgeRow], inView: Set<String>) {
        guard !inView.isEmpty else { return }
        let shown = rows.indices.filter { inView.contains(rows[$0].id) }
        // With none of Projects on screen, the tip, Pinned or Usage rows that are
        // say which side of it the list has stopped on.
        let first = shown.first ?? (inView.contains(where: ListEdgeRow.isUsage) ? rows.endIndex : 0)
        let last = shown.last ?? first - 1
        above = Self.mostUrgent(rows[..<first])
        below = Self.mostUrgent(rows[(last + 1)...])
    }

    private static func mostUrgent(_ rows: ArraySlice<ListEdgeRow>) -> AgentState? {
        rows.compactMap(\.state).min { $0.rank < $1.rank }
    }
}

/// Which rows have at least half of themselves showing in the list's visible box.
/// A row under the translucent bar is still on screen to the system, so `onAppear`
/// alone would leave its agent unreported until it had left the display.
@Observable
final class ListRowsInView {
    private(set) var ids: Set<String> = []
    var viewport: CGRect = .zero

    func set(_ id: String, _ inView: Bool) {
        if inView { ids.insert(id) } else { ids.remove(id) }
    }
}

private struct TracksListRow: ViewModifier {
    @Environment(ListRowsInView.self) private var rows: ListRowsInView?
    @State private var inView = false
    let id: String

    func body(content: Content) -> some View {
        if let rows {
            let viewport = rows.viewport
            content
                .onGeometryChange(for: Bool.self) { geo in
                    let middle = geo.frame(in: .global).midY
                    return middle >= viewport.minY && middle <= viewport.maxY
                } action: { now in
                    inView = now
                    rows.set(id, now)
                }
                .onAppear { rows.set(id, inView) }
                .onDisappear { rows.set(id, false) }
        } else {
            content
        }
    }
}

extension View {
    /// Reports this list row to the `ListRowsInView` in the environment.
    func tracksListRow(_ id: String) -> some View {
        modifier(TracksListRow(id: id))
    }

    /// Lines the ends of a list when an agent sits past them. The bottom one
    /// hugs the display, since rows run on under the home indicator.
    func showsAgentEdges(rows: [ListEdgeRow], inView: ListRowsInView) -> some View {
        environment(inView)
            .onGeometryChange(for: CGRect.self) { geo in
                var box = geo.frame(in: .global)
                box.size.height += geo.safeAreaInsets.bottom
                return box
            } action: { inView.viewport = $0 }
            .overlay { ListAgentEdges(rows: rows, inView: inView) }
    }
}

private struct ListAgentEdges: View {
    let rows: [ListEdgeRow]
    let inView: ListRowsInView

    var body: some View {
        let edges = AgentsOutOfView(rows: rows, inView: inView.ids)
        VStack(spacing: 0) {
            ListEdgeLine(state: edges.above)
            Spacer(minLength: 0)
            ListEdgeLine(state: edges.below)
        }
        .ignoresSafeArea(edges: .bottom)
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }
}

private struct ListEdgeLine: View {
    let state: AgentState?

    var body: some View {
        ZStack {
            if let state {
                Rectangle().agentTone(state).id(state).transition(.opacity)
            }
        }
        .frame(height: 2)
        .animation(.easeOut(duration: 0.16), value: state)
    }
}
