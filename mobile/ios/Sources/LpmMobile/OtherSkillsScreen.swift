import SwiftUI

/// The skills in one list's places that weren't made in lpm and aren't filed anywhere.
/// Tapping one reads it.
struct OtherSkillsScreen: View {
    @Environment(AppModel.self) private var model

    let project: String
    let scope: LpmCommandScope

    private var store: LpmCommandsStore { model.lpmCommands }
    private var skills: [OtherSkill] { store.lists[project]?.list(scope)?.otherGroup ?? [] }

    var body: some View {
        List {
            ForEach(skills) { skill in
                NavigationLink {
                    OtherSkillScreen(project: project, scope: scope, name: skill.name)
                } label: {
                    OtherSkillRow(skill: skill)
                }
            }
        }
        .navigationTitle("Other skills")
        .navigationBarTitleDisplayMode(.inline)
        .refreshable { store.load(project) }
        .onAppear { store.open(project) }
        .onDisappear { store.close(project) }
    }
}
