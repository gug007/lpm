package cx.lpm.mobile.core.demo

/**
 * Demo Mode's merge that stopped on conflicts, in mobile-app: the branch merged into
 * main, three files with conflicts, and one it merged by itself. AI works through them
 * a file at a time, as the Mac's does.
 */
internal fun DemoServer.registerMergeConflictHandlers() {
    register("gitMergeResolve") { o ->
        mergeReply(
            "gitMergeResolve",
            o,
            act = { merge ->
                when {
                    merge.files.none { !it.resolved } -> "There are no conflicts left to resolve."

                    merge.run != null -> "AI is already resolving these conflicts."

                    else -> {
                        merge.run = ""
                        null
                    }
                }
            },
            then = ::resolveConflicts
        )
    }
    register("gitMergeStop") { o ->
        mergeReply(
            "gitMergeStop",
            o,
            after = 0.2,
            act = { merge ->
                if (merge.run == null) return@mergeReply "AI isn't resolving these conflicts."
                merge.run = null
                null
            },
            then = { project ->
                push(
                    mapOf(
                        "t" to "gitMergeRun",
                        "project" to project,
                        "running" to false,
                        "merging" to true
                    )
                )
            }
        )
    }
    register("gitConflictTake") { o ->
        val path = o.string("path").orEmpty()
        mergeReply("gitConflictTake", o, act = { resolve(it, path) })
    }
    register("gitConflictResolved") { o ->
        val path = o.string("path").orEmpty()
        mergeReply(
            "gitConflictResolved",
            o,
            act = { merge ->
                if (merge.files.any { it.path == path && it.conflicts > 0 }) {
                    "$path still has conflict markers (<<<<<<< … >>>>>>>). Resolve them first."
                } else {
                    resolve(merge, path)
                }
            }
        )
    }
    register("gitMergeContinue") { o ->
        mergeReply(
            "gitMergeContinue",
            o,
            after = 0.6,
            act = { merge ->
                if (merge.files.any { !it.resolved }) {
                    "Some files still have conflicts. Resolve them before continuing the merge."
                } else {
                    null
                }
            },
            then = { project ->
                endMerge(project)
                world.git[project]?.let { it.ahead += 2 }
            }
        )
    }
    register("gitMergeAbort") { o ->
        mergeReply("gitMergeAbort", o, after = 0.4, act = { null }, then = ::endMerge)
    }
}

/** Answers one request on a project's merge: [act] changes it or says why it can't. */
private fun DemoServer.mergeReply(
    t: String,
    o: Dict,
    after: Double = 0.3,
    act: (DemoWorld.GitMerge) -> String?,
    then: (String) -> Unit = {}
) {
    val project = o.string("project").orEmpty()
    pushAfter(after) {
        val merge = world.git[project]?.merge
            ?: return@pushAfter gitError(t, project, "No merge is in progress.")
        if (merge.run != null && t != "gitMergeStop" && t != "gitMergeResolve") {
            val busy = "AI is still resolving the conflicts. Stop it first."
            return@pushAfter gitError(t, project, busy)
        }
        act(merge)?.let { return@pushAfter gitError(t, project, it) }
        settleConflicts(project)
        then(project)
        pushGitChanged(project)
        mapOf("t" to t, "project" to project, "ok" to true)
    }
}

private fun resolve(merge: DemoWorld.GitMerge, path: String): String? {
    val i = merge.files.indexOfFirst { it.path == path && !it.resolved }
    if (i < 0) return "$path has no conflict to resolve"
    merge.files = merge.files.toMutableList().apply {
        this[i] = this[i].copy(conflicts = 0, firstLine = 0, resolved = true)
    }
    return null
}

/** A resolved file is a modified one again. */
private fun DemoServer.settleConflicts(project: String) {
    val repo = world.git[project] ?: return
    val resolved = repo.merge?.files.orEmpty().filter { it.resolved }.map { it.path }.toSet()
    repo.files = repo.files.map {
        if (it.status == "conflicted" && it.path in resolved) {
            it.copy(status = "modified", stamp = it.stamp + "r", diff = "")
        } else {
            it
        }
    }
}

