package cx.lpm.mobile.core.model

import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject

data class TerminalInfo(
    val id: String,
    /** The desktop tab name; falls back to the id for older servers. */
    val label: String,
    val project: String,
    val cols: Int,
    val rows: Int,
    val remote: Boolean,
    val pinned: Boolean,
    val emoji: String,
    // The AI CLI this terminal runs (e.g. "claude"), as detected by the desktop;
    // empty for a plain shell or an older server.
    val cli: String,
    // What the desktop's tab menu offers for this tab; false from an older server.
    val canFork: Boolean = false,
    val canForkCopy: Boolean = false,
    val canTitle: Boolean = false,
    // The tab menu's Claude Account, for a Claude tab on a Mac with "tabAccount": the
    // account the tab runs as.
    val canSwitchAccount: Boolean = false,
    val claudeAccount: String? = null,
    // While the tab moves to another account: that account's name, and the terminal
    // the tab ran before, which a screen showing it follows here.
    val switchingTo: String? = null,
    val switchedFrom: String? = null,
    // The desktop tab's own identity, the same across the new ids a restart or a move
    // to another Claude account gives it; the id from an older server.
    val tabKey: String = id
) {
    companion object {
        fun parse(o: JsonObject): TerminalInfo = TerminalInfo(
            id = o.string("id").orEmpty(),
            label = o.label(fallback = "id"),
            project = o.string("project").orEmpty(),
            cols = o.int("cols") ?: 80,
            rows = o.int("rows") ?: 24,
            remote = o.bool("remote") ?: false,
            pinned = o.bool("pinned") ?: false,
            emoji = o.string("emoji").orEmpty(),
            cli = o.string("cli").orEmpty(),
            canFork = o.bool("canFork") ?: false,
            canForkCopy = o.bool("canForkCopy") ?: false,
            canTitle = o.bool("canTitle") ?: false,
            canSwitchAccount = o.bool("canSwitchAccount") ?: false,
            claudeAccount = o.string("claudeAccount"),
            switchingTo = o.string("switchingTo"),
            switchedFrom = o.string("switchedFrom"),
            tabKey = o.string("tabKey")?.takeIf { it.isNotEmpty() } ?: o.string("id").orEmpty()
        )
    }
}

/**
 * Which surface currently owns (renders live + drives the size of) a terminal. A
 * terminal is controllable in exactly one place at a time; when the desktop (or
 * another phone) owns it, this phone shows a "take control" placeholder. `kind` is
 * "window" or "mobile".
 */
data class ControlOwner(val kind: String, val id: String, val label: String) {
    companion object {
        /** Parses the `owner` field (an object, or null when nobody owns it). */
        fun parse(o: JsonElement?): ControlOwner? = o.asObject()?.let {
            ControlOwner(
                kind = it.string("kind").orEmpty(),
                id = it.string("id").orEmpty(),
                label = it.string("label").orEmpty()
            )
        }
    }
}

data class StatusEntry(
    val key: String,
    // Running | Done | Waiting | Error
    val value: String,
    val priority: Int,
    // Unix millis.
    val timestamp: Long,
    // The terminal this status belongs to; empty when the reporting agent didn't
    // name one (older servers, or a status raised outside a pane).
    val paneID: String,
    // When the agent picked the turn up, carried across the states within it — 0
    // when the turn's start was never seen.
    val turnStart: Long,
    // When the turn finished; 0 while it is still running.
    val endedAt: Long,
    // When it was last opened; set only on a project's `seenEntries`.
    val seenAt: Long = 0
) {
    val id: String get() = key

    companion object {
        fun parse(o: JsonObject): StatusEntry = StatusEntry(
            key = o.string("key").orEmpty(),
            value = o.string("value").orEmpty(),
            priority = o.int("priority") ?: 0,
            timestamp = o.long("timestamp") ?: 0,
            paneID = o.string("paneID").orEmpty(),
            turnStart = o.long("turnStart") ?: 0,
            endedAt = o.long("endedAt") ?: 0,
            seenAt = o.long("seenAt") ?: 0
        )
    }
}

/**
 * One reply in the chunked attach: `uploadBegin` carries the upload's id and piece
 * size, `uploadChunk` how much has landed, `uploadDone` the path to paste.
 */
data class UploadStep(
    val termId: String,
    val reqId: String,
    val ok: Boolean,
    val error: String?,
    val uploadId: String,
    val chunk: Long,
    val received: Long,
    val path: String
) {
    companion object {
        fun parse(o: JsonObject): UploadStep = UploadStep(
            termId = o.string("id").orEmpty(),
            reqId = o["reqId"].reqIdString(),
            ok = o.bool("ok") ?: false,
            error = o.string("error"),
            uploadId = o.string("uploadId").orEmpty(),
            chunk = o.numberLong("chunk") ?: 0,
            received = o.numberLong("received") ?: 0,
            path = o.string("path").orEmpty()
        )
    }
}
