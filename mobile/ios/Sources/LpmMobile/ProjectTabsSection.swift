import SwiftUI

/// The project screen's open tabs, each with its swipe actions and long-press
/// menu, then New tab. Close takes effect at once and the screen offers Undo;
/// Fork into Copy and Close Other Tabs only ask for it, and the screen confirms.
struct ProjectTabsSection: View {
    @Environment(AppModel.self) private var model
    let project: String
    let terminals: [TerminalInfo]
    let agents: [String: ProjectAgentRow]
    let creating: Bool
    @Binding var renaming: TabRename?
    @Binding var forkingIntoCopy: TerminalInfo?
    @Binding var closingOthers: TerminalInfo?
    let onOpen: (TerminalInfo) -> Void
    // A tab this phone asked the Mac for, such as a fork, once it lands.
    let onSpawned: (TerminalInfo) -> Void
    let onNew: () -> Void

    var body: some View {
        Section {
            // Keyed by the tab, not its terminal, so a tab that moves to a new one
            // keeps its row.
            ForEach(terminals, id: \.tabKey) { t in
                TabRow(term: t, agent: agents[t.id], onOpen: { onOpen(t) })
                    .tabMenu(term: t, agent: agents[t.id]) {
                        pinButton(t)
                        renameButton(t)
                        TabMenuExtras(term: t, onSpawned: onSpawned, forkingIntoCopy: $forkingIntoCopy)
                        TabClaudeAccountMenu(term: t, working: agents[t.id]?.state == .working)
                        closeButton(t)
                        CloseOtherTabsButton(term: t, closingOthers: $closingOthers)
                    }
                    .compactRow()
                    .swipeActions(edge: .leading, allowsFullSwipe: true) {
                        pinButton(t).tint(.orange)
                    }
                    // No full swipe: a stray swipe mustn't be enough to end a
                    // tab's process.
                    .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                        // Not a destructive role: the list removes the row itself,
                        // and Undo puts it back.
                        Button {
                            close(t)
                        } label: {
                            Label("Close", systemImage: "xmark")
                        }
                        .tint(.red)
                        renameButton(t).tint(.gray)
                    }
            }
            .onMove(perform: move)
            if creating {
                TerminalRowSkeleton()
                    .compactRow()
            }
            Button(action: onNew) {
                HStack(spacing: 8) {
                    Image(systemName: "plus")
                    Text("New tab")
                }
            }
            .disabled(creating)
            .compactRow()
        } header: {
            SectionTitle(text: "Tabs")
        }
    }

    private func pinButton(_ t: TerminalInfo) -> some View {
        Button {
            model.pinTerminal(project, id: t.id)
        } label: {
            Label(t.pinned ? "Unpin" : "Pin", systemImage: t.pinned ? "pin.slash" : "pin")
        }
    }

    private func renameButton(_ t: TerminalInfo) -> some View {
        Button {
            renaming = TabRename(t)
        } label: {
            Label("Rename", systemImage: "pencil")
        }
    }

    private func closeButton(_ t: TerminalInfo) -> some View {
        Button(role: .destructive) { close(t) } label: {
            Label("Close", systemImage: "xmark")
        }
    }

    private func close(_ t: TerminalInfo) {
        Haptics.warning()
        withAnimation { model.closeTerminal(project, id: t.id) }
    }

    private func move(from source: IndexSet, to destination: Int) {
        var order = terminals.map(\.id)
        order.move(fromOffsets: source, toOffset: destination)
        model.reorderTerminals(project, order: order)
    }
}

/// The Tabs section while its list isn't known yet: placeholder rows instead of
/// an empty list someone could take for "no tabs".
struct ProjectTabsLoadingSection: View {
    var body: some View {
        Section {
            ForEach(0..<3, id: \.self) { _ in
                TerminalRowSkeleton()
                    .compactRow()
            }
        } header: {
            SectionTitle(text: "Tabs")
        }
    }
}
