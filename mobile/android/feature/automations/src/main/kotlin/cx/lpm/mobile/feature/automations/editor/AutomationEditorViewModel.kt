package cx.lpm.mobile.feature.automations.editor

import androidx.compose.runtime.Immutable
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import cx.lpm.mobile.core.data.automations.AutomationsState
import cx.lpm.mobile.core.data.automations.AutomationsStore
import cx.lpm.mobile.core.data.projects.ProjectsState
import cx.lpm.mobile.core.data.projects.ProjectsStore
import cx.lpm.mobile.core.data.session.MacSession
import cx.lpm.mobile.core.data.session.MacSessions
import cx.lpm.mobile.core.model.AutomationMachine
import cx.lpm.mobile.core.model.SessionKey
import cx.lpm.mobile.feature.automations.format.AutomationMachines
import cx.lpm.mobile.feature.automations.format.automationScheduleText
import dagger.assisted.Assisted
import dagger.assisted.AssistedFactory
import dagger.assisted.AssistedInject
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.launchIn
import kotlinx.coroutines.flow.onEach
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update

/** A project the job can run in, or an action it can run. */
@Immutable
data class EditorChoice(val name: String, val label: String)

@Immutable
data class AutomationEditorUiState(
    val editing: Boolean = false,
    val draft: JobEditorDraft = JobEditorDraft(),
    val loading: Boolean = false,
    val saving: Boolean = false,
    val canSave: Boolean = false,
    /** Creating, or a global job that picks its projects: the projects show as a checklist. */
    val scopeEditable: Boolean = true,
    /** What a fixed scope reads as ("Every project", the project's name). */
    val scopeLabel: String = "",
    val projects: List<EditorChoice> = emptyList(),
    val actions: List<EditorChoice> = emptyList(),
    /** A schedule set on the Mac: the form says what it is rather than offer controls. */
    val keptSchedule: Boolean = false,
    /** That schedule in words; null says only that it was set on the Mac. */
    val keptScheduleText: String? = null,
    val deletable: Boolean = false,
    val offersDeleteCopies: Boolean = false,
    /** A global job's delete removes it from every project. */
    val global: Boolean = true,
    val mutationError: String? = null,
    val configError: String? = null,
    /** The Mac wrote it: the sheet goes. */
    val done: Boolean = false,
    /** This Mac and the computers paired with it, what "Runs on" offers. */
    val machines: List<AutomationMachine> = emptyList(),
    /** How the job names the computers it lists, for any not among [machines]. */
    val machineNames: List<AutomationMachine> = emptyList(),
    /** Like the desktop, "Runs on" shows once there's another computer to name. */
    val showsMachines: Boolean = false
)

/**
 * Create or edit an automation (iOS `AutomationEditorSheet`, the desktop's
 * JobEditorModal); the Mac writes the body to the same layer file a desktop edit would.
 */
