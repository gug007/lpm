package cx.lpm.mobile.feature.settings.help

import android.os.Build
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import cx.lpm.mobile.core.data.mac.ThisDevice
import cx.lpm.mobile.core.data.session.MacSessions
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn

/** Settings › Help: which versions are talking, for its foot and a report's. */
@HiltViewModel
class HelpViewModel @Inject constructor(sessions: MacSessions, private val device: ThisDevice) :
    ViewModel() {
    val demo: StateFlow<Boolean> = sessions.live.state.map { it.demoMode }
        .stateIn(
            viewModelScope,
            SharingStarted.WhileSubscribed(5_000),
            sessions.live.state.value.demoMode
        )

    /** "lpm Link 1.74 · Mac runs lpm 0.7.62", or "· Demo Mode". */
    fun line(macVersion: String?, demo: Boolean): String = buildList {
        add("lpm Link ${device.appVersion.ifEmpty { "?" }}")
        if (demo) {
            add("Demo Mode")
        } else if (!macVersion.isNullOrEmpty()) {
            add("Mac runs lpm $macVersion")
        }
    }.joinToString(" · ")

    /** What a report carries about where it came from, and nothing about who. */
    fun footer(macVersion: String?, demo: Boolean): String =
        "\n\n---\n${line(macVersion, demo)} · ${Build.MODEL} · Android ${Build.VERSION.RELEASE}"
}
