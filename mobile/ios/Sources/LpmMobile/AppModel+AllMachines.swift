import Foundation

/// Show All Machines: the other machines saved on this phone listed under the
/// live Mac's own projects, each as a section that stays current while the
/// list is up. Their projects open without leaving the live Mac.
extension AppModel {
    /// Other machines this phone could list: paired with it directly, not the
    /// live Mac, and not already one of the live Mac's own sections.
    var otherSavedMachines: [MacRecord] {
        guard !demoMode, !isVisit else { return [] }
        let shownByLiveMac = Set(machineImporter.machines.filter(\.isConnected).compactMap(\.serverId))
        return macs.filter { mac in
            mac.localId != activeMacId && mac.via == nil
                && !(mac.serverId.map(shownByLiveMac.contains) ?? false)
        }
    }

    /// Whether the title menu offers Show All Machines.
    var canShowAllMachines: Bool {
        !demoMode && macs.contains { $0.localId != activeMacId && $0.via == nil }
    }

    func setShowAllMachines(_ on: Bool) {
        machineFeeds.enabled = on
        syncMachineFeeds()
    }

    /// Keep the other machines connected while the list shows them all and the
    /// app is on screen.
    func syncMachineFeeds() {
        guard !isVisit else { return }
        let on = machineFeeds.enabled && inForeground && !demoMode
        machineFeeds.keep(on ? otherSavedMachines : [])
    }

    /// What decides which machines stay connected, for the list to follow.
    var machineFeedsKey: [String] {
        [String(machineFeeds.enabled), String(demoMode), activeMacId?.uuidString ?? ""]
            + otherSavedMachines.map(\.localId.uuidString)
    }

    /// The other machines' sections, in the order they were saved.
    var pairedMachineSections: [MachineSection] {
        guard machineFeeds.enabled else { return [] }
        return otherSavedMachines.compactMap { mac in
            guard let feed = machineFeeds.feeds[mac.localId] else { return nil }
            let machine = RemoteMachine(record: mac, projects: feed.projects, connected: feed.state == .ready)
            return MachineSection(machine: machine, rows: machineRows(feed.projects ?? []), record: mac,
                                  pending: nil, throughMac: false, note: Self.note(feed))
        }
    }

    /// Every machine section the list shows: the live Mac's own machines, then
    /// the other machines saved here.
    var listedMachineSections: [MachineSection] { machineSections + pairedMachineSections }

    private static func note(_ feed: PairedMachineFeeds.Feed) -> String? {
        switch feed.state {
        case .ready: return nil
        case .connecting: return feed.projects == nil ? "Connecting…" : nil
        case .offline: return "Not answering right now"
        }
    }
}
