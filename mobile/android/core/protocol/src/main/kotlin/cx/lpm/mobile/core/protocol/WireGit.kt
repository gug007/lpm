package cx.lpm.mobile.core.protocol

import kotlinx.serialization.json.put

/** Git review & ship, and the Auto Commit / Auto Create PR runs. */
sealed interface WireGit {
    fun git(project: String): String = frame("git") { put("project", project) }

    fun gitDiff(project: String, path: String): String = frame("gitDiff") {
        put("project", project)
        put("path", path)
    }

    fun gitDiffs(project: String, paths: List<String>): String = frame("gitDiffs") {
        put("project", project)
        putStrings("paths", paths)
    }

    fun gitCommit(project: String, message: String, files: List<String>): String =
        frame("gitCommit") {
            put("project", project)
            put("message", message)
            putStrings("files", files)
        }

    fun gitPush(project: String): String = frame("gitPush") { put("project", project) }

    fun gitGenMessage(project: String, files: List<String>): String = frame("gitGenMessage") {
        put("project", project)
        putStrings("files", files)
    }

    fun gitGenPr(project: String): String = frame("gitGenPr") { put("project", project) }

    fun gitCreatePr(project: String, title: String, body: String): String = frame("gitCreatePr") {
        put("project", project)
        put("title", title)
        put("body", body)
    }

    fun gitPull(project: String): String = frame("gitPull") { put("project", project) }

    fun gitFetch(project: String): String = frame("gitFetch") { put("project", project) }

    fun gitAutoPullUndo(project: String): String = frame("gitAutoPullUndo") {
        put("project", project)
    }

    fun gitBranches(project: String): String = frame("gitBranches") { put("project", project) }

    fun gitHistory(project: String, skip: Int, limit: Int): String = frame("gitHistory") {
        put("project", project)
        put("skip", skip)
        put("limit", limit)
    }

    fun gitCommitFiles(project: String, hash: String): String = frame("gitCommitFiles") {
        put("project", project)
        put("hash", hash)
    }

    /** One file's patch in a commit; a renamed file passes where it came from. */
    fun gitCommitPatch(project: String, hash: String, path: String, oldPath: String?): String =
        frame("gitCommitPatch") {
            put("project", project)
            put("hash", hash)
            put("path", path)
            putNonEmpty("oldPath", oldPath)
        }

    fun gitCheckout(project: String, branch: String, remote: String): String =
        frame("gitCheckout") {
            put("project", project)
            put("branch", branch)
            put("remote", remote)
        }

    fun gitCreateBranch(project: String, name: String): String = frame("gitCreateBranch") {
        put("project", project)
        put("name", name)
    }

    fun gitDiscardAll(project: String): String = frame("gitDiscardAll") { put("project", project) }

    fun gitAuto(project: String, kind: String, nonce: String): String = frame("gitAuto") {
        put("project", project)
        put("kind", kind)
        put("nonce", nonce)
    }

    fun gitAutoState(project: String): String = frame("gitAutoState") { put("project", project) }

    fun gitAutoCancel(project: String): String = frame("gitAutoCancel") { put("project", project) }

    fun gitAutoSwitchBase(project: String, base: String): String = frame("gitAutoSwitchBase") {
        put("project", project)
        put("base", base)
    }

    fun gitWatch(project: String): String = frame("gitWatch") { put("project", project) }

    fun gitUnwatch(project: String): String = frame("gitUnwatch") { put("project", project) }
}
