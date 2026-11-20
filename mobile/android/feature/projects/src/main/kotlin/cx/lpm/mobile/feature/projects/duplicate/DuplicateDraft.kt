package cx.lpm.mobile.feature.projects.duplicate

import cx.lpm.mobile.core.model.Action
import cx.lpm.mobile.core.model.DuplicateOptions
import cx.lpm.mobile.core.model.Project
import cx.lpm.mobile.core.model.RunMode

/** The most copies one duplicate makes, as on the desktop. */
const val MAX_COPIES = 50

/**
 * The options a duplicate sheet opens with: count, labels and run start fresh; the
 * git toggles follow the desktop's saved duplicate settings. From the composer's
 * "Run in N duplicates" the prompt and count come along, with a run mode that
 * carries the prompt into each copy (an action if the project has one, else a
 * command to fill in).
 */
fun duplicateSeed(
    project: Project,
    defaults: DuplicateOptions,
    seedPrompt: String? = null,
    seedCount: Int? = null
): DuplicateOptions {
    var seed = DuplicateOptions(
        excludeUncommitted = defaults.excludeUncommitted,
        reinstallDeps = defaults.reinstallDeps,
        pullLatest = defaults.pullLatest
    )
    if (seedPrompt != null) {
        seed = seed.copy(prompt = seedPrompt)
        if (seedCount != null) seed = seed.withCount(seedCount.coerceIn(1, MAX_COPIES))
        val first = project.runnableActions.firstOrNull()
        seed = if (first != null) {
            seed.copy(runMode = RunMode.Action, actionName = first.name)
        } else {
            seed.copy(runMode = RunMode.Command)
        }
    }
    return seed
}

val Project.runnableActions: List<Action>
    get() = actions.flatMap { it.runnableLeaves }.filter { it.app == null }

/** The run modes the sheet offers: Action only when the project has one to run. */
fun Project.duplicateRunModes(): List<RunMode> =
    if (runnableActions.isEmpty()) listOf(RunMode.None, RunMode.Command) else RunMode.entries

/** A new count, with one label field per copy (kept where they already were). */
fun DuplicateOptions.withCount(count: Int): DuplicateOptions {
    val labels = if (labels.size < count) {
        labels + List(count - labels.size) { "" }
    } else {
        labels.take(count)
    }
    return copy(count = count, labels = labels)
}

/** Picking Action with none chosen yet picks the first runnable one. */
fun DuplicateOptions.withRunMode(mode: RunMode, project: Project): DuplicateOptions {
    val next = copy(runMode = mode)
    return if (mode == RunMode.Action && actionName.isEmpty()) {
        next.copy(actionName = project.runnableActions.firstOrNull()?.name.orEmpty())
    } else {
        next
    }
}