private fun DemoServer.endMerge(project: String) {
    val repo = world.git[project] ?: return
    repo.merge = null
    repo.files = emptyList()
}

// the AI's run

private fun DemoServer.resolveConflicts(project: String) {
    runLine(project, "Starting claude…", 0.1)
    val open = world.git[project]?.merge?.files.orEmpty().filter { !it.resolved }.map { it.path }
    open.forEachIndexed { i, path ->
        val at = 1.0 + 2.5 * i
        runLine(project, "Reading ${path.substringAfterLast('/')}", at)
        pushAfter(at + 2.0) {
            val merge = world.git[project]?.merge?.takeIf { it.run != null }
                ?: return@pushAfter null
            resolve(merge, path)
            settleConflicts(project)
            pushGitChanged(project)
            null
        }
    }
    pushAfter(1.5 + 2.5 * open.size) {
        val merge = world.git[project]?.merge?.takeIf { it.run != null } ?: return@pushAfter null
        merge.run = null
        mapOf(
            "t" to "gitMergeRun",
            "project" to project,
            "running" to false,
            "left" to merge.files.count { !it.resolved },
            "merging" to true
        )
    }
}

private fun DemoServer.runLine(project: String, line: String, after: Double) {
    pushAfter(after) {
        val merge = world.git[project]?.merge?.takeIf { it.run != null } ?: return@pushAfter null
        merge.run = line
        mapOf(
            "t" to "gitMergeRun",
            "project" to project,
            "running" to true,
            "line" to line,
            "merging" to false
        )
    }
}

internal fun DemoWorld.seedMergeConflicts() {
    val repo = git["mobile-app"] ?: return
    repo.files = listOf(
        DemoWorld.GitFile(
            path = "src/theme/colors.ts",
            status = "conflicted",
            stamp = "m1",
            diff = CONFLICT_DIFF
        ),
        DemoWorld.GitFile(path = "src/screens/Settings.tsx", status = "conflicted", stamp = "m2"),
        DemoWorld.GitFile(path = "package.json", status = "conflicted", stamp = "m3"),
        DemoWorld.GitFile(path = "src/theme/index.ts", status = "added", stamp = "m4")
    )
    repo.merge = DemoWorld.GitMerge(
        source = "feat/dark-mode",
        files = listOf(
            DemoWorld.GitConflict("src/theme/colors.ts", conflicts = 2, firstLine = 14),
            DemoWorld.GitConflict("src/screens/Settings.tsx", conflicts = 1, firstLine = 41),
            DemoWorld.GitConflict("package.json", conflicts = 1, firstLine = 27)
        )
    )
}

internal fun gitMergeDict(merge: DemoWorld.GitMerge): Dict {
    val d = mutableMapOf<String, Any?>(
        "merging" to true,
        "source" to merge.source,
        "files" to merge.files.map {
            mapOf(
                "path" to it.path,
                "conflicts" to it.conflicts,
                "firstLine" to it.firstLine,
                "resolved" to it.resolved
            )
        }
    )
    merge.run?.let { d["resolving"] = mapOf("line" to it) }
    return d
}

private val CONFLICT_DIFF = """
    diff --cc src/theme/colors.ts
    index 4c1b7d2,9e0f3aa..0000000
    --- a/src/theme/colors.ts
    +++ b/src/theme/colors.ts
    @@ -11,6 +11,12 @@ export const colors = {
       accent: "#4f7cff",
       danger: "#e5484d",
    +<<<<<<< HEAD
    +  background: "#fafafa",
    +=======
    +  background: light ? "#ffffff" : "#111113",
    +>>>>>>> feat/dark-mode
       border: "#e4e4e7",
     }
""".trimIndent()
