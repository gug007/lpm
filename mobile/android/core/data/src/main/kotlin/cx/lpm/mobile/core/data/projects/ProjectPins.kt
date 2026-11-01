package cx.lpm.mobile.core.data.projects

import cx.lpm.mobile.core.data.client.LpmClient
import cx.lpm.mobile.core.data.client.sidebarPin
import cx.lpm.mobile.core.model.Project

/*
 * Pinned projects: the Mac's own pins (the desktop sidebar's Pin to top), shown as a
 * Pinned section above the list. A pin is a way back, not a move, so the project
 * keeps its place below as well.
 */

val ProjectsStore.canPinProjects: Boolean
    get() = client?.hostFeatures?.contains(LpmClient.PROJECT_PINS_FEATURE) == true

/**
 * The pinned projects there is something to show for, in pinned order. A pin whose
 * project is gone keeps its place on the Mac and shows when it's back.
 */
val ProjectsState.pinnedProjects: List<Project>
    get() {
        val byName = projects.reversed().associateBy { it.name }
        return pins.distinct().mapNotNull { byName[it] }
    }

fun ProjectsState.isPinned(project: Project): Boolean = project.name in pins

/** Pin at the end, or unpin, at once; the Mac's reply carries the pins it kept. */
fun ProjectsStore.setPinned(project: Project, pinned: Boolean) {
    val others = state.value.pins.filterNot { it == project.name }
    setPins(if (pinned) others + project.name else others)
    client?.sidebarPin(project.name, pinned)
}
