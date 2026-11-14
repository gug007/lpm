package cx.lpm.mobile.core.data.projects

import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * The project last opened on the live Mac, which the app icon's New Tab offers, and a
 * project to open with its New Tab sheet up (iOS `AppModel.lastOpenedProject` and
 * `pendingNewTab`).
 */
@Singleton
class ProjectOpens @Inject constructor() {
    var lastOpened: String? = null
        private set

    private val mutablePendingNewTab = MutableStateFlow<String?>(null)
    val pendingNewTab: StateFlow<String?> = mutablePendingNewTab.asStateFlow()

    fun opened(project: String) {
        lastOpened = project
    }

    fun openNewTab(project: String) {
        mutablePendingNewTab.value = project
    }

    /** Takes the pending New Tab when it's for [project]. */
    fun takeNewTab(project: String): Boolean {
        if (mutablePendingNewTab.value != project) return false
        mutablePendingNewTab.value = null
        return true
    }
}
