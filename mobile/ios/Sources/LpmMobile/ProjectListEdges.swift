import SwiftUI

/// One row under Projects, as the ends of the list read it: where it sits, and the
/// agent it stands for, if any. Rows off screen aren't drawn and can't be measured,
/// so the list's own order is what says which end a row has gone past.
struct ListEdgeRow: Equatable {
    let id: String
    /// One state for each agent worth raising, on an agent's line or a folded header.
    var states: [AgentState] = []

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
        [ListEdgeRow(id: projectID(name, machine: machine))] + agents.map {
            ListEdgeRow(id: agentID($0.id, project: name, machine: machine), states: [$0].edgeStates)
        }
    }
}

extension AgentState {
    /// What the ends of the list speak up about, most urgent first.
    fileprivate static let edgeTones: [AgentState] = [.needsYou, .error, .working]
}

extension [ProjectAgentRow] {
    /// One state for each agent still going or waiting on someone, a tab's other
    /// agents included. Finished agents stay out, as they do from a folded folder
    /// on the desktop, and so does a row already looked at, however it ended.
    var edgeStates: [AgentState] {
        filter { !$0.seen }.flatMap { [$0.state] + $0.shared }.filter(AgentState.edgeTones.contains)
    }
}

/// Each agent past an end of the list, most urgent first.
struct AgentsOutOfView: Equatable {
    var above: [AgentState] = []
    var below: [AgentState] = []

    init(rows: [ListEdgeRow], inView: Set<String>) {
        guard !inView.isEmpty else { return }
        let shown = rows.indices.filter { inView.contains(rows[$0].id) }
        // With none of Projects on screen, the tip, Pinned or Usage rows that are
        // say which side of it the list has stopped on.
        let first = shown.first ?? (inView.contains(where: ListEdgeRow.isUsage) ? rows.endIndex : 0)
        let last = shown.last ?? first - 1
        above = Self.agents(rows[..<first])
        below = Self.agents(rows[(last + 1)...])
    }

    private static func agents(_ rows: ArraySlice<ListEdgeRow>) -> [AgentState] {
        rows.flatMap(\.states).sorted { $0.rank < $1.rank }
    }
}

/// Where each of `count` agents' pieces sits along a line `width` long: equal
/// pieces 2 apart, 6 after every fifth so a long run still reads in fives, on
/// whole points so the gaps stay sharp. Pieces that no longer fit are left off.
private func edgeLineSpans(count: Int, width: CGFloat) -> [Range<CGFloat>] {
    guard count > 0 else { return [] }
    let gap: CGFloat = 2
    let wide = gap * 3
    let gaps = CGFloat(count - 1) * gap + CGFloat((count - 1) / 5) * (wide - gap)
    let unit = max((width - gaps) / CGFloat(count), gap)
    var spans: [Range<CGFloat>] = []
    var position: CGFloat = 0
    for piece in 1...count {
        let start = position.rounded()
        guard start < width else { break }
        position += unit
        spans.append(start..<min(position.rounded(), width))
        position += piece % 5 == 0 ? wide : gap
    }
    return spans
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
            ListEdgeLine(states: edges.above)
            Spacer(minLength: 0)
            ListEdgeLine(states: edges.below)
        }
        .ignoresSafeArea(edges: .bottom)
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }
}

/// A piece per agent, each state's pieces drawn as one shape so they sweep and
/// pulse together.
private struct ListEdgeLine: View {
    let states: [AgentState]

    var body: some View {
        ZStack {
            ForEach(AgentState.edgeTones.filter(states.contains), id: \.self) { tone in
                EdgePieces(states: states, tone: tone).agentTone(tone).transition(.opacity)
            }
        }
        .frame(height: 2)
        .animation(.easeOut(duration: 0.16), value: states)
    }
}

/// `tone`'s pieces of a line split for each agent in `states`.
private struct EdgePieces: Shape {
    let states: [AgentState]
    let tone: AgentState

    func path(in rect: CGRect) -> Path {
        var path = Path()
        for (span, state) in zip(edgeLineSpans(count: states.count, width: rect.width), states) where state == tone {
            path.addRect(CGRect(x: rect.minX + span.lowerBound, y: rect.minY,
                                width: span.upperBound - span.lowerBound, height: rect.height))
        }
        return path
    }
}
