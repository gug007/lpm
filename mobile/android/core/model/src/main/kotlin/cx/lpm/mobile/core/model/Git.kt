package cx.lpm.mobile.core.model

import kotlinx.serialization.json.JsonObject

/**
 * One changed file in the working tree (mirrors the desktop git status row).
 * `status` is one of added | deleted | renamed | modified | untracked.
 */
data class GitFile(
    val path: String,
    val status: String,
    val staged: Boolean,
    // Opaque change token from the server; may be absent on older servers (treated
    // as "changed" by the live-refresh comparison).
    val stamp: String
) {
    val id: String get() = path

    companion object {
        fun parse(o: JsonObject): GitFile = GitFile(
            path = o.string("path").orEmpty(),
            status = o.string("status") ?: "modified",
            staged = o.bool("staged") ?: false,
            stamp = o.string("stamp").orEmpty()
        )
    }
}

/**
 * A repository snapshot for the review screen: the branch and its relation to the
 * upstream, whether the GitHub CLI is available for PRs, and the changed files.
 * `isRepo` false is a valid snapshot (the project just isn't a git repo).
 */
data class GitSnapshot(
    val isRepo: Boolean,
    val branch: String,
    val detached: Boolean,
    val hasUpstream: Boolean,
    val ahead: Int,
    val behind: Int,
    val defaultBranch: String,
    // Commits on HEAD that aren't on the default branch, sent only for a branch with
    // no upstream; null from a Mac that doesn't count them.
    val aheadOfDefault: Int? = null,
    val ghCli: Boolean,
    val files: List<GitFile>,
    val autoPulled: AutoPulled?,
    // Lines the changed files add and remove; null from a Mac that doesn't count them.
    val linesAdded: Int? = null,
    val linesRemoved: Int? = null,
    // The issue the branch was started from, which its pull request closes.
    val issue: Int? = null,
    // Conflicts a merge, a pull or a rebase left; null when there are none.
    val merge: GitMergeState? = null
) {
    companion object {
        fun parse(o: JsonObject): GitSnapshot = GitSnapshot(
            isRepo = o.bool("isRepo") ?: false,
            branch = o.string("branch").orEmpty(),
            detached = o.bool("detached") ?: false,
            hasUpstream = o.bool("hasUpstream") ?: false,
            ahead = o.int("ahead") ?: 0,
            behind = o.int("behind") ?: 0,
            defaultBranch = o.string("defaultBranch").orEmpty(),
            aheadOfDefault = o.int("aheadOfDefault"),
            ghCli = o.bool("ghCli") ?: false,
            files = o.list("files", GitFile::parse),
            autoPulled = AutoPulled.parse(o["autoPulled"]),
            linesAdded = o.int("linesAdded"),
            linesRemoved = o.int("linesRemoved"),
            issue = o.int("issue"),
            merge = GitMergeState.parse(o.obj("merge"))
        )
    }
}

/** A single file's unified diff, ready for the review screen to parse and render. */
data class GitDiffResult(val diff: String, val binary: Boolean, val truncated: Boolean)

/**
 * One file's result inside a `gitDiffs` batch reply. `error` set (and `result`
 * null) means that file's diff couldn't be produced; otherwise `result` carries the
 * diff.
 */
data class GitDiffEntry(val path: String, val result: GitDiffResult?, val error: String?) {
    companion object {
        fun parse(o: JsonObject): GitDiffEntry {
            val path = o.string("path").orEmpty()
            val error = o.string("error")
            if (error != null) return GitDiffEntry(path, result = null, error = error)
            val result = GitDiffResult(
                diff = o.string("diff").orEmpty(),
                binary = o.bool("binary") ?: false,
                truncated = o.bool("truncated") ?: false
            )
            return GitDiffEntry(path, result = result, error = null)
        }
    }
}

/**
 * A branch offered in the switch-branch sheet. `remote` is the remote name for a
 * remote-only branch (e.g. "origin") and empty for a local branch.
 */
data class GitBranch(val name: String, val committerDate: String, val remote: String) {
    val id: String get() = if (remote.isEmpty()) name else "$remote/$name"
    val isRemote: Boolean get() = remote.isNotEmpty()

    companion object {
        fun parse(o: JsonObject): GitBranch = GitBranch(
            name = o.string("name").orEmpty(),
            committerDate = o.string("committerDate").orEmpty(),
            remote = o.string("remote").orEmpty()
        )
    }
}

