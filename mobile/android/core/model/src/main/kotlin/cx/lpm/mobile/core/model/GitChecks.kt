package cx.lpm.mobile.core.model

import kotlinx.serialization.json.JsonObject

/** One CI check, as the desktop footer's checks menu lists it. */
data class CiCheck(
    val name: String,
    val workflow: String,
    val state: State,
    val url: String,
    /** The earlier push this result is from, when the branch's newest didn't run it. */
    val commit: String? = null
) {
    enum class State(val wire: String, val order: Int) {
        FAIL("fail", 0),
        PENDING("pending", 1),
        PASS("pass", 2),
        SKIPPED("skipped", 3);

        companion object {
            fun of(wire: String?): State = entries.firstOrNull { it.wire == wire } ?: PENDING
        }
    }

    val id: String get() = "$workflow/$name"

    /** A failed GitHub Actions or GitLab CI job, whose log the Mac can read. */
    val hasLog: Boolean get() = state == State.FAIL && runId != null

    /** "Linux host · on fcb454f": what the menu shows after the name. */
    val detail: String
        get() = listOf(workflow, commit?.let { "on $it" }.orEmpty())
            .filter { it.isNotEmpty() }
            .joinToString(" · ")

    /** The GitHub Actions run, or the GitLab job, the Mac runs again. */
    val runId: String?
        get() {
            val marker =
                listOf("/actions/runs/", "/-/jobs/").firstOrNull { url.contains(it) } ?: return null
            val id = url.substring(url.indexOf(marker) + marker.length).takeWhile { it.isDigit() }
            return id.ifEmpty { null }
        }

    companion object {
        /** How each recent commit did by itself (`gitCommitChecks`), by full hash. */
        fun commitStates(o: JsonObject): Map<String, State> = o.objects("commits").orEmpty()
            .mapNotNull { commit ->
                val sha = commit.string("sha") ?: return@mapNotNull null
                val state = State.entries.firstOrNull { it.wire == commit.string("state") }
                state?.let { sha to it }
            }
            .toMap()

        fun parse(o: JsonObject): CiCheck? {
            val name = o.string("name").orEmpty()
            if (name.isEmpty()) return null
            return CiCheck(
                name = name,
                workflow = o.string("workflow").orEmpty(),
                state = State.of(o.string("state")),
                url = o.string("url").orEmpty(),
                commit = o.string("commit")?.takeIf { it.isNotEmpty() }
            )
        }
    }
}

/**
 * How a project's branch stands on CI (`gitChecks`): its open pull request's
 * checks, else those of the commit it last pushed.
 */
