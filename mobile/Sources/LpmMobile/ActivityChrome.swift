import SwiftUI

/// What Activity can see at all — said on the screen rather than behind a control,
/// because "why isn't my agent here?" is the question the list can't answer itself.
let activityScopeNote =
    "Activity includes supported agents started from projects opened during this session. Terminal sessions aren't tracked."

// MARK: - Header

struct ActivityHeader: View {
    let counts: ActivityCounts
    @Binding var kind: ActivityKindFilter

    var body: some View {
        VStack(spacing: 10) {
            ActivityCountsStrip(counts: counts)
            Picker("Filter activity", selection: $kind) {
                ForEach(ActivityKindFilter.allCases) { option in
                    Text(option.label).tag(option)
                }
            }
            .pickerStyle(.segmented)
        }
        .padding(.horizontal, 20)
        .padding(.top, 8)
        .padding(.bottom, 10)
    }
}

/// What the list leaves out, said where there is room to say it: the projects with
/// nothing running, and the scope of what Activity can see at all.
struct ActivityFooter: View {
    let quietProjectCount: Int

    var body: some View {
        VStack(spacing: 6) {
            if quietProjectCount > 0 {
                Text(quietProjectCount == 1
                     ? "1 other project has nothing running."
                     : "\(quietProjectCount) other projects have nothing running.")
            }
            Text(activityScopeNote)
        }
        .font(.caption)
        .foregroundStyle(.tertiary)
        .multilineTextAlignment(.center)
        .frame(maxWidth: .infinity)
        .padding(.top, 8)
    }
}

struct ActivitySectionHeader: View {
    let project: ActivityIdentity

    var body: some View {
        HStack(spacing: 6) {
            Text(project.label)
                .font(.footnote.weight(.semibold))
                .foregroundStyle(.secondary)
                .lineLimit(1)
            ActivityTags(project: project)
            Spacer()
        }
        .listRowInsets(EdgeInsets(top: 4, leading: 24, bottom: 2, trailing: 24))
    }
}

struct ActivityServicesHeader: View {
    let groups: [ActivityServiceGroup]

    var body: some View {
        let running = groups.reduce(0) { $0 + $1.running.count }
        let total = groups.reduce(running) { $0 + $1.declared.count }
        return HStack(spacing: 6) {
            Text("Services").textCase(.uppercase)
            Spacer()
            Text("\(running) of \(total) running").monospacedDigit()
        }
        .font(.footnote.weight(.semibold))
        .foregroundStyle(.secondary)
        .listRowInsets(EdgeInsets(top: 12, leading: 24, bottom: 2, trailing: 24))
    }
}

extension View {
    /// Strips a List row's chrome so the Activity cards keep their look.
    func activityRowChrome() -> some View {
        self
            .listRowInsets(EdgeInsets(top: 5, leading: 20, bottom: 5, trailing: 20))
            .listRowSeparator(.hidden)
            .listRowBackground(Color.clear)
    }
}
