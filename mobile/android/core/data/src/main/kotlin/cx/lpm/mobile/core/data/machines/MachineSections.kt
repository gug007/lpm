package cx.lpm.mobile.core.data.machines

import cx.lpm.mobile.core.data.mac.MacRecord
import cx.lpm.mobile.core.data.projects.SidebarRow
import cx.lpm.mobile.core.data.session.SessionState
import cx.lpm.mobile.core.model.Project
import cx.lpm.mobile.core.model.RemoteMachine

/**
 * A machine the live Mac connects to — a Linux server or another Mac — as a section
 * of the projects list, in the slot the Mac's own sidebar gives it.
 */
data class MachineSection(
    val machine: RemoteMachine,
    val rows: List<SidebarRow>,
    /** The machine as saved on this phone; null until it has been added here. */
    val record: MacRecord?,
    /** Where adding it to this phone stands, while it isn't on it. */
    val pending: MachineImportStatus?,
    /** Not on this phone, but the live Mac can carry the phone to it. */
    val throughMac: Boolean,
    /** How a machine saved here is doing, while it isn't answering (Show All Machines). */
    val note: MachineFeedNote? = null
) {
    val id: String get() = machine.slug
    val projectCount: Int get() = rows.count { !it.isChild }
    val canOpen: Boolean get() = record != null || throughMac
}

/**
 * A machine's projects with each copy right under the project it was made from, the
 * way the Mac's sidebar nests them.
 */
fun machineRows(projects: List<Project>): List<SidebarRow> {
    val names = projects.map { it.name }.toSet()
    fun hasParent(p: Project) = p.parentName.isNotEmpty() && p.parentName in names
    val children = projects.filter(::hasParent).groupBy { it.parentName }
    val out = mutableListOf<SidebarRow>()
    val seen = mutableSetOf<String>()
    fun emit(p: Project, isChild: Boolean) {
        if (!seen.add(p.name)) return
        out += SidebarRow(p, isChild)
        children[p.name].orEmpty().forEach { emit(it, isChild = true) }
    }
    projects.filterNot(::hasParent).forEach { emit(it, isChild = false) }
    projects.forEach { emit(it, isChild = true) }
    return out
}

/** The live Mac's connected machines, each with its projects. Demo Mode has none. */
fun machineSections(session: SessionState, importer: MachineImportState): List<MachineSection> {
    if (session.demoMode) return emptyList()
    val pending = importer.rows(session.macs).distinctBy { it.id }.associate { it.id to it.status }
    // Only a Mac this phone reaches itself can carry it on to another machine.
    val relays = session.activeRecord?.via == null
    return importer.machines.filter { it.isConnected }.map { m ->
        val record = importer.record(m, session.macs)
        MachineSection(
            machine = m,
            rows = machineRows(m.projects.orEmpty()),
            record = record,
            pending = pending[m.slug],
            throughMac = record == null && relays && m.relay
        )
    }
}
