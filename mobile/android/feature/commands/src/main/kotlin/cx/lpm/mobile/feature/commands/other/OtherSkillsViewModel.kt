package cx.lpm.mobile.feature.commands.other

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import cx.lpm.mobile.core.data.commands.CommandOutcome
import cx.lpm.mobile.core.data.commands.LpmCommandsStore
import cx.lpm.mobile.core.data.session.MacSessions
import cx.lpm.mobile.core.model.CommandScope
import cx.lpm.mobile.core.model.LpmCommandList
import cx.lpm.mobile.core.model.OtherSpot
import cx.lpm.mobile.core.model.SessionKey
import cx.lpm.mobile.feature.commands.CommandsWatch
import dagger.assisted.Assisted
import dagger.assisted.AssistedFactory
import dagger.assisted.AssistedInject
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

/** The skills not made in lpm in one list's places (iOS `OtherSkillsScreen`). */
@OptIn(ExperimentalCoroutinesApi::class)
@HiltViewModel(assistedFactory = OtherSkillsViewModel.Factory::class)
class OtherSkillsViewModel @AssistedInject constructor(
    @Assisted val project: String,
    @Assisted val scope: CommandScope,
    @Assisted session: SessionKey,
    sessions: MacSessions
) : ViewModel() {
    internal val watch = CommandsWatch(sessions, session, project)

    val list: StateFlow<LpmCommandList> = sessions.session(session)
        .flatMapLatest { s ->
            s?.store<LpmCommandsStore>()?.state?.map { state ->
                state.lists[project]?.list(scope) ?: LpmCommandList()
            } ?: flowOf(LpmCommandList())
        }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), LpmCommandList())

    private val mutableError = MutableStateFlow<String?>(null)

    /** A change the Mac refused. */
    val error: StateFlow<String?> = mutableError.asStateFlow()

    val canChange: Boolean get() = watch.store?.otherSkillsAvailable == true

    fun dismissError() {
        mutableError.value = null
    }

    fun move(name: String, spot: OtherSpot) {
        val store = watch.store ?: return
        change { store.moveOther(project, scope, name, spot) }
    }

    fun convert(name: String, onDone: () -> Unit) {
        val store = watch.store ?: return
        change(onDone) { store.convert(project, scope, name, toLpm = true) }
    }

    private fun change(onDone: () -> Unit = {}, op: suspend () -> CommandOutcome<Unit>) {
        viewModelScope.launch {
            when (val outcome = op()) {
                is CommandOutcome.Done -> onDone()
                is CommandOutcome.Failed -> mutableError.value = outcome.error
            }
        }
    }

    @AssistedFactory
    interface Factory {
        fun create(project: String, scope: CommandScope, session: SessionKey): OtherSkillsViewModel
    }
}
