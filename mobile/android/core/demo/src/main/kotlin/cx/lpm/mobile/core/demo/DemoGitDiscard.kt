package cx.lpm.mobile.core.demo

/**
 * Demo handlers for Discard all and its Undo. As on the Mac, a discard keeps a copy
 * of the changed files and names it in the reply (none when nothing changed);
 * restoring puts that copy back unless one of its files is changed again, in which
 * case nothing is restored and the copy stays.
 */
internal fun DemoServer.registerGitDiscardHandlers() {
    register("gitDiscardAll") { o ->
        val project = o.string("project") ?: return@register
        pushAfter(0.4) {
            val repo = world.git[project]
                ?: return@pushAfter discardError("gitDiscardAll", project, NOT_A_REPO)
            val reply = mutableMapOf<String, Any?>(
                "t" to "gitDiscardAll",
                "project" to project,
                "ok" to true
            )
            if (repo.files.isNotEmpty()) {
                val id = "discard-${world.gitDiscardNextId}"
                world.gitDiscardNextId += 1
                repo.discarded = repo.discarded + (id to repo.files)
                reply["undo"] = id
            }
            repo.files = emptyList()
            pushGitChanged(project)
            reply
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

private fun discardError(t: String, project: String, error: String): Dict =
    mapOf("t" to t, "project" to project, "ok" to false, "error" to error)

private const val NOT_A_REPO = "Not a git repository."
