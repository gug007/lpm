package cx.lpm.mobile.feature.automations.list

import androidx.compose.runtime.Immutable
import cx.lpm.mobile.core.data.automations.AutomationsState
import cx.lpm.mobile.core.model.AutomationJob
import cx.lpm.mobile.feature.automations.format.AutomationClock
import cx.lpm.mobile.feature.automations.format.AutomationMachines
import cx.lpm.mobile.feature.automations.format.AutomationRowChip
import cx.lpm.mobile.feature.automations.format.AutomationTone
import cx.lpm.mobile.feature.automations.format.automationLastRunFailed
import cx.lpm.mobile.feature.automations.format.automationNeedsAnswer
import cx.lpm.mobile.feature.automations.format.automationRowChip
import cx.lpm.mobile.feature.automations.format.automationRowStatusText
import cx.lpm.mobile.feature.automations.format.automationScopeLabel
import cx.lpm.mobile.feature.automations.format.automationStatusTone
import cx.lpm.mobile.feature.automations.format.automationsSortedForList

/** One automation's row: what it is, where it runs, and the line under its name. */
@Immutable
data class AutomationRowUi(
    val job: AutomationJob,
    /**
     * The projects it runs in, in a tag, then the computers; empty when the page's
     * project says it already and there's no other computer to name.
     */
    val scope: String,
    val status: String,
    val statusTone: AutomationTone,
    /** Its last run failed: Run reads "Retry", and the Failed filter keeps it. */
    val failed: Boolean = false,
    /** What the row needs from you, ahead of its line: a question, a failure. */
    val chip: AutomationRowChip? = null
) {
    val unread: Boolean get() = job.unread > 0
    val emoji: String get() = job.emoji.ifEmpty { "⏱️" }
}

@Immutable
data class AutomationsUiState(
    val loaded: Boolean = false,
    /** A project's own Automations page, or null for every job. */
    val project: String? = null,
    /** Everything unread first, newest activity first inside each half. */
    val unread: List<AutomationRowUi> = emptyList(),
    val read: List<AutomationRowUi> = emptyList(),
    /** How many rows each filter keeps, counted before [filter] narrows the list. */
    val allCount: Int = 0,
    val needsCount: Int = 0,
    val failedCount: Int = 0,
    /** The filter the list shows: All when the picked one has nothing left in it. */
    val filter: AutomationListFilter = AutomationListFilter.All,
    /** Unread jobs [filter] hides: "Mark all read" still shows for them and reads them. */
    val hiddenUnread: List<AutomationJob> = emptyList(),
    val error: String? = null
) {
    val isEmpty: Boolean get() = unread.isEmpty() && read.isEmpty()
    val anyUnread: Boolean get() = unread.isNotEmpty() || hiddenUnread.isNotEmpty()

    /** The filters worth offering: All, then the ones with something in them. */
    val filters: List<AutomationListFilter>
        get() = if (needsCount == 0 && failedCount == 0) {
            emptyList()
        } else {
            listOfNotNull(
                AutomationListFilter.All,
                AutomationListFilter.NeedsYou.takeIf { needsCount > 0 },
                AutomationListFilter.Failed.takeIf { failedCount > 0 }
            )
        }
}

/** The list's filter, as the desktop's: every automation, the ones waiting on an answer, or the failed. */
enum class AutomationListFilter(val keeps: (AutomationJob) -> Boolean) {
    All({ true }),
    NeedsYou(::automationNeedsAnswer),
    Failed(::automationLastRunFailed)
}

/**
 * One flat feed rather than a directory. A project's page lists only the jobs that
 * run in it, and a job that runs only there needs no scope tag. The computers a job
 * runs on follow, once there's more than one to name. [filter] keeps only the rows
 * waiting on an answer or whose last run failed, and lets go once none are left.
 */
internal fun AutomationsState.listState(
    project: String?,
    projectCount: Int,
    clock: AutomationClock,
    filter: AutomationListFilter = AutomationListFilter.All
): AutomationsUiState {
    val inProject = if (project == null) jobs else jobs.filter { project in it.runTargets }
    val failedCount = inProject.count(AutomationListFilter.Failed.keeps)
    val needsCount = inProject.count(AutomationListFilter.NeedsYou.keeps)
    val active = filter.takeIf { inProject.any(it.keeps) } ?: AutomationListFilter.All
    val filtering = active != AutomationListFilter.All
    val shown = inProject.filter(active.keeps)
    val rows = automationsSortedForList(shown).map { job ->
        AutomationRowUi(
            job = job,
            scope = listOfNotNull(
                automationScopeLabel(job, projectCount).takeUnless {
                    project != null && job.runsIn.size <= 1
                },
                AutomationMachines.label(job, machines)
            ).joinToString(" · "),
            status = automationRowStatusText(job, clock),
            statusTone = automationStatusTone(job),
            failed = automationLastRunFailed(job),
            chip = automationRowChip(job)
        )
    }
    return AutomationsUiState(
        loaded = loaded,
        project = project,
        unread = rows.filter { it.unread },
        read = rows.filterNot { it.unread },
        allCount = inProject.size,
        needsCount = needsCount,
        failedCount = failedCount,
        filter = active,
        hiddenUnread = if (filtering) {
            inProject.filter { it.unread > 0 && !active.keeps(it) }
        } else {
            emptyList()
        },
        error = error
    )
}
