package cx.lpm.mobile.core.data.machines

import cx.lpm.mobile.core.data.mac.MacRecord
import cx.lpm.mobile.core.model.Project
import cx.lpm.mobile.core.model.RemoteMachine
import java.time.Instant

/** Where adding one of the live Mac's machines to this phone stands, while it isn't on it. */
sealed interface MachineImportStatus {
    data object Adding : MachineImportStatus

    data class Failed(val message: String) : MachineImportStatus

    /** The user removed it from this phone; it is never re-added on its own. */
    data object Removed : MachineImportStatus

    /** The machine removed this phone, so a code the Mac arms on it is refused. */
    data object Revoked : MachineImportStatus

    data object Offline : MachineImportStatus

    data object NeedsUpdate : MachineImportStatus
}

/** One of the live Mac's machines that isn't on this phone, with where it stands. */
data class MachineImportRow(val machine: RemoteMachine, val status: MachineImportStatus) {
    val id: String get() = machine.slug
}

data class MachineImportFailure(val at: Instant, val message: String)

/**
 * The live Mac's machines and adding them here (iOS `MachineImporter`'s state). The
 * ledger and failures are keyed `<source serverId>/<slug>`, so a failure outlives
 * switching Macs and back, and a key whose record is gone is a machine the user removed.
 */
data class MachineImportState(
    /** The live Mac's serverId once it has listed its machines; null after a switch. */
    val sourceId: String? = null,
    val machines: List<RemoteMachine> = emptyList(),
    val adding: Set<String> = emptySet(),
    val failures: Map<String, MachineImportFailure> = emptyMap(),
    /** `<source>/<slug>` → the record id it was saved as (`lpm.machineImports`). */
    val ledger: Map<String, String> = emptyMap(),
    /** Keys of machines that refused this phone because they removed it. */
    val revoked: Set<String> = emptySet()
) {
    /** The machines of the live Mac that aren't on this phone, with where each stands. */
    fun rows(macs: List<MacRecord>): List<MachineImportRow> {
        val source = sourceId ?: return emptyList()
        return machines.mapNotNull { m ->
            if (isOnPhone(m, source, macs)) return@mapNotNull null
            val failure = failures[key(source, m.slug)]
            val status = when {
                m.slug in adding -> MachineImportStatus.Adding
                key(source, m.slug) in revoked -> MachineImportStatus.Revoked
                failure != null -> MachineImportStatus.Failed(failure.message)
                wasRemoved(m, source, macs) -> MachineImportStatus.Removed
                m.state == RemoteMachine.State.Ready -> MachineImportStatus.Adding
                m.state == RemoteMachine.State.Offline -> MachineImportStatus.Offline
                else -> MachineImportStatus.NeedsUpdate
            }
            MachineImportRow(m, status)
        }
    }

    /**
     * Where pairing directly with a machine the phone opens through the live Mac
     * stands, when there is something to say about it.
     */
    fun directPairing(m: RemoteMachine): MachineImportStatus? {
        val key = key(sourceId ?: return null, m.slug)
        val failure = failures[key]
        return when {
            m.slug in adding -> MachineImportStatus.Adding
            key in revoked -> MachineImportStatus.Revoked
            failure != null -> MachineImportStatus.Failed(failure.message)
            m.state == RemoteMachine.State.Update -> MachineImportStatus.NeedsUpdate
            else -> null
        }
    }

    /** The saved machine one of the live Mac's machines is, once it is on this phone. */
    fun record(machine: RemoteMachine, macs: List<MacRecord>): MacRecord? =
        sourceId?.let { record(machine, it, macs) }

    /** A connected machine's project as the live Mac lists it. */
    fun listedProject(slug: String, project: String): Project? = machines
        .firstOrNull { it.slug == slug && it.isConnected }
        ?.projects
        ?.firstOrNull { it.name == project }

    internal fun record(m: RemoteMachine, source: String, macs: List<MacRecord>): MacRecord? {
        m.serverId?.let { sid -> macs.firstOrNull { it.serverId == sid }?.let { return it } }
        val id = ledger[key(source, m.slug)] ?: return null
        return macs.firstOrNull { it.localId == id }
    }

    internal fun isOnPhone(m: RemoteMachine, source: String, macs: List<MacRecord>): Boolean =
        record(m, source, macs) != null

    internal fun wasRemoved(m: RemoteMachine, source: String, macs: List<MacRecord>): Boolean =
        key(source, m.slug) in ledger && !isOnPhone(m, source, macs)

    companion object {
        fun key(source: String, slug: String): String = "$source/$slug"
    }
}
