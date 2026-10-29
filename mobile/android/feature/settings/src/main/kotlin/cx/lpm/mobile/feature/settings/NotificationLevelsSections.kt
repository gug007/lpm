package cx.lpm.mobile.feature.settings

import androidx.compose.runtime.Composable
import androidx.compose.ui.res.stringResource
import cx.lpm.mobile.core.data.prefs.NotificationPrefs
import cx.lpm.mobile.core.data.push.QuietHours
import cx.lpm.mobile.core.designsystem.component.PickerRow
import cx.lpm.mobile.core.designsystem.component.TimeOfDayRow
import cx.lpm.mobile.core.designsystem.component.ToggleRow
import cx.lpm.mobile.core.model.Project

/** How much each of the Mac's projects is heard about (iOS `ProjectNotifyLevel`). */
private enum class ProjectLevel(val wire: String, val label: Int) {
    All("all", R.string.notify_level_all),
    Waiting("waiting", R.string.notify_level_waiting),
    Off("off", R.string.notify_level_off)
}

/** The active Mac's projects, each with how much of it this phone hears. */
@Composable
internal fun ProjectLevelsSection(
    projects: List<Project>,
    prefs: NotificationPrefs,
    onChange: ((NotificationPrefs) -> NotificationPrefs) -> Unit
) {
    val listed = projects.filterNot { it.isDuplicate }
    if (listed.isEmpty()) return
    FormSection(
        header = stringResource(R.string.notify_projects),
        dimmed = !prefs.enabled,
        footer = { FooterText(stringResource(R.string.notify_projects_footer)) }
    ) {
        listed.forEach { project ->
            val level = ProjectLevel.entries.firstOrNull { it.wire == prefs.projects[project.name] }
                ?: ProjectLevel.All
            val labels = ProjectLevel.entries.associateWith { stringResource(it.label) }
            PickerRow(
                title = project.label.ifEmpty { project.name },
                options = ProjectLevel.entries,
                selected = level,
                onSelect = { picked ->
                    onChange {
                        val levels = if (picked == ProjectLevel.All) {
                            it.projects - project.name
                        } else {
                            it.projects + (project.name to picked.wire)
                        }
                        it.copy(projects = levels)
                    }
                },
                optionLabel = { labels.getValue(it) }
            )
        }
    }
}

/** Hours in which notifications arrive without a sound or a heads-up. */
@Composable
internal fun QuietHoursSection(
    prefs: NotificationPrefs,
    onChange: ((NotificationPrefs) -> NotificationPrefs) -> Unit
) {
    val quiet = prefs.quiet
    val on = prefs.enabled
    val update = { change: (
        QuietHours
    ) -> QuietHours ->
        onChange { it.copy(quiet = change(it.quiet)) }
    }
    FormSection(
        dimmed = !on,
        footer = { FooterText(stringResource(R.string.notify_quiet_footer)) }
    ) {
        ToggleRow(
            title = stringResource(R.string.notify_quiet),
            checked = quiet.enabled,
            onCheckedChange = { v -> update { it.copy(enabled = v) } },
            enabled = on
        )
        if (quiet.enabled) {
            QuietTimeRow(stringResource(R.string.notify_quiet_from), quiet.start) { m ->
                update { it.copy(start = m) }
            }
            QuietTimeRow(stringResource(R.string.notify_quiet_to), quiet.end) { m ->
                update { it.copy(end = m) }
            }
            ToggleRow(
                title = stringResource(R.string.notify_quiet_waiting),
                checked = quiet.letWaitingThrough,
                onCheckedChange = { v -> update { it.copy(letWaitingThrough = v) } },
                enabled = on
            )
        }
    }
}

@Composable
private fun QuietTimeRow(title: String, minutes: Int, onChange: (Int) -> Unit) {
    TimeOfDayRow(
        title = title,
        minutes = minutes,
        onChange = onChange,
        confirmLabel = stringResource(R.string.notify_quiet_ok),
        dismissLabel = stringResource(R.string.notify_quiet_cancel)
    )
}
