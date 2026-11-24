package cx.lpm.mobile.core.protocol

import cx.lpm.mobile.core.model.BranchScope
import cx.lpm.mobile.core.model.CheckLog
import cx.lpm.mobile.core.model.FileWriteResult
import cx.lpm.mobile.core.model.GitDiffEntry
import cx.lpm.mobile.core.model.PrDiscussion
import cx.lpm.mobile.core.model.RepoIssue
import cx.lpm.mobile.core.model.SecretFinding
import cx.lpm.mobile.core.model.bool
import cx.lpm.mobile.core.model.list
import cx.lpm.mobile.core.model.obj
import cx.lpm.mobile.core.model.objects
import cx.lpm.mobile.core.model.string
import cx.lpm.mobile.core.model.strings

/** What the look for secrets found; empty on a failure, which never stops a commit. */
data class SecretScanReply(
    val project: String,
    val findings: List<SecretFinding>,
    val error: String?
) : Inbound

/** The branch's changes; [scope] null when there's nothing to compare with. */
data class BranchFilesReply(val project: String, val scope: BranchScope?, val error: String?) :
    Inbound

data class BranchDiffsReply(
    val project: String,
    val entries: List<GitDiffEntry>,
    val error: String?
) : Inbound

data class PrDiscussionReply(
    val project: String,
    val discussion: PrDiscussion?,
    val error: String?
) : Inbound

/** The repository's open issues; null when the Mac couldn't read them. */
data class RepoIssuesReply(val project: String, val issues: List<RepoIssue>?) : Inbound

/** One issue as the @ menu puts it in the message. */
data class RepoIssueReply(val reqId: String, val mention: String?, val error: String?) : Inbound

data class CheckLogReply(
    val project: String,
    val url: String,
    val log: CheckLog?,
    val error: String?
) : Inbound

data class FileWriteReply(val result: FileWriteResult) : Inbound

internal val gitExtrasParsers = parsers {
    put("gitScanSecrets") { o ->
        SecretScanReply(
            project = o.str("project"),
            findings = if (o.ok) {
                o.objects(
                    "findings"
                ).orEmpty().mapNotNull(SecretFinding::parse)
            } else {
                emptyList()
            },
            error = o.failure("Couldn't check the commit for secrets.")
        )
    }
    put("gitBranchFiles") { o ->
        BranchFilesReply(
            project = o.str("project"),
            scope = if (o.ok) BranchScope.parse(o) else null,
            error = o.failure("Couldn't read the branch.")
        )
    }
    put("gitBranchDiffs") { o ->
        BranchDiffsReply(
            project = o.str("project"),
            entries = o.list("files", GitDiffEntry::parse),
            error = o.failure("Couldn't load the diffs.")
        )
    }
    put("gitPrDiscussion") { o ->
        PrDiscussionReply(
            project = o.str("project"),
            discussion = if (o.ok) {
                o.obj("discussion")?.let {
                    PrDiscussion.parse(it, o.str("prompt"))
                }
            } else {
                null
            },
            error = o.failure("Couldn't read the pull request.")
        )
    }
    put("gitIssues") { o ->
        RepoIssuesReply(
            project = o.str("project"),
            issues = if (o.ok) {
                o.objects("issues").orEmpty().mapNotNull(RepoIssue::parse)
            } else {
                null
            }
        )
    }
    put("gitIssue") { o ->
        RepoIssueReply(
            reqId = o.str("reqId"),
            mention = if (o.ok) o.obj("issue")?.string("mention") else null,
            error = o.failure("Couldn't read the issue.")
        )
    }
    put("gitCheckLog") { o ->
        CheckLogReply(
            project = o.str("project"),
            url = o.str("url"),
            log = if (o.ok) {
                CheckLog(
                    o.str("step"),
                    o.strings("lines").orEmpty(),
                    o.bool("more") ?: false
                )
            } else {
                null
            },
            error = o.failure("Couldn't read the log.")
        )
    }
    put("writeFile") { o ->
        FileWriteReply(
            FileWriteResult(
                reqId = o.string("reqId").orEmpty(),
                sha256 = if (o.ok) o.string("sha256") else null,
                changed = o.bool("changed") ?: false,
                error = o.failure("Couldn't save the file.")
            )
        )
    }
}
