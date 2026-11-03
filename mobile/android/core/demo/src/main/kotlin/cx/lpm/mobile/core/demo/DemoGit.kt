package cx.lpm.mobile.core.demo

/**
 * Demo handlers for git review and ship: snapshot, diffs, commit/push/pull/fetch,
 * branches, checkout, PR drafting, and watch. Mutations update the world and push
 * `git-changed` to watchers so the review screen self-refreshes. Owns the cross-domain
 * hook [demoCloneGitState].
 */
internal fun DemoServer.registerGitHandlers() {
    register("git") { o ->
        val project = o.string("project") ?: return@register
        pushAfter(0.3) { gitSnapshot(project) }
    }
    register("gitDiff") { o ->
        val project = o.string("project") ?: return@register
        val path = o.string("path") ?: return@register
        push(
            mapOf(
                "t" to "gitDiff",
                "project" to project,
                "path" to path,
                "ok" to true,
                "diff" to demoDiff(project, path),
                "binary" to false,
                "truncated" to false
            )
        )
    }
    register("gitDiffs") { o ->
        val project = o.string("project") ?: return@register
        val paths = o.strings("paths") ?: emptyList()
        pushAfter(0.25) {
            val files = paths.map { path ->
                mapOf(
                    "path" to path,
                    "diff" to demoDiff(project, path),
                    "binary" to false,
                    "truncated" to false
                )
            }
            mapOf("t" to "gitDiffs", "project" to project, "ok" to true, "files" to files)
        }
    }
    register("gitCommit") { o ->
        val project = o.string("project") ?: return@register
        val files = o.strings("files") ?: emptyList()
        pushAfter(0.4) {
            val repo = world.git[project] ?: return@pushAfter notARepo("gitCommit", project)
            repo.files = repo.files.filter { it.path !in files }
            repo.ahead += 1
            pushGitChanged(project)
            mapOf("t" to "gitCommit", "project" to project, "ok" to true)
        }
    }
    register("gitPush") { o ->
        val project = o.string("project") ?: return@register
        pushAfter(1.2) {
            val repo = world.git[project] ?: return@pushAfter notARepo("gitPush", project)
            repo.ahead = 0
            repo.hasUpstream = true
            repo.aheadByBranch += repo.branch to 0
            mapOf("t" to "gitPush", "project" to project, "ok" to true)
        }
    }
    register("gitPull") { o ->
        val project = o.string("project") ?: return@register
        pushAfter(1.2) {
            world.git[project]?.behind = 0
            mapOf("t" to "gitPull", "project" to project, "ok" to true)
        }
    }
    register("gitFetch") { o ->
        val project = o.string("project") ?: return@register
        pushAfter(1.0) { mapOf("t" to "gitFetch", "project" to project, "ok" to true) }
    }
    register("gitBranches") { o ->
        val project = o.string("project") ?: return@register
        val repo = world.git[project]
        if (repo == null) {
            push(notARepo("gitBranches", project))
            return@register
        }
        val branches = repo.branches
            .sortedByDescending { it.committerDate }
            .map { b ->
                val d = mutableMapOf<String, Any?>(
                    "name" to b.name,
                    "committerDate" to b.committerDate
                )
                if (b.remote.isNotEmpty()) d["remote"] = b.remote
                d
            }
        push(
            mapOf(
                "t" to "gitBranches",
                "project" to project,
                "ok" to true,
                "current" to repo.branch,
                "branches" to branches
            )
        )
    }
    registerGitBranchHandlers()
    registerGitDraftHandlers()
}

private fun DemoServer.registerGitBranchHandlers() {
    register("gitCheckout") { o ->
        val project = o.string("project") ?: return@register
        val branch = o.string("branch") ?: return@register
        val remote = o.string("remote") ?: ""
        pushAfter(0.5) {
            val repo = world.git[project] ?: return@pushAfter notARepo("gitCheckout", project)
            if (repo.branch != branch) {
                repo.aheadByBranch += repo.branch to repo.ahead
                if (repo.branches.none { it.remote.isEmpty() && it.name == branch }) {
                    repo.branches =
                        listOf(DemoWorld.GitBranch(name = branch, committerDate = isoNow())) +
                        repo.branches
                }
                repo.branch = branch
                repo.detached = false
                repo.ahead = repo.aheadByBranch[branch] ?: 0
                repo.behind = 0
                repo.hasUpstream = remote.isNotEmpty() || repo.ahead > 0 ||
                    repo.branches.any { it.remote.isNotEmpty() && it.name == branch }
                pushGitChanged(project)
            }
            mapOf("t" to "gitCheckout", "project" to project, "ok" to true)
        }
    }
    register("gitCreateBranch") { o ->
        val project = o.string("project") ?: return@register
        val name = o.string("name") ?: return@register
        val trimmed = name.trimmingWhitespacesAndNewlines()
        pushAfter(0.3) {
            val repo = world.git[project] ?: return@pushAfter notARepo("gitCreateBranch", project)
            if (trimmed.isEmpty()) {
                return@pushAfter gitError("gitCreateBranch", project, "Branch name can't be empty.")
            }
            if (repo.branches.any { it.remote.isEmpty() && it.name == trimmed }) {
                return@pushAfter gitError(
                    "gitCreateBranch",
                    project,
                    "A branch named $trimmed already exists."
                )
            }
            repo.aheadByBranch += repo.branch to repo.ahead
            repo.branches = listOf(DemoWorld.GitBranch(name = trimmed, committerDate = isoNow())) +
                repo.branches
            repo.branch = trimmed
            repo.detached = false
            repo.ahead = 0
            repo.behind = 0
            repo.hasUpstream = false
            pushGitChanged(project)
            mapOf("t" to "gitCreateBranch", "project" to project, "ok" to true)
        }
    }
    register("gitWatch") { o ->
        val project = o.string("project") ?: return@register
        world.git[project]?.watched = true
        push(mapOf("t" to "gitWatch", "project" to project, "ok" to true))
    }
    register("gitUnwatch") { o ->
        val project = o.string("project") ?: return@register
        world.git[project]?.watched = false
        push(mapOf("t" to "gitUnwatch", "project" to project, "ok" to true))
    }
}

