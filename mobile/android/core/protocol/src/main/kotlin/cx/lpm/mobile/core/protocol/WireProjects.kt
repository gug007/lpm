package cx.lpm.mobile.core.protocol

import cx.lpm.mobile.core.model.ClaudeAccountChoice
import cx.lpm.mobile.core.model.DuplicateOptions
import cx.lpm.mobile.core.model.RunMode
import cx.lpm.mobile.core.model.WorkStatusInput
import cx.lpm.mobile.core.model.trimmingWhitespace
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.put

/** The projects list: lifecycle, duplicates, statuses, folders and new projects. */
sealed interface WireProjects {
    fun projects(): String = frame("projects")

    fun sidebar(): String = frame("sidebar")

    fun start(name: String, profile: String = ""): String = frame("start") {
        put("name", name)
        put("profile", profile)
    }

    fun stop(name: String): String = frame("stop") { put("name", name) }

    fun toggleService(name: String, service: String): String = frame("toggleService") {
        put("name", name)
        put("service", service)
    }

    /**
     * Stop a service's process if it still runs and start it again; also brings back
     * one that ended. Only for a Mac whose `features` has "serviceRestart".
     */
    fun restartService(name: String, service: String): String = frame("restartService") {
        put("name", name)
        put("service", service)
    }

    /** Stop one service whatever its state; never starts one that ended. */
    fun stopService(name: String, service: String): String = frame("stopService") {
        put("name", name)
        put("service", service)
    }

    fun status(project: String): String = frame("status") { put("project", project) }

    /**
     * Dismiss a finished agent status from the Activity list. Clears every entry on
     * `paneId` holding `value`, exactly like the desktop's tab-click dismiss.
     */
    fun clearStatus(project: String, paneId: String, value: String): String = frame("clearStatus") {
        put("project", project)
        put("paneId", paneId)
        put("value", value)
    }

    /** Only for a Mac whose `features` has "agentArchive". */
    fun archiveStatus(project: String, keys: List<String>): String = frame("archiveStatus") {
        put("project", project)
        putStrings("keys", keys)
    }

    fun markStatusSeen(project: String, keys: List<String>): String = frame("markStatusSeen") {
        put("project", project)
        putStrings("keys", keys)
    }

    fun markStatusUnread(project: String, keys: List<String>): String = frame("markStatusUnread") {
        put("project", project)
        putStrings("keys", keys)
    }

    fun duplicate(name: String, options: DuplicateOptions): String = frame("duplicate") {
        put("name", name)
        put("count", options.count)
        putStrings("labels", options.labels.take(options.count).map { it.trimmingWhitespace() })
        put("excludeUncommitted", options.excludeUncommitted)
        put("reinstallDeps", options.reinstallDeps)
        put("pullLatest", options.pullLatest)
        put("groupName", options.groupName.trimmingWhitespace())
        put("runMode", options.runMode.rawValue)
        when (options.runMode) {
            RunMode.Action -> put("action", options.actionName)
            RunMode.Command -> put("command", options.command.trimmingWhitespace())
            RunMode.None -> Unit
        }
        if (options.runMode != RunMode.None) {
            putNonEmpty("prompt", options.prompt.trimmingWhitespace())
        }
    }

    fun duplicateDefaults(): String = frame("duplicateDefaults")

    fun remove(name: String): String = frame("remove") { put("name", name) }

    /** Rename a project's display label. An empty `name` clears it (falls back to the id). */
    fun renameProject(project: String, name: String): String = frame("renameProject") {
        put("project", project)
        put("name", name)
    }

    /** Set a duplicate's work status; a null `status` clears it. */
    fun setWorkStatus(project: String, status: WorkStatusInput?): String = frame("setWorkStatus") {
        put("project", project)
        put("status", status?.wire ?: JsonNull)
    }

    /** Set a project's own auto pull choice; a null `value` follows the default. */
    fun setAutoPull(project: String, value: Boolean?): String = frame("setAutoPull") {
        put("project", project)
        put("value", value)
    }

    fun claudeAccounts(): String = frame("claudeAccounts")

    /** Set a project's Claude account, first confirming `confirm` as the person's own. */
    fun setClaudeAccount(
        project: String,
        choice: ClaudeAccountChoice,
        confirm: List<String>
    ): String = frame("setClaudeAccount") {
        put("project", project)
        put("choice", choice.wire)
        if (confirm.isNotEmpty()) putStrings("confirm", confirm)
    }

    fun sidebarCreateFolder(name: String): String = frame("sidebarCreateFolder") {
        put("name", name)
    }

    fun sidebarRenameFolder(name: String, newName: String): String = frame("sidebarRenameFolder") {
        put("name", name)
        put("newName", newName)
    }

    fun sidebarDeleteFolder(name: String): String = frame("sidebarDeleteFolder") {
        put("name", name)
    }

    /**
     * Move a project into a folder (by name, created if absent), or out to the top
     * level when `folder` is null.
     */
    fun sidebarMoveProject(project: String, folder: String?): String = frame("sidebarMoveProject") {
        put("project", project)
        putNonEmpty("folder", folder)
    }

    /**
     * List the folders under `path` for the Mac folder browser. An empty/`~` path
     * resolves to $HOME on the Mac; else an absolute path.
     */
    fun listDirs(path: String): String = frame("listDirs") { put("path", path) }

    fun listSshHosts(): String = frame("listSshHosts")

    /** Create a new empty project (or adopt an existing folder) rooted at `root`. */
    fun createProject(name: String, root: String): String = frame("createProject") {
        put("name", name)
        put("root", root)
    }

    /**
     * Create a project backed by an SSH host. `ssh` is the connection map (`host`,
     * `user`, `port`, `key`, `dir`) the form built.
     */
    fun createSshProject(name: String, ssh: JsonObject): String = frame("createSshProject") {
        put("name", name)
        put("ssh", ssh)
    }

    /**
     * Clone a git repo into a new project (slow — the reply arrives asynchronously
     * after the clone finishes on the Mac).
     */
    fun cloneProject(name: String, url: String, branch: String, destParent: String): String =
        frame("cloneProject") {
            put("name", name)
            put("url", url)
            put("branch", branch)
            put("destParent", destParent)
        }
}
