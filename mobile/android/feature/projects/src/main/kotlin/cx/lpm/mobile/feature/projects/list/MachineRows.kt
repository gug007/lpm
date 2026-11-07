package cx.lpm.mobile.feature.projects.list

import cx.lpm.mobile.core.data.machines.MachineFeedNote
import cx.lpm.mobile.core.data.machines.MachineImportStatus
import cx.lpm.mobile.core.data.machines.MachineSection
import cx.lpm.mobile.core.model.projectAgentRows

/**
 * A machine's header and, while it is open (it is unless shut here), each of its
 * projects with the agents it has going. Only the Mac knows its own tabs' names, so
 * a machine's terminals go by their agents'.
 */
internal fun machineListRows(section: MachineSection, inputs: RowInputs): List<ProjectsListRow> {
    val machine = section.machine
    val open = inputs.expanded["m:" + section.id] ?: true
    val header = ProjectsListRow.MachineEntry(
        slug = section.id,
        name = machine.name,
        linuxHost = machine.isLinuxHost,
        detail = section.detail(inputs.activeMacId),
        count = if (machine.projects != null) section.projectCount else null,
        opensOnlyBySwitching = machine.projects == null && section.record != null,
        canOpen = section.canOpen,
        expanded = open,
        foldedAgents = if (open) emptyList() else section.rows.foldedAgents(inputs)
    )
    if (!open) return listOf(header)
    return listOf(header) + section.rows.map { row ->
        ProjectsListRow.MachineProjectEntry(
            slug = section.id,
            project = row.project,
            agents = projectAgentRows(row.project, inputs.now, emptyMap()),
            canOpen = section.canOpen,
            stale = inputs.stale
        )
    }
}

private fun MachineSection.detail(activeMacId: String?): MachineDetail? {
    note?.let {
        return when (it) {
            MachineFeedNote.Connecting -> MachineDetail.Connecting
            MachineFeedNote.NotAnswering -> MachineDetail.NotAnswering
        }
    }
    val via = record?.via
    if (via != null && via.macId == activeMacId) return MachineDetail.OpensThroughMac
    return when (val status = pending) {
        MachineImportStatus.Adding -> MachineDetail.Adding

        is MachineImportStatus.Failed -> MachineDetail.Failed(status.message)

        MachineImportStatus.Removed ->
            if (throughMac) MachineDetail.OpensThroughMac else MachineDetail.NotOnPhone

        MachineImportStatus.Revoked -> MachineDetail.Revoked

        MachineImportStatus.NeedsUpdate -> MachineDetail.NeedsUpdate

        MachineImportStatus.Offline, null -> null
    }
}
