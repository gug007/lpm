package cx.lpm.mobile.core.protocol

import cx.lpm.mobile.core.model.CommandRef
import cx.lpm.mobile.core.model.CommandScope
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObjectBuilder
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonObject

/** A folder change on the Commands screen. */
enum class CommandFolderOp(val wire: String) {
    Create("create"),
    Rename("rename"),
    Delete("delete")
}

/** lpm commands: both lists, their edits, and a run's prompt. Every reply echoes `reqId`. */
sealed interface WireCommands {
    fun lpmCommands(project: String, reqId: String): String = frame("lpmCommands") {
        put("project", project)
        put("reqId", reqId)
    }

    /** Creates a command, or with [previous] edits that one (renaming or moving its file). */
    fun lpmCommandSave(
        project: String,
        reqId: String,
        command: CommandRef,
        description: String,
        body: String,
        previous: CommandRef?
    ): String = frame("lpmCommandSave") {
        put("project", project)
        put("reqId", reqId)
        putJsonObject("command") {
            putRef(command)
            put("description", description)
            put("body", body)
        }
        if (previous != null) {
            putJsonObject("previous") { putRef(previous) }
        } else {
            put("previous", JsonNull)
        }
    }

    fun lpmCommandDelete(project: String, reqId: String, target: CommandRef): String =
        frame("lpmCommandDelete") {
            put("project", project)
            put("reqId", reqId)
            putJsonObject("target") { putRef(target) }
        }

    fun lpmCommandFolder(
        project: String,
        reqId: String,
        op: CommandFolderOp,
        scope: CommandScope,
        name: String,
        newName: String? = null
    ): String = frame("lpmCommandFolder") {
        put("project", project)
        put("reqId", reqId)
        put("op", op.wire)
        put("scope", scope.wire)
        put("name", name)
        if (newName != null) put("newName", newName)
    }

    fun lpmCommandExpand(project: String, reqId: String, name: String, args: String): String =
        frame("lpmCommandExpand") {
            put("project", project)
            put("reqId", reqId)
            put("name", name)
            put("args", args)
        }
}

private fun JsonObjectBuilder.putRef(ref: CommandRef) {
    put("scope", ref.scope.wire)
    put("folder", ref.folder)
    put("name", ref.name)
}
