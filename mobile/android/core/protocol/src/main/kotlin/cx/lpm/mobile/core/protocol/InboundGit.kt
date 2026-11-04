package cx.lpm.mobile.core.protocol

import cx.lpm.mobile.core.model.CiCheck
import cx.lpm.mobile.core.model.CommitFile
import cx.lpm.mobile.core.model.GitAutoRun
import cx.lpm.mobile.core.model.GitBranch
import cx.lpm.mobile.core.model.GitChecks
import cx.lpm.mobile.core.model.GitDiffEntry
import cx.lpm.mobile.core.model.GitDiffResult
import cx.lpm.mobile.core.model.GitSnapshot
import cx.lpm.mobile.core.model.HistoryPage
import cx.lpm.mobile.core.model.bool
import cx.lpm.mobile.core.model.int
import cx.lpm.mobile.core.model.list
import cx.lpm.mobile.core.model.obj
import cx.lpm.mobile.core.model.string

internal val gitParsers = parsers {
    put("git") { o ->
        Inbound.Git(
            project = o.str("project"),
            snapshot = if (o.ok) GitSnapshot.parse(o) else null,
            error = o.failure("Couldn't read the repository.")
        )
    }
    put("gitDiff") { o ->
        Inbound.GitDiff(
            project = o.str("project"),
            path = o.str("path"),
            diff = o.str("diff"),
            binary = o.bool("binary") ?: false,
            truncated = o.bool("truncated") ?: false,
            error = o.failure("Couldn't load the diff.")
        )
    }
    put("gitDiffs") { o ->
        Inbound.GitDiffs(
            project = o.str("project"),
            entries = if (o.ok) o.list("files", GitDiffEntry::parse) else emptyList(),
            error = o.failure("Couldn't load the diffs.")
        )
    }
    put("gitCommit") { o -> Inbound.GitCommit(o.str("project"), o.failure("Couldn't commit.")) }
    put("gitPush") { o -> Inbound.GitPush(o.str("project"), o.failure("Couldn't push.")) }
    put("gitGenMessage") { o ->
        Inbound.GitGenMessage(
            project = o.str("project"),
            message = if (o.ok) o.str("message") else null,
            error = o.failure("Couldn't generate a message.")
        )
    }
    put("gitGenPr") { o ->
        Inbound.GitGenPr(
            project = o.str("project"),
            title = if (o.ok) o.str("title") else null,
            body = if (o.ok) o.str("body") else null,
            error = o.failure("Couldn't draft the pull request.")
        )
    }
    put("gitCreatePr") { o ->
        Inbound.GitCreatePr(
            project = o.str("project"),
            url = if (o.ok) o.str("url") else null,
            error = o.failure("Couldn't create the pull request.")
        )
    }
    put("gitPull") { o -> Inbound.GitPull(o.str("project"), o.failure("Couldn't pull.")) }
    put("gitFetch") { o -> Inbound.GitFetch(o.str("project"), o.failure("Couldn't fetch.")) }
    put("gitAutoPullUndo") { o ->
        Inbound.GitAutoPullUndo(o.str("project"), o.failure("Couldn't undo the auto pull."))
    }
    put("gitBranches") { o ->
        Inbound.GitBranches(
            project = o.str("project"),
            current = o.str("current"),
            branches = if (o.ok) o.list("branches", GitBranch::parse) else emptyList(),
            error = o.failure("Couldn't list branches.")
        )
    }
    put("gitCheckout") { o ->
        Inbound.GitCheckout(o.str("project"), o.failure("Couldn't switch branch."))
    }
    put("gitCreateBranch") { o ->
        Inbound.GitCreateBranch(o.str("project"), o.failure("Couldn't create the branch."))
    }
    put("gitDiscardAll") { o ->
        Inbound.GitDiscardAll(
            project = o.str("project"),
            error = o.failure("Couldn't discard changes."),
            undo = if (o.ok) o.string("undo")?.takeIf { it.isNotEmpty() } else null
        )
    }
    put("gitRestoreDiscarded") { o ->
        Inbound.GitRestoreDiscarded(o.str("project"), o.failure("Couldn't restore the changes."))
    }
    put("git-changed") { o -> Inbound.GitChanged(o.str("project")) }
    put("gitHistory") { o ->
        Inbound.GitHistory(
            project = o.str("project"),
            skip = o.int("skip") ?: 0,
            page = if (o.ok) HistoryPage.parse(o) else null,
            error = o.failure("Couldn't load the history.")
        )
    }
    put("gitChecks") { o ->
        Inbound.GitChecks(
            project = o.str("project"),
            checks = if (o.ok) GitChecks.parse(o) else null,
            error = o.failure("Couldn't read CI.")
        )
    }
    put("gitCommitChecks") { o ->
        Inbound.GitCommitChecks(o.str("project"), CiCheck.commitStates(o))
    }
    put("gitChecksRerun") { o ->
        Inbound.GitChecksRerun(o.str("project"), o.failure("Couldn't run the failed jobs again."))
    }
    put("gitCommitFiles") { o ->
        Inbound.GitCommitFiles(
            project = o.str("project"),
            hash = o.str("hash"),
            files = if (o.ok) o.list("files", CommitFile::parse) else null,
            error = o.failure("Couldn't load the commit.")
        )
    }
    put("gitCommitPatch") { o ->
        Inbound.GitCommitPatch(
            project = o.str("project"),
            hash = o.str("hash"),
            path = o.str("path"),
            result = if (o.ok) {
                GitDiffResult(
                    o.str("diff"),
                    binary = false,
                    truncated =
                        o.bool("truncated") ?: false
                )
            } else {
                null
            },
            error = o.failure("Couldn't load the diff.")
        )
    }
    put("gitAuto") { o ->
        Inbound.GitAuto(
            project = o.str("project"),
            run = if (o.ok) o.obj("run")?.let(GitAutoRun::parse) else null,
            error = o.failure("Couldn't start.")
        )
    }
    put("gitAutoSwitchBase") { o ->
        Inbound.GitAutoSwitchBase(
            project = o.str("project"),
            base = o.str("base"),
            error = o.failure("Couldn't switch branch."),
            pullError = o.string("pullError")
        )
    }
}