@HiltViewModel(assistedFactory = AutomationEditorViewModel.Factory::class)
class AutomationEditorViewModel @AssistedInject constructor(
    @Assisted private val target: AutomationEditorTarget,
    @Assisted private val sessionKey: SessionKey,
    sessions: MacSessions
) : ViewModel() {
    private val session: MacSession? = sessions[sessionKey]
    private val store: AutomationsStore? = session?.store()
    private val projects: ProjectsStore? = session?.store()
    private val editingJob = (target as? AutomationEditorTarget.Edit)?.job
    private val source = editingJob?.source ?: "global"
    private val draft = MutableStateFlow(JobEditorDraft())
    private val seeded = MutableStateFlow(editingJob == null)

    // The done-token at the last Save/Delete; a higher one means that write landed.
    private var pendingToken: Int? = null

    val uiState: StateFlow<AutomationEditorUiState> = combine(
        draft,
        seeded,
        store?.state ?: flowOf(AutomationsState()),
        projects?.state ?: flowOf(ProjectsState())
    ) { d, isSeeded, a, p -> state(d, isSeeded, a, p) }
        .stateIn(
            viewModelScope,
            SharingStarted.WhileSubscribed(5_000),
            AutomationEditorUiState()
        )

    init {
        val s = store
        when (target) {
            is AutomationEditorTarget.Create -> {
                s?.clearJobConfig()
                // A new automation runs on this Mac until others are picked.
                val here = s?.state?.value?.machines?.firstOrNull { it.here }
                draft.value = JobEditorDraft(
                    targets = listOfNotNull(target.project),
                    machines = listOfNotNull(here?.id)
                )
            }

            is AutomationEditorTarget.Edit -> if (s != null) {
                // Always a fresh body: one left from an earlier edit is another job's.
                s.loadJobConfig(target.job.project, target.job.id, target.job.source)
                s.state
                    .onEach { a ->
                        val body = a.jobConfigBody
                        if (!seeded.value && body != null) {
                            draft.value = JobEditorDraft.from(body)
                            seeded.value = true
                        }
                    }
                    .launchIn(viewModelScope)
            }
        }
    }

    private fun state(
        d: JobEditorDraft,
        isSeeded: Boolean,
        a: AutomationsState,
        p: ProjectsState
    ): AutomationEditorUiState {
        val scopeEditable = editingJob == null || (source == "global" && d.hasProjectsKey)
        val loading = !isSeeded && a.jobConfigError == null
        val error = d.validationError(standalone = editingJob == null && d.targets.isEmpty())
        return AutomationEditorUiState(
            editing = editingJob != null,
            draft = d,
            loading = loading,
            saving = a.mutationInFlight,
            canSave = error == null && !loading && !a.mutationInFlight,
            scopeEditable = scopeEditable,
            scopeLabel = scopeLabel(p),
            projects = p.projects.filterNot { it.isRemote }.map {
                EditorChoice(it.name, it.label)
            },
            actions = availableActions(d, p),
            keptSchedule = d.keptSchedule != null,
            keptScheduleText = editingJob?.let(::automationScheduleText),
            deletable = editingJob != null && source != "repo",
            offersDeleteCopies = editingJob?.duplicate == true,
            global = source == "global",
            mutationError = a.mutationError,
            configError = a.jobConfigError,
            done = pendingToken?.let { a.mutationDoneToken > it } == true,
            machines = a.machines,
            machineNames = editingJob?.machines.orEmpty(),
            showsMachines = a.machines.size > 1 ||
                AutomationMachines.listed(d.machines).any { id ->
                    a.machines.none {
                        it.id == id &&
                            it.here
                    }
                }
        )
    }

    private fun scopeLabel(p: ProjectsState): String {
        if (source == "global") return "Every project"
        val job = editingJob ?: return ""
        return p.project(job.project)?.label ?: job.project
    }

    /**
     * The actions of the one project the job runs against: its own project when editing
     * a project job, or the single target of a new one (JobEditorModal.runProject).
     */
    private fun availableActions(d: JobEditorDraft, p: ProjectsState): List<EditorChoice> {
        val runProject = if (editingJob != null) {
            editingJob.project.takeIf { source != "global" }
        } else {
            d.targets.singleOrNull()
        }
        val project = runProject?.let(p::project) ?: return emptyList()
        return project.actions.flatMap { it.runnableLeaves }.filter { it.app == null }.map {
            EditorChoice(it.name, if (it.emoji.isEmpty()) it.label else "${it.emoji} ${it.label}")
        }
    }

    /**
     * Change the form. A new agent or model can rule out the effort, and switching to
     * an action picks the first one there is.
     */
    fun edit(change: (JobEditorDraft) -> JobEditorDraft) = draft.update { old ->
        var next = change(old)
        if (next.agent != old.agent || next.model != old.model) next = next.clampedEffort()
        val toAction = next.runMode == RunMode.Action && old.runMode != RunMode.Action
        if (toAction && next.action.isEmpty()) {
            val actions = availableActions(next, projects?.state?.value ?: ProjectsState())
            next = next.copy(action = actions.firstOrNull()?.name.orEmpty())
        }
        next
    }

    fun save() {
        val s = store ?: return
        val state = uiState.value
        if (!state.canSave) return
        pendingToken = s.state.value.mutationDoneToken
        val writesProjects = source == "global" && state.scopeEditable
        val body = state.draft.buildJob(writesProjects)
        val job = editingJob
        if (job != null) {
            s.saveJob(job.id, source, job.project, body)
        } else {
            // New jobs live in the global layer under a fresh id.
            val id = uniqueJobId(state.draft.label, s.state.value.jobs.map { it.id }.toSet())
            s.saveJob(id, "global", "", body)
        }
    }

    fun delete(deleteCopies: Boolean) {
        val s = store ?: return
        val job = editingJob ?: return
        pendingToken = s.state.value.mutationDoneToken
        s.deleteJob(job.id, source, job.project, deleteCopies)
    }

    fun dismissMutationError() {
        store?.dismissMutationError()
    }

    fun dismissConfigError() {
        store?.dismissJobConfigError()
    }

    @AssistedFactory
    interface Factory {
        fun create(
            target: AutomationEditorTarget,
            sessionKey: SessionKey
        ): AutomationEditorViewModel
    }
}
