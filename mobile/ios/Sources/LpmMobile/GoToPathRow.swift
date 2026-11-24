import SwiftUI

/// The path typed into Go to File: a file opens in the preview wherever it is on
/// the Mac, and a folder is pushed, in the project or not.
struct GoToPathRow: View {
    let project: Project
    let located: LocatedPath
    let onOpen: (String) -> Void

    /// The project's name for it, else the Mac's.
    private var shown: String {
        guard let rel = located.rel, !rel.isEmpty else { return located.path }
        return rel
    }

    var body: some View {
        if located.kind == .file {
            Button { onOpen(shown) } label: { GoToFileRow(path: shown) }
        } else {
            NavigationLink {
                ProjectFilesScreen(project: project, dir: located.rel ?? located.path)
            } label: {
                GoToFileRow(path: shown, isFolder: true, note: located.rel == nil ? "Outside the project" : nil)
            }
        }
    }
}
