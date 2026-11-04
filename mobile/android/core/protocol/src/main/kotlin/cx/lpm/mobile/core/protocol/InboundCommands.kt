package cx.lpm.mobile.core.protocol

import cx.lpm.mobile.core.model.ExpandedCommand
import cx.lpm.mobile.core.model.LpmCommandLists
import cx.lpm.mobile.core.model.obj
import cx.lpm.mobile.core.model.reqIdString
import cx.lpm.mobile.core.model.strings

/** Replies to the lpm commands verbs, and the push that one of them changed. */
sealed interface LpmCommandsInbound : Inbound {
    /**
     * A reply, paired with its request by [reqId]: both lists after `lpmCommands` and
     * every edit, the prompt after `lpmCommandExpand`. On failure [error] holds the
     * sentence to show.
     */
    data class Reply(
        val reqId: String,
        val lists: LpmCommandLists? = null,
        val expanded: ExpandedCommand? = null,
        val error: String? = null
    ) : LpmCommandsInbound

    /** A command or folder changed; `project` is "" for a change to the global list only. */
    data class Changed(val project: String) : LpmCommandsInbound
}

private val listFailures = mapOf(
    "lpmCommands" to "Couldn't load your skills.",
    "lpmCommandSave" to "Couldn't save the skill.",
    "lpmCommandDelete" to "Couldn't delete the skill.",
    "lpmCommandFolder" to "Couldn't change the folder."
)

internal val commandParsers = parsers {
    for ((verb, fallback) in listFailures) {
        put(verb) { o ->
            LpmCommandsInbound.Reply(
                reqId = o["reqId"].reqIdString(),
                lists = if (o.ok) LpmCommandLists.parse(o.obj("lists") ?: emptyObject) else null,
                error = o.failure(fallback)
            )
        }
    }
    put("lpmCommandExpand") { o ->
        LpmCommandsInbound.Reply(
            reqId = o["reqId"].reqIdString(),
            expanded = if (o.ok) {
                ExpandedCommand(o.str("text"), o.strings("missing").orEmpty())
            } else {
                null
            },
            error = o.failure("Couldn't run the command.")
        )
    }
    put("lpmCommandsChanged") { o -> LpmCommandsInbound.Changed(o.str("project")) }
}
