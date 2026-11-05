package cx.lpm.mobile.core.model

import kotlinx.serialization.json.JsonObject

/** One choice of a dialog an agent waits on, picked by typing its [key]. */
data class AgentDialogOption(
    val key: String,
    val label: String,
    val description: String,
    /** Picking it opens a text box in the terminal instead of answering. */
    val typed: Boolean
)

/**
 * The choice an agent's CLI draws at the bottom of its terminal — a permission
 * prompt, a plan to approve, a question form — as the Mac read it off the screen
 * (PROTOCOL.md, Answering a dialog in the app).
 */
data class AgentDialog(
    /** Changes when the question or its choices do, not when the highlight moves. */
    val id: String,
    val question: String,
    val details: List<String>,
    val options: List<AgentDialogOption>
) {
    companion object {
        /** Null without an id, or with fewer than two options to pick from. */
        fun parse(o: JsonObject?): AgentDialog? {
            val id = o?.string("id")?.takeIf { it.isNotEmpty() } ?: return null
            val options = o.objects("options").orEmpty().mapNotNull { opt ->
                val key = opt.string("key")?.takeIf { it.isNotEmpty() } ?: return@mapNotNull null
                AgentDialogOption(
                    key = key,
                    label = opt.string("label").orEmpty(),
                    description = opt.string("description").orEmpty(),
                    typed = opt.bool("typed") ?: false
                )
            }
            if (options.size < 2) return null
            return AgentDialog(
                id = id,
                question = o.string("question").orEmpty(),
                details = o.strings("details").orEmpty(),
                options = options
            )
        }
    }
}

/**
 * The Mac's answer to `agentDialog`: the report waiting on a terminal (its status
 * [key] and [ts]) and the dialog its screen shows, if any.
 */
data class AgentDialogRead(
    val project: String,
    val terminalId: String,
    val key: String,
    val ts: Long,
    val dialog: AgentDialog?
) {
    companion object {
        fun parse(o: JsonObject): AgentDialogRead = AgentDialogRead(
            project = o.string("project").orEmpty(),
            terminalId = o.string("terminalId").orEmpty(),
            key = o.string("key").orEmpty(),
            ts = o.long("ts") ?: 0,
            dialog = AgentDialog.parse(o.obj("dialog"))
        )
    }
}
