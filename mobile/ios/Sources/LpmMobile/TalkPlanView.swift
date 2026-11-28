import SwiftUI

/// The plan the Mac made of the sentence, a step a row: which project, which
/// agent and what it's told, each open to a change before Approve sends it back.
struct TalkPlanView: View {
    @Environment(AppModel.self) private var model
    let plan: TalkPlan

    @State private var editing = false
    @FocusState private var promptFocused: Bool

    private var talk: TalkStore { model.talk }

    private func field(_ path: WritableKeyPath<TalkPlan, String>) -> Binding<String> {
        Binding(get: { plan[keyPath: path] }, set: { talk.plan?[keyPath: path] = $0 })
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            HStack(alignment: .firstTextBaseline, spacing: 10) {
                Text("Run this plan?")
                    .font(.title3.weight(.bold))
                    .frame(maxWidth: .infinity, alignment: .leading)
                Text(plan.stepCount)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
            VStack(spacing: 0) {
                TalkPlanRow(icon: "plus.square.on.square", title: plan.placeTitle) {
                    if plan.project.isEmpty {
                        Text("Which project?").foregroundStyle(.orange)
                    } else {
                        Text(talk.projectTitle(plan.project))
                    }
                } change: {
                    Menu {
                        Picker("Project", selection: field(\.project)) {
                            ForEach(talk.projectChoices) { Text(talk.projectTitle($0)).tag($0.name) }
                        }
                    } label: {
                        TalkPlanRowLabel(title: "Change")
                    }
                }
                TalkPlanRow(icon: "sparkle", tint: providerMeta(plan.agent).color, title: "Start") {
                    Text(plan.startLine(agent: talk.agentLabel(plan.agent)))
                } change: {
                    Menu {
                        Picker("Agent", selection: field(\.agent)) {
                            ForEach(talk.agentChoices) { Text($0.label).tag($0.id) }
                        }
                    } label: {
                        TalkPlanRowLabel(title: "Change")
                    }
                    .disabled(talk.agentChoices.isEmpty)
                }
                TalkPlanRow(icon: "paperplane", title: "Send", connects: false) {
                    if editing {
                        TextField("Prompt", text: field(\.prompt), axis: .vertical)
                            .lineLimit(2...8)
                            .focused($promptFocused)
                    } else {
                        Text(plan.prompt)
                    }
                } change: {
                    Button {
                        editing.toggle()
                        promptFocused = editing
                    } label: {
                        TalkPlanRowLabel(title: editing ? "Done" : "Edit")
                    }
                }
            }
            .disabled(talk.running)
            VStack(spacing: 4) {
                if let error = talk.runError {
                    Text(error)
                        .font(.footnote)
                        .foregroundStyle(.red)
                        .multilineTextAlignment(.center)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Text("Nothing runs until you approve")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                    .padding(.bottom, 8)
                TalkSheetButton("Approve", prominent: true) { talk.approve() }
                    .disabled(!plan.canRun || talk.running)
                TalkSheetButton("Cancel") { talk.close() }
            }
            .frame(maxWidth: .infinity)
        }
    }
}
