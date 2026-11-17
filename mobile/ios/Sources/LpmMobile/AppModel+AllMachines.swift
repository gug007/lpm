import Foundation

/// Choosing the machines the projects list shows: the title menu ticks them,
/// and each ticked one lists as a section, the live Mac's own machines in their
/// slots and the others saved here under them, kept current while the list is
/// up. Their projects open without leaving the live Mac.
extension AppModel {
    /// Whether the list shows a saved machine: the live Mac always, then what
    /// the title menu ticked or cleared. One never touched there shows as it did
    /// before there was a choice: the machines connected to the live Mac, and
    /// the rest where Show All Machines was on.
    func isShown(_ mac: MacRecord) -> Bool {
        if mac.localId == activeMacId || machineFeeds.shown.contains(mac.localId) { return true }
        if machineFeeds.hidden.contains(mac.localId) { return false }
        return isOnLiveMac(mac) || (machineFeeds.showedAll && mac.via == nil)
    }

    /// Tick or clear a machine in the title menu. Clearing the live Mac moves the
    /// connection to the first machine still ticked; the last one stays ticked.
    func toggleShown(_ mac: MacRecord) {
        guard mac.localId == activeMacId else {
            setShown(mac, !isShown(mac))
            syncMachineFeeds()
            return
        }
        guard let next = macs.first(where: { $0.localId != mac.localId && isShown($0) }) else { return }
        setShown(mac, false)
        pendingNotificationTarget = nil
        switchTo(next)
    }

    private func setShown(_ mac: MacRecord, _ on: Bool) {
        if on {
            machineFeeds.shown.insert(mac.localId)
            machineFeeds.hidden.remove(mac.localId)
        } else {
            machineFeeds.shown.remove(mac.localId)
            machineFeeds.hidden.insert(mac.localId)
        }
    }

    private func isOnLiveMac(_ mac: MacRecord) -> Bool {
        machineImporter.machines.contains {
            $0.isConnected && machineImporter.record(for: $0, macs: macs)?.localId == mac.localId
        }
    }

    /// The live Mac's own machines the list shows. One that isn't saved here
    /// yet has no tick to clear.
    var shownMachineSections: [MachineSection] {
        machineSections.filter { $0.record.map(isShown) ?? true }
    }

    /// Ticked machines the phone lists itself: paired with it directly, not the
    /// live Mac, and not already one of the live Mac's own sections.
    var otherSavedMachines: [MacRecord] {
        guard !demoMode, !isVisit else { return [] }
        let shownByLiveMac = Set(machineImporter.machines.filter(\.isConnected).compactMap(\.serverId))
        return macs.filter { mac in
            mac.localId != activeMacId && mac.via == nil && isShown(mac)
                && !(mac.serverId.map(shownByLiveMac.contains) ?? false)
        }
    }

    /// Keep the other ticked machines connected while the app is on screen, and
    /// pair with the listed ones the phone only opens through the live Mac.
    func syncMachineFeeds() {
        guard !isVisit else { return }
        machineFeeds.keep(inForeground && !demoMode ? otherSavedMachines : [])
        machinesOpenedThroughLiveMac.forEach(machineImporter.pairDirectly)
    }

    /// What decides which machines stay connected, for the list to follow.
    var machineFeedsKey: [String] {
        [String(demoMode), activeMacId?.uuidString ?? ""] + otherSavedMachines.map(\.localId.uuidString)
            + machinesOpenedThroughLiveMac
    }

    /// Listed machines saved here without a pairing of their own, that the live
    /// Mac can get a pairing code from right now.
    private var machinesOpenedThroughLiveMac: [String] {
        shownMachineSections.filter { $0.record?.via != nil && $0.machine.state == .ready }.map(\.id)
    }

    /// The other machines' sections, in the order they were saved.
    var pairedMachineSections: [MachineSection] {
        otherSavedMachines.compactMap { mac in
            guard let feed = machineFeeds.feeds[mac.localId] else { return nil }
            let machine = RemoteMachine(record: mac, projects: feed.projects, connected: feed.state == .ready)
            return MachineSection(machine: machine, rows: machineRows(feed.projects ?? []), record: mac,
                                  pending: nil, throughMac: false, note: Self.note(feed))
        }
    }

    /// Every machine section the list shows: the live Mac's own machines, then
    /// the other machines saved here.
    var listedMachineSections: [MachineSection] { shownMachineSections + pairedMachineSections }

    /// How many computers the list shows, the live Mac among them.
    var shownMachineCount: Int { 1 + listedMachineSections.count }

    /// The live Mac's name over its own projects, once the list shows other computers too.
    var liveMacSectionName: String? {
        shownMachineCount > 1 ? activeRecord?.displayName : nil
    }

    private static func note(_ feed: PairedMachineFeeds.Feed) -> String? {
        switch feed.state {
        case .ready: return nil
        case .connecting: return feed.projects == nil ? "Connecting…" : nil
        case .offline: return "Not answering right now"
        }
    }
}
