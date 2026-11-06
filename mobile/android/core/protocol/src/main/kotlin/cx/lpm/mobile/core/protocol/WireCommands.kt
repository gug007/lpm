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
        previous: CommandRef?,
        keepOutOfGit: Boolean? = null
    ): String = frame("lpmCommandSave") {
        put("project", project)
        put("reqId", reqId)
        putJsonObject("command") {
            putRef(command)
            put("description", description)
            put("body", body)
            if (keepOutOfGit != null) put("keepOutOfGit", keepOutOfGit)
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

    fun lpmCommandOtherFolder(
        project: String,
        reqId: String,
        scope: CommandScope,
        name: String,
        folder: String?,
        root: Boolean = false
    ): String = frame("lpmCommandOtherFolder") {
        put("project", project)
        put("reqId", reqId)
        put("scope", scope.wire)
        put("name", name)
        put("folder", folder)
        if (root) put("root", true)
    }

    fun lpmCommandConvert(
        project: String,
        reqId: String,
        scope: CommandScope,
        name: String,
        toLpm: Boolean
    ): String = frame("lpmCommandConvert") {
        put("project", project)
        put("reqId", reqId)
        put("scope", scope.wire)
        put("name", name)
        put("toLpm", toLpm)
    }

    /** A sent `/` command that isn't an lpm skill, for the menu's Most used. Gets no reply. */
    fun lpmCommandUsed(project: String, name: String): String = frame("lpmCommandUsed") {
        put("project", project)
        put("name", name)
    }

    fun lpmCommandExpand(
        project: String,
        reqId: String,
        name: String,
        args: String,
        cli: String
    ): String = frame("lpmCommandExpand") {
        put("project", project)
        put("reqId", reqId)
        put("name", name)
        put("args", args)
        put("cli", cli)
    }
}

private fun JsonObjectBuilder.putRef(ref: CommandRef) {
    put("scope", ref.scope.wire)
    put("folder", ref.folder)
    put("name", ref.name)
}
