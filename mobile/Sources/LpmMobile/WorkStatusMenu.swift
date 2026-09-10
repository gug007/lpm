import SwiftUI

/// "Status ▸" in a duplicate's menu: every status the app ships with and the
/// user's own from the Mac, in the order the Mac's Settings put them, then
/// Clear once something is set. A status that asks for a line (Blocked, or a
/// custom one flagged for it) opens the note prompt instead of applying at once.
struct WorkStatusMenu: View {
    @Environment(AppModel.self) private var model
    let project: Project
    @Binding var noteFor: WorkStatusChoice?

    private var current: WorkStatus? { project.workStatus }

    var body: some View {
        Menu {
            ForEach(model.workStatusMenu) { choice in
                Button { pick(choice) } label: { choiceLabel(choice) }
            }
            if let current {
                Divider()
                Button { pick(nil) } label: {
                    Label("Clear \(current.displayLabel)", systemImage: "xmark.circle")
                }
            }
        } label: {
            Label {
                Text("Status")
                if let current {
                    Text(current.displayEmoji.isEmpty
                         ? current.displayLabel
                         : "\(current.displayEmoji) \(current.displayLabel)")
                }
            } icon: {
                Image(systemName: "face.smiling")
            }
        }
    }

    @ViewBuilder
    private func choiceLabel(_ choice: WorkStatusChoice) -> some View {
        let title = choice.emoji.isEmpty ? choice.label : "\(choice.emoji)  \(choice.label)"
        if sameWorkStatus(current, choice.input) {
            Label(title, systemImage: "checkmark")
        } else {
            Text(title)
        }
    }

    private func pick(_ choice: WorkStatusChoice?) {
        if let choice, choice.asksNote {
            noteFor = choice
        } else {
            model.setWorkStatus(project.name, choice?.input)
        }
    }
}

/// Hosts the line a status asks for when applied: the alert and its draft,
/// seeded with the note already on the row when the choice keeps the same
/// status, so re-applying it edits the line rather than starting from blank.
private struct WorkStatusNotePrompt: ViewModifier {
    @Environment(AppModel.self) private var model
    let project: Project
    @Binding var noteFor: WorkStatusChoice?
    @State private var noteText = ""

    private var blocked: Bool { noteFor?.input.state == .blocked }

    func body(content: Content) -> some View {
        content
            .alert(noteFor?.label ?? "", isPresented: Binding(
                get: { noteFor != nil },
                set: { if !$0 { noteFor = nil } }
            ), presenting: noteFor) { choice in
                TextField(blocked ? "Waiting on…" : "What's going on…", text: $noteText)
                Button("Cancel", role: .cancel) {}
                Button("Save") {
                    var input = choice.input
                    input.note = noteText
                    model.setWorkStatus(project.name, input)
                }
            } message: { _ in
                Text(blocked
                     ? "What is blocking \(project.label)? It shows under the name in the projects list."
                     : "A line about \(project.label), shown under its name in the projects list.")
            }
            .onChange(of: noteFor) { _, choice in
                if let choice { noteText = existingNote(for: project.workStatus, choice: choice) }
            }
    }
}

extension View {
    func workStatusNotePrompt(project: Project, noteFor: Binding<WorkStatusChoice?>) -> some View {
        modifier(WorkStatusNotePrompt(project: project, noteFor: noteFor))
    }
}