private fun DemoServer.registerGitDraftHandlers() {
    register("gitGenMessage") { o ->
        val project = o.string("project") ?: return@register
        val files = o.strings("files") ?: emptyList()
        pushAfter(1.5) {
            if (world.git[project] == null) return@pushAfter notARepo("gitGenMessage", project)
            mapOf(
                "t" to "gitGenMessage",
                "project" to project,
                "ok" to true,
                "message" to demoCommitMessage(files)
            )
        }
    }
    register("gitGenPr") { o ->
        val project = o.string("project") ?: return@register
        pushAfter(1.8) {
            val repo = world.git[project] ?: return@pushAfter notARepo("gitGenPr", project)
            val (title, body) = demoPrDraft(repo)
            mapOf(
                "t" to "gitGenPr",
                "project" to project,
                "ok" to true,
                "title" to title,
                "body" to body
            )
        }
    }
    register("gitCreatePr") { o ->
        val project = o.string("project") ?: return@register
        pushAfter(1.5) {
            val repo = world.git[project] ?: return@pushAfter notARepo("gitCreatePr", project)
            repo.ahead = 0
            repo.hasUpstream = true
            repo.aheadByBranch += repo.branch to 0
            mapOf(
                "t" to "gitCreatePr",
                "project" to project,
                "ok" to true,
                "url" to "https://github.com/demo/storefront/pull/42"
            )
        }
    }
}

private fun gitError(t: String, project: String, error: String): Dict =
    mapOf("t" to t, "project" to project, "ok" to false, "error" to error)

private fun notARepo(t: String, project: String): Dict =
    gitError(t, project, "Not a git repository.")

// cross-domain hook

/** Copy a project's git state onto a duplicate. Called by demoAddProject. */
internal fun DemoServer.demoCloneGitState(from: String, to: String) {
    val repo = world.git[from] ?: return
    world.git[to] = repo.copy(watched = false, autoPulled = null, discarded = emptyMap())
}

// helpers

internal fun DemoServer.pushGitChanged(project: String) {
    pushAfter(0.1) {
        if (world.git[project]?.watched != true) return@pushAfter null
        mapOf("t" to "git-changed", "project" to project)
    }
}

/** The snapshot with the line totals a Mac counts, taken from the diffs served. */
private fun DemoServer.gitSnapshot(project: String): Dict {
    val payload = world.gitSnapshotPayload(project)
    val repo = world.git[project]?.takeIf { it.isRepo } ?: return payload
    var added = 0
    var removed = 0
    for (file in repo.files) {
        for (line in demoDiff(project, file.path).split('\n')) {
            if (line.startsWith("+") && !line.startsWith("+++")) added++
            if (line.startsWith("-") && !line.startsWith("---")) removed++
        }
    }
    return payload + mapOf("linesAdded" to added, "linesRemoved" to removed)
}

private fun DemoServer.demoDiff(project: String, path: String): String {
    val file = world.git[project]?.files?.firstOrNull { it.path == path }
    file?.diff?.takeIf { it.isNotEmpty() }?.let { return it }
    demoCannedDiffs[path]?.let { return it }
    if (file?.status == "added" || file?.status == "untracked") return genericAddedDiff(path)
    return genericModifiedDiff(path)
}

internal fun DemoServer.isoNow(): String = iso8601(clock.instant())

internal fun demoCommitMessage(files: List<String>): String {
    val names = files.map(::lastPathComponent)
    if ("payments.ts" in names || "CheckoutForm.tsx" in names) {
        return "feat(checkout): redesign the checkout form and add a payments module"
    }
    if ("page.tsx" in names) {
        return "feat(checkout): move the checkout page to a two-column layout"
    }
    if (names.isNotEmpty() && names.all { it.lowercase().endsWith(".md") }) {
        return "docs: document the payments setup"
    }
    if (names.size == 1) return "chore: update ${names[0]}"
    return "chore: update ${names.size} files"
}

/** `NSString.lastPathComponent`. */
private fun lastPathComponent(path: String): String {
    var p = path
    while (p.length > 1 && p.endsWith("/")) p = p.dropLast(1)
    return if (p == "/") p else p.substringAfterLast('/')
}

internal fun demoPrDraft(repo: DemoWorld.GitRepo): Pair<String, String> {
    val title = if ("checkout-redesign" in repo.branch) {
        "Redesign the checkout flow"
    } else {
        prettyBranchTitle(repo.branch)
    }
    val bullets = repo.files.map { "- ${changeVerb(it.status)} `${it.path}`" }
        .ifEmpty { listOf("- $title") }
    val body = "## Summary\n" + bullets.joinToString("\n") + "\n\n" +
        "## Testing\n" +
        "- `npm test`\n" +
        "- Manual checkout run against a test payment key"
    return title to body
}

private fun prettyBranchTitle(branch: String): String {
    val tail = branch.swiftSplit('/').lastOrNull() ?: branch
    val words = tail.replace("-", " ").replace("_", " ")
    return words.graphemePrefix(1).uppercase() + words.dropFirstGrapheme()
}

private fun changeVerb(status: String): String = when (status) {
    "added", "untracked" -> "Add"
    "deleted" -> "Remove"
    "renamed" -> "Rename"
    else -> "Update"
}
