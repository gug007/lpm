package cx.lpm.mobile.core.protocol

import kotlinx.serialization.json.put

/** The review's extras: secrets, branch scope, the PR review, check logs, saving a file. */
sealed interface WireGitExtras {
    fun gitScanSecrets(project: String, files: List<String>): String = frame("gitScanSecrets") {
        put("project", project)
        putStrings("files", files)
    }

    fun gitBranchFiles(project: String): String = frame("gitBranchFiles") {
        put("project", project)
    }

    fun gitBranchDiffs(project: String, paths: List<String>): String = frame("gitBranchDiffs") {
        put("project", project)
        putStrings("paths", paths)
    }

    fun gitPrDiscussion(project: String): String = frame("gitPrDiscussion") {
        put("project", project)
    }

    fun gitCheckLog(project: String, url: String): String = frame("gitCheckLog") {
        put("project", project)
        put("url", url)
    }

    fun writeFile(
        project: String,
        path: String,
        content: String,
        base: String,
        reqId: String
    ): String = frame("writeFile") {
        put("project", project)
        put("path", path)
        put("content", content)
        put("base", base)
        put("reqId", reqId)
    }
}
