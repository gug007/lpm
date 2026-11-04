import SwiftUI

/// A skill not made in lpm in a list: `/name` over what it does.
struct OtherSkillRow: View {
    let skill: OtherSkill

    var body: some View {
        VStack(alignment: .leading, spacing: 3) {
            Text("/\(skill.name)")
                .font(.system(.subheadline, design: .monospaced).weight(.semibold))
            if !skill.description.isEmpty {
                Text(skill.description)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(2)
            }
        }
        .padding(.vertical, 2)
    }
}
