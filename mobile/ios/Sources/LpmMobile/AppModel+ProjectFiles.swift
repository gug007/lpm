import Foundation

extension AppModel {
    /// The Mac lists project folders for Files. An SSH project's files are on
    /// the other host.
    func canBrowseFiles(_ project: Project) -> Bool {
        client?.hostFeatures.contains(LpmClient.listDirFeature) == true && !project.isRemote
    }

    func wireProjectFiles(_ c: LpmClient) {
        c.onListDir = { [weak self] contents in self?.projectFiles.apply(contents) }
        c.onLocatePath = { [weak self] located in self?.projectFiles.apply(located) }
    }
}
