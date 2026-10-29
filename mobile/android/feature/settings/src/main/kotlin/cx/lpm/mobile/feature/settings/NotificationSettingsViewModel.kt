package cx.lpm.mobile.feature.settings

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import cx.lpm.mobile.core.data.prefs.AppPreferences
import cx.lpm.mobile.core.data.prefs.NotificationPrefs
import cx.lpm.mobile.core.data.prefs.notificationPrefs
import cx.lpm.mobile.core.data.prefs.notificationPrefsFlow
import cx.lpm.mobile.core.data.prefs.setNotificationPrefs
import cx.lpm.mobile.core.data.projects.ProjectsStore
import cx.lpm.mobile.core.data.session.MacSession
import cx.lpm.mobile.core.model.Project
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn

data class NotificationSettingsUiState(
    val prefs: NotificationPrefs = NotificationPrefs(),
    /** Changes reach the Mac only over a live link; otherwise they wait for the next one. */
    val connected: Boolean = false,
    /** The active Mac's projects, for how much each is heard about. */
    val projects: List<Project> = emptyList()
)

/** Settings → Notifications: which pushes this phone asks its Macs for. */
@HiltViewModel
class NotificationSettingsViewModel @Inject constructor(
    private val prefs: AppPreferences,
    session: MacSession
) : ViewModel() {
    val uiState: StateFlow<NotificationSettingsUiState> = combine(
        prefs.notificationPrefsFlow(),
        session.state,
        session.store<ProjectsStore>().state
    ) { notify, s, projects -> NotificationSettingsUiState(notify, s.isReady, projects.projects) }
        .stateIn(
            viewModelScope,
            SharingStarted.WhileSubscribed(5_000),
            NotificationSettingsUiState(prefs.notificationPrefs, session.state.value.isReady)
        )

    fun update(change: (NotificationPrefs) -> NotificationPrefs) =
        prefs.setNotificationPrefs(change(prefs.notificationPrefs))
}
