import SwiftUI

/// The tab menu items a Mac offers when it takes them (`tabMenu`), each only for
/// a tab the desktop's own menu offers it for: the conversation title, and a fork
/// here or in a copy of the project.
struct TabMenuExtras: View {
    @Environment(AppModel.self) private var model
    let term: TerminalInfo
    let onSpawned: (TerminalInfo) -> Void
    @Binding var forkingIntoCopy: TerminalInfo?

    var body: some View {
        if model.canUseTabMenu {
            if term.canTitle {
                Button { model.useConversationTitle(term) } label: {
                    Label("Use Conversation Title", systemImage: "sparkles")
                }
            }
            if term.canFork {
                Button { model.forkTerminal(term, onSpawn: onSpawned) } label: {
                    Label("Fork Session", systemImage: "arrow.triangle.branch")
                }
            }
            if term.canForkCopy {
                Button { forkingIntoCopy = term } label: {
                    Label("Fork into Copy", systemImage: "plus.square.on.square")
                }
            }
        }
    }
}

/// Close Other Tabs, below Close as on the desktop; only while there are other
/// unpinned tabs to close.
struct CloseOtherTabsButton: View {
    @Environment(AppModel.self) private var model
    let term: TerminalInfo
    @Binding var closingOthers: TerminalInfo?

    var body: some View {
        if model.canUseTabMenu && !model.otherClosableTerminals(term).isEmpty {
            Button(role: .destructive) { closingOthers = term } label: {
                Label("Close Other Tabs", systemImage: "xmark.square")
            }
        }
    }
}

extension View {
    /// The two tab menu items that ask first, as the desktop's do: a fork into a
    /// new copy of the project, and closing the other tabs.
    func tabMenuConfirmations(forkingIntoCopy: Binding<TerminalInfo?>,
                              closingOthers: Binding<TerminalInfo?>) -> some View {
        modifier(TabMenuConfirmations(forkingIntoCopy: forkingIntoCopy, closingOthers: closingOthers))
    }
}

private struct TabMenuConfirmations: ViewModifier {
    @Environment(AppModel.self) private var model
    @Binding var forkingIntoCopy: TerminalInfo?
    @Binding var closingOthers: TerminalInfo?

    private var othersCount: Int { closingOthers.map { model.otherClosableTerminals($0).count } ?? 0 }
    private var othersNoun: String { othersCount == 1 ? "Tab" : "Tabs" }
    private var othersBusy: Int {
        closingOthers.map { model.otherClosableTerminals($0).reduce(0) { $0 + model.busyAgents(in: $1) } } ?? 0
    }
    private var busyNote: String {
        switch othersBusy {
        case 0: ""
        case 1: "An agent is still working. "
        default: "\(othersBusy) agents are still working. "
        }
    }

    func body(content: Content) -> some View {
        content
            .confirmationDialog("Fork into a Copy",
                                isPresented: Binding(get: { forkingIntoCopy != nil },
                                                     set: { if !$0 { forkingIntoCopy = nil } }),
                                titleVisibility: .visible, presenting: forkingIntoCopy) { t in
                Button("Create Copy") {
                    Haptics.tap()
                    model.forkTerminalIntoCopy(t)
                }
                Button("Cancel", role: .cancel) {}
            } message: { t in
                Text("Create a copy of this project and continue the “\(t.title)” conversation there. The original keeps running here.")
            }
            .confirmationDialog("Close \(othersCount) Other \(othersNoun)?",
                                isPresented: Binding(get: { closingOthers != nil },
                                                     set: { if !$0 { closingOthers = nil } }),
                                titleVisibility: .visible, presenting: closingOthers) { t in
                if othersBusy > 0 && model.canCloseWhenDone {
                    Button("Close When Done") {
                        Haptics.tap()
                        withAnimation { model.closeOtherTerminals(keeping: t, whenDone: true) }
                    }
                }
                Button("Close \(othersCount) \(othersNoun)", role: .destructive) {
                    Haptics.warning()
                    withAnimation { model.closeOtherTerminals(keeping: t) }
                }
                Button("Cancel", role: .cancel) {}
            } message: { _ in
                Text(busyNote + "Whatever is running in them stops. Pinned tabs stay open.")
            }
    }
}