/**
 * The desktop's AI git shortcuts: commit with an AI-written message, the same then
 * push, and the full branch → commit → push → pull request chain.
 */
enum class GitAutoKind(val rawValue: String) {
    Commit("commit"),
    CommitPush("commitPush"),
    Pr("pr")
    ;

    val id: String get() = rawValue

    val title: String
        get() = when (this) {
            Commit -> "Auto Commit"
            CommitPush -> "Auto Commit and Push"
            Pr -> "Auto Create PR"
        }

    val subtitle: String
        get() = when (this) {
            Commit -> "AI writes the message, then commits"
            CommitPush -> "AI writes the message, commits, and pushes"
            Pr -> "AI names the branch, commits, pushes, and opens the PR"
        }

    val stepIds: List<String>
        get() = when (this) {
            Commit -> listOf("commit")
            CommitPush -> listOf("commit", "push")
            Pr -> listOf("branch", "commit", "push", "pr")
        }

    companion object {
        fun of(rawValue: String?): GitAutoKind? = entries.firstOrNull { it.rawValue == rawValue }
    }
}

data class GitAutoStep(val id: String, val status: Status, val detail: String) {
    enum class Status(val rawValue: String) {
        Pending("pending"),
        Running("running"),
        Done("done"),
        Failed("failed"),
        Skipped("skipped")
        ;

        companion object {
            fun of(rawValue: String?): Status? = entries.firstOrNull { it.rawValue == rawValue }
        }
    }

    val label: String
        get() = when (id) {
            "branch" -> "Create branch"
            "commit" -> "Commit changes"
            "push" -> "Push"
            "pr" -> "Open pull request"
            else -> id
        }
}

/**
 * One run as the Mac reports it. The Mac owns the run, so this is always the whole
 * state, never a delta; `runId` 0 is the phone's placeholder until the Mac's first
 * frame lands.
 */
data class GitAutoRun(
    val runId: Int,
    val nonce: String,
    val kind: GitAutoKind,
    val phase: Phase,
    val canceling: Boolean,
    val steps: List<GitAutoStep>,
    val error: String,
    val message: String,
    val rebased: Boolean,
    val url: String,
    val title: String,
    val branch: String,
    val base: String
) {
    enum class Phase(val rawValue: String) {
        Running("running"),
        Done("done"),
        Failed("failed"),
        Canceled("canceled")
        ;

        companion object {
            fun of(rawValue: String?): Phase? = entries.firstOrNull { it.rawValue == rawValue }
        }
    }

    val running: Boolean get() = phase == Phase.Running

    companion object {
        fun parse(o: JsonObject): GitAutoRun? {
            val kind = GitAutoKind.of(o.string("kind").orEmpty()) ?: return null
            val phase = Phase.of(o.string("phase").orEmpty()) ?: return null
            return GitAutoRun(
                runId = o.int("runId") ?: 0,
                nonce = o.string("nonce").orEmpty(),
                kind = kind,
                phase = phase,
                canceling = o.bool("canceling") ?: false,
                steps = o.objects("steps").orEmpty().mapNotNull { s ->
                    val id = s.string("id") ?: return@mapNotNull null
                    GitAutoStep(
                        id = id,
                        status =
                            GitAutoStep.Status.of(s.string("status")) ?: GitAutoStep.Status.Pending,
                        detail = s.string("detail").orEmpty()
                    )
                },
                error = o.string("error").orEmpty(),
                message = o.string("message").orEmpty(),
                rebased = o.bool("rebased") ?: false,
                url = o.string("url").orEmpty(),
                title = o.string("title").orEmpty(),
                branch = o.string("branch").orEmpty(),
                base = o.string("base").orEmpty()
            )
        }

        /** The phone's stand-in for a run it just asked for, until the Mac's first frame. */
        fun placeholder(kind: GitAutoKind, nonce: String = newNonce()): GitAutoRun = GitAutoRun(
            runId = 0,
            nonce = nonce,
            kind = kind,
            phase = Phase.Running,
            canceling = false,
            steps = kind.stepIds.map {
                GitAutoStep(id = it, status = GitAutoStep.Status.Pending, detail = "")
            },
            error = "",
            message = "",
            rebased = false,
            url = "",
            title = "",
            branch = "",
            base = ""
        )

        // Swift's `UUID().uuidString`, which is upper case.
        private fun newNonce(): String = java.util.UUID.randomUUID().toString().uppercase()
    }
}
