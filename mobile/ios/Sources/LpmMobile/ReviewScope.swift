import SwiftUI

/// What Changes reviews: the uncommitted work, or everything the branch's own
/// commits changed since it left its base.
enum ReviewScope: Hashable {
    case uncommitted, branch
}

/// The switch at the top of Changes.
struct ReviewScopePicker: View {
    @Binding var scope: ReviewScope
    /// How many files the branch changed, once known.
    let branchFiles: Int?

    var body: some View {
        Picker("Changes to review", selection: $scope) {
            Text("Uncommitted").tag(ReviewScope.uncommitted)
            Text(branchFiles.map { "Branch · \($0) file\($0 == 1 ? "" : "s")" } ?? "Branch").tag(ReviewScope.branch)
        }
        .pickerStyle(.segmented)
        .padding(.horizontal, 16)
        .padding(.vertical, 8)
        .background(.bar)
    }
}

/// Every file by name with its folder, checked once viewed, each scrolling to
/// its diff. `key` is where the files' diffs and Viewed marks live.
struct ReviewJumpMenu: View {
    @Environment(AppModel.self) private var model
    let key: String
    let files: [GitFile]
    let proxy: ScrollViewProxy

    var body: some View {
        Menu {
            ForEach(files) { f in
                Button {
                    withAnimation { proxy.scrollTo("file-" + f.path, anchor: .top) }
                } label: {
                    Label(f.name, systemImage: model.git.isViewed(key, path: f.path)
                          ? "checkmark.circle.fill" : GitFileStatus(f.status).symbol)
                    if !f.directory.isEmpty { Text(f.directory) }
                }
            }
        } label: {
            Image(systemName: "list.bullet")
        }
        .accessibilityLabel("Jump to file")
    }
}

/// Marking a file viewed collapses it; unmarking opens it again. A header
/// pinned over its scrolled diff would collapse out from under the screen, so
/// the list goes back to it instead, the next file right below it.
@MainActor
func toggleViewedInPlace(_ git: GitReviewStore, key: String, path: String, wasOpen: Bool,
                         collapsed: Binding<[String: Bool]>, pins: HeaderPins, proxy: ScrollViewProxy) {
    let nowViewed = !git.isViewed(key, path: path)
    Haptics.tap()
    guard nowViewed, wasOpen, pins.isPinned(path) else {
        git.toggleViewed(key, path: path)
        withAnimation(.easeInOut(duration: 0.15)) { collapsed.wrappedValue[path] = nowViewed }
        return
    }
    // The scroll lands on the next layout pass, so the diff is held open until
    // it has: collapsed first, the list would lose its place.
    collapsed.wrappedValue[path] = false
    git.toggleViewed(key, path: path)
    proxy.scrollTo("file-" + path, anchor: .top)
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) {
        withAnimation(.easeInOut(duration: 0.2)) { collapsed.wrappedValue[path] = true }
    }
}
