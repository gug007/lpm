import SwiftUI

/// Keep Open, above Close, on a tab that waits for its agent before it closes.
struct KeepTabOpenButton: View {
    @Environment(AppModel.self) private var model
    let term: TerminalInfo

    var body: some View {
        if term.closesWhenDone && model.canCloseWhenDone {
            Button {
                Haptics.tap()
                model.keepTerminalOpen(term)
            } label: {
                Label("Keep Open", systemImage: "timer")
            }
        }
    }
}

extension View {
    /// Asks before a tab closes on an agent mid-task, as the desktop does: now, or
    /// once it is done.
    func busyTabCloseConfirmation(_ closing: Binding<TerminalInfo?>) -> some View {
        modifier(BusyTabCloseConfirmation(closing: closing))
    }
}

private struct BusyTabCloseConfirmation: ViewModifier {
    @Environment(AppModel.self) private var model
    @Binding var closing: TerminalInfo?

    private var title: String {
        let busy = closing.map { model.busyAgents(in: $0) } ?? 0
        return busy > 1 ? "\(busy) Agents Are Still Working" : "An Agent Is Still Working"
    }

    func body(content: Content) -> some View {
        content
            .confirmationDialog(title,
                                isPresented: Binding(get: { closing != nil }, set: { if !$0 { closing = nil } }),
                                titleVisibility: .visible, presenting: closing) { t in
                if model.canCloseWhenDone {
                    if t.closesWhenDone {
                        Button("Keep Open") {
                            Haptics.tap()
                            model.keepTerminalOpen(t)
                        }
                    } else {
                        Button("Close When Done") {
                            Haptics.tap()
                            model.closeTerminalWhenDone(t)
                        }
                    }
                }
                Button("Close Now", role: .destructive) {
                    Haptics.warning()
                    withAnimation { model.closeTerminal(t.project, id: t.id) }
                }
                Button("Cancel", role: .cancel) {}
            } message: { t in
                Text(t.closesWhenDone
                     ? "“\(t.title)” closes by itself when its agent is done. Closing it now ends the agent mid-task."
                     : "Closing “\(t.title)” ends its agent mid-task.")
            }
    }
}