data class GitChecks(
    val branch: String,
    val pr: PullRequest?,
    val commit: Commit?,
    val checks: List<CiCheck>,
    val fixPrompt: String?,
    /** What an agent is told to resolve the pull request's conflicts. */
    val resolvePrompt: String? = null,
    /** [fixPrompt] asking for a push, for an agent Keep fixing until green follows. */
    val fixLoopPrompt: String? = null,
    /** The project's Keep fixing until green loop, running or lately ended. */
    val fixLoop: CiFixLoop? = null,
    /** The Mac's wait to merge the pull request once its checks pass, if armed. */
    val mergeWatch: GitMergeWatch? = null
) {
    data class PullRequest(
        override val number: Int,
        val url: String,
        val title: String,
        val isDraft: Boolean = false,
        /** How GitHub stands on merging it; null from a Mac that can't merge. */
        val merge: GitMergeOffer? = null
    ) : ForgeRef {
        override val isGitLab: Boolean get() = url.contains("/-/merge_requests/")
    }

    data class Commit(val sha: String, val title: String, val url: String) {
        val short: String get() = sha.take(7)
    }

    private val counted: List<CiCheck> get() = checks.filter { it.state != CiCheck.State.SKIPPED }
    val failed: Int get() = counted.count { it.state == CiCheck.State.FAIL }
    val pending: Int get() = counted.count { it.state == CiCheck.State.PENDING }

    /**
     * How they stand together: failing, running or passed; null when there's nothing to
     * show (no checks, or only skipped ones).
     */
    val verdict: CiCheck.State?
        get() = when {
            counted.isEmpty() -> null
            failed > 0 -> CiCheck.State.FAIL
            pending > 0 -> CiCheck.State.PENDING
            else -> CiCheck.State.PASS
        }

    val label: String
        get() = when (verdict) {
            CiCheck.State.FAIL -> "$failed failing"
            CiCheck.State.PENDING -> "$pending running"
            else -> "Checks passed"
        }

    /** Failing first, then running, passed and skipped; by name within each. */
    val sorted: List<CiCheck>
        get() = checks.sortedWith(
            compareBy<CiCheck> { it.state.order }.thenBy(String.CASE_INSENSITIVE_ORDER) { it.name }
        )

    val failingRunIds: List<String>
        get() = checks.filter { it.state == CiCheck.State.FAIL }.mapNotNull { it.runId }.distinct()

    val heading: String
        get() = pr?.let { "Checks on ${it.ref}" }
            ?: "Checks on $branch · ${commit?.short.orEmpty()}"

    val subheading: String? get() = pr?.title ?: commit?.title

    val githubUrl: String?
        get() = (pr?.url ?: commit?.url)?.takeIf { it.isNotEmpty() }
            ?.let { if (pr?.isGitLab == true) "$it/pipelines" else "$it/checks" }

    /** The failed jobs of [runIds] running again, until the Mac says how they went. */
    fun rerunning(runIds: List<String>): GitChecks = copy(
        checks = checks.map { check ->
            if (check.state == CiCheck.State.FAIL && check.runId in runIds) {
                check.copy(state = CiCheck.State.PENDING)
            } else {
                check
            }
        }
    )

    /** "2 commits not pushed yet. These checks are for e8ddefe, the last one you pushed." */
    fun unpushedNote(ahead: Int): String? {
        val commit = commit
        if (pr != null || ahead <= 0 || commit == null) return null
        val count = if (ahead == 1) "1 commit" else "$ahead commits"
        return "$count not pushed yet. These checks are for ${commit.short}, " +
            "the last one you pushed."
    }

    companion object {
        /** Null when the reply has neither a pull request nor a commit. */
        fun parse(o: JsonObject): GitChecks? {
            val branch = o.string("branch").orEmpty()
            val fixPrompt = o.string("fixPrompt")?.takeIf { it.isNotEmpty() }
            val resolvePrompt = o.string("resolvePrompt")?.takeIf { it.isNotEmpty() }
            val fixLoopPrompt = o.string("fixLoopPrompt")?.takeIf { it.isNotEmpty() }
            val fixLoop = o.obj("fixLoop")?.let(CiFixLoop::parse)
            val mergeWatch = GitMergeWatch.parse(o.obj("mergeWatch"))?.takeIf { it.waiting }
            val p = o.obj("pr")
            val number = p?.int("number")
            if (p != null && number != null) {
                return GitChecks(
                    branch = branch,
                    pr = PullRequest(
                        number = number,
                        url = p.string("url").orEmpty(),
                        title = p.string("title").orEmpty(),
                        isDraft = p.bool("isDraft") ?: false,
                        merge = p.obj("merge")?.let(GitMergeOffer::parse)
                    ),
                    commit = null,
                    checks = p.list("checks", CiCheck::parse).filterNotNull(),
                    fixPrompt = fixPrompt,
                    resolvePrompt = resolvePrompt,
                    fixLoopPrompt = fixLoopPrompt,
                    fixLoop = fixLoop,
                    mergeWatch = mergeWatch
                )
            }
            val c = o.obj("commit") ?: return null
            val sha = c.string("sha").orEmpty()
            if (sha.isEmpty()) return null
            return GitChecks(
                branch = branch,
                pr = null,
                commit = Commit(sha, c.string("title").orEmpty(), c.string("url").orEmpty()),
                checks = c.list("checks", CiCheck::parse).filterNotNull(),
                fixPrompt = fixPrompt,
                fixLoopPrompt = fixLoopPrompt,
                fixLoop = fixLoop,
                mergeWatch = mergeWatch
            )
        }
    }
}

/** A pull request as its forge names it: a GitLab merge request goes by !N. */
interface ForgeRef {
    val number: Int
    val isGitLab: Boolean
    val ref: String get() = if (isGitLab) "!$number" else "#$number"
    val site: String get() = if (isGitLab) "GitLab" else "GitHub"
    val noun: String get() = if (isGitLab) "merge request" else "pull request"
}
