package cx.lpm.mobile.core.demo

/**
 * Demo handlers for Discard all, Discard of one file, and their Undo. As on the Mac, a
 * discard keeps a copy of the changed files and names it in the reply (none when
 * nothing changed); restoring puts that copy back unless one of its files is changed
 * again, in which case nothing is restored and the copy stays.
 */
internal fun DemoServer.registerGitDiscardHandlers() {
    register("gitDiscardAll") { o ->
        val project = o.string("project") ?: return@register
        discard(project, mapOf("t" to "gitDiscardAll", "project" to project)) { true }
    }
    register("gitDiscardFiles") { o ->
        val project = o.string("project") ?: return@register
        val paths = o.strings("paths").orEmpty()
        discard(project, mapOf("t" to "gitDiscardFiles", "project" to project, "paths" to paths)) {
            it.path in paths
        }
    }
    register("gitRestoreDiscarded") { o ->
        val project = o.string("project") ?: return@register
        val id = o.string("id").orEmpty()
        pushAfter(0.4) {
            val t = "gitRestoreDiscarded"
            val repo = world.git[project] ?: return@pushAfter discardError(t, project, NOT_A_REPO)
            val kept = repo.discarded[id]
                ?: return@pushAfter discardError(t, project, "That discard is no longer kept.")
            val changed = repo.files.map { it.path }.toSet()
            if (kept.any { it.path in changed }) {
                return@pushAfter discardError(
                    t,
                    project,
                    "Nothing was restored: some of its files exist again."
                )
            }
            repo.files = kept + repo.files
            repo.discarded = repo.discarded - id
            pushGitChanged(project)
            mapOf("t" to t, "project" to project, "ok" to true)
        }
    }
}

/** Discards the changed files [picked] takes, keeping a copy of them for Undo. */
private fun DemoServer.discard(
    project: String,
    base: Dict,
    picked: (DemoWorld.GitFile) -> Boolean
) {
    pushAfter(0.4) {
        val repo = world.git[project]
            ?: return@pushAfter base + mapOf("ok" to false, "error" to NOT_A_REPO)
        val reply = base.toMutableMap()
        reply["ok"] = true
        val kept = repo.files.filter(picked)
        if (kept.isNotEmpty()) {
            val id = "discard-${world.gitDiscardNextId}"
            world.gitDiscardNextId += 1
            repo.discarded = repo.discarded + (id to kept)
            reply["undo"] = id
        }
        repo.files = repo.files.filterNot(picked)
        pushGitChanged(project)
        reply
    }
}

private fun discardError(t: String, project: String, error: String): Dict =
    mapOf("t" to t, "project" to project, "ok" to false, "error" to error)

private const val NOT_A_REPO = "Not a git repository."
