package cx.lpm.mobile.core.designsystem.component

import androidx.compose.runtime.staticCompositionLocalOf

/**
 * Runs an action that's hard to take back — Discard Changes, Push, Stop All — once the
 * phone's owner confirms, when Settings › Security asks for that. The app provides it;
 * without it the action runs straight away.
 */
fun interface ConfirmRisky {
    fun confirm(reason: String, action: () -> Unit)
}

/** Stops every service in [project] (iOS `AppModel.confirmStop`). */
fun ConfirmRisky.stopProject(project: String, stop: () -> Unit) =
    confirm("Stop every service in $project", stop)

val LocalConfirmRisky = staticCompositionLocalOf { ConfirmRisky { _, action -> action() } }
