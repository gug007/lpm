package cx.lpm.mobile.feature.projects.list

import cx.lpm.mobile.core.data.link.QueuedAction
import cx.lpm.mobile.core.data.mac.MacRecord
import cx.lpm.mobile.core.data.mac.MacVia
import cx.lpm.mobile.core.data.machines.MachineImportStatus
import cx.lpm.mobile.core.data.machines.MachineSection
import cx.lpm.mobile.core.data.machines.machineRows
import cx.lpm.mobile.core.data.projects.ProjectsState
import cx.lpm.mobile.core.model.Project
import cx.lpm.mobile.core.model.ProjectFolder
import cx.lpm.mobile.core.model.RemoteMachine
import cx.lpm.mobile.core.model.StatusEntry
import cx.lpm.mobile.feature.projects.project
import java.time.Instant
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ListRowsTest {
    private val folder =
        ProjectFolder("g1", "Client Work", collapsed = false, members = listOf("blog"))

    private fun ProjectsState.names(inputs: RowInputs = RowInputs()) = listRows(inputs).map {
        when (it) {
            is ProjectsListRow.ProjectEntry -> (if (it.indented) "  " else "") + it.project.name
            is ProjectsListRow.FolderEntry -> "[${it.folder.name} ${it.count}]"
            is ProjectsListRow.MachineEntry -> "<${it.name} ${it.count}>"
            is ProjectsListRow.MachineProjectEntry -> "  ${it.slug}:${it.project.name}"
        }
    }

    @Test
    fun `the sidebar order places folders and nests duplicates under their parent`() {
        val state = ProjectsState(
            projects = listOf(
                project("web"),
                project("web-2", parent = "web"),
                project("blog"),
                project("api"),
                project("new")
            ),
            sidebarOrder = listOf("api", "group:g1", "web"),
            groups = listOf(folder)
        )
        assertEquals(
            listOf("api", "[Client Work 1]", "  blog", "web", "web-2", "new"),
            state.names()
        )
    }

    @Test
    fun `a folder the Mac saved collapsed stays shut until opened here`() {
        val state = ProjectsState(
            projects = listOf(project("blog")),
            groups = listOf(folder.copy(collapsed = true))
        )
        assertEquals(listOf("[Client Work 1]"), state.names())
        assertEquals(
            listOf("[Client Work 1]", "  blog"),
            state.names(RowInputs(expanded = mapOf("g1" to true)))
        )
    }

    @Test
    fun `a row carries its spinner, waiting actions, folder and agents`() {
        val waiting = StatusEntry("claude_code_1", "Waiting", 0, 500, "t1", 0, 0)
        val state = ProjectsState(
            projects = listOf(project("blog", statusEntries = listOf(waiting)), project("web")),
            groups = listOf(folder),
            pendingRun = mapOf("blog" to true)
        )
        val queued = QueuedAction("web", "Start", Instant.EPOCH)
        val rows = state.listRows(
            RowInputs(
                terminalTitles = mapOf("blog" to mapOf("t1" to "Terminal 1")),
                queued = listOf(queued),
                stale = true,
                now = 1_000
            )
        ).filterIsInstance<ProjectsListRow.ProjectEntry>()
        val blog = rows.single { it.project.name == "blog" }
        assertTrue(blog.pending)
        assertTrue(blog.stale)
        assertEquals("g1", blog.folderId)
        assertEquals("Terminal 1", blog.agents.single().title)
        val web = rows.single { it.project.name == "web" }
        assertFalse(web.pending)
        assertEquals(listOf(queued), web.queued)
    }

    private fun machine(projects: List<Project>?, slug: String = "box") = RemoteMachine(
        slug = slug,
        name = "Build Box",
        platform = "linux",
        serverId = null,
        state = RemoteMachine.State.Ready,
        projects = projects,
        relay = true
    )

    private fun section(
        projects: List<Project>? = listOf(project("api"), project("api-2", parent = "api")),
        record: MacRecord? = null,
        pending: MachineImportStatus? = null,
        throughMac: Boolean = false
    ) = MachineSection(
        machine(projects),
        machineRows(projects.orEmpty()),
        record,
        pending,
        throughMac
    )

    private val saved =
        MacRecord(localId = "R", name = "Build Box", hosts = listOf("10.0.0.9"), port = 8765)

    @Test
    fun `a machine sits at its peer slot with its projects under it`() {
        val state = ProjectsState(
            projects = listOf(project("web"), project("blog")),
            sidebarOrder = listOf("web", "peer:box", "blog")
        )
        assertEquals(
            listOf("web", "<Build Box 1>", "  box:api", "  box:api-2", "blog"),
            state.names(RowInputs(machines = listOf(section(record = saved))))
        )
        assertEquals(
            listOf("web", "<Build Box 1>", "blog"),
            state.names(RowInputs(machines = listOf(section()), expanded = mapOf("m:box" to false)))
        )
    }

    @Test
    fun `a machine's header says where adding it here stands`() {
        fun detail(section: MachineSection, active: String? = "MAC") = ProjectsState()
            .listRows(RowInputs(machines = listOf(section), activeMacId = active))
            .filterIsInstance<ProjectsListRow.MachineEntry>().single().detail

        val through = saved.copy(via = MacVia("MAC", "box"))
        assertEquals(MachineDetail.OpensThroughMac, detail(section(record = through)))
        assertEquals(MachineDetail.Adding, detail(section(pending = MachineImportStatus.Adding)))
        assertEquals(
            MachineDetail.Failed("It didn't answer in time."),
            detail(section(pending = MachineImportStatus.Failed("It didn't answer in time.")))
        )
        assertEquals(
            MachineDetail.OpensThroughMac,
            detail(section(pending = MachineImportStatus.Removed, throughMac = true))
        )
        assertEquals(
            MachineDetail.NotOnPhone,
            detail(section(pending = MachineImportStatus.Removed))
        )
        assertEquals(
            MachineDetail.Revoked,
            detail(section(pending = MachineImportStatus.Revoked, throughMac = true))
        )
        assertEquals(
            MachineDetail.NeedsUpdate,
            detail(section(pending = MachineImportStatus.NeedsUpdate))
        )
        assertEquals(null, detail(section(record = saved)))
    }

    @Test
    fun `seen agents list only from a Mac that keeps them, folding past its limit`() {
        fun seen(key: String, at: Long) = StatusEntry(key, "Done", 20, at, key, 0, at, at)
        val blog = project(
            "blog"
        ).copy(seenEntries = listOf(seen("a", 100), seen("b", 300), seen("c", 200)))
        val state = ProjectsState(projects = listOf(blog), seenAgentsShown = 2)
        fun entry(inputs: RowInputs) =
            state.listRows(inputs).filterIsInstance<ProjectsListRow.ProjectEntry>().single()

        assertTrue(entry(RowInputs()).agents.isEmpty())
        val folded = entry(RowInputs(archivable = true))
        assertEquals(listOf("b", "c"), folded.agents.map { it.id })
        assertEquals(1, folded.foldedSeen)
        assertTrue(folded.archivable)
        assertFalse(folded.keepsFinished)
        val keeping = state.copy(keepFinishedAgents = true).listRows(RowInputs(archivable = true))
        assertTrue(keeping.filterIsInstance<ProjectsListRow.ProjectEntry>().single().keepsFinished)
        val open = entry(RowInputs(archivable = true, expanded = mapOf("s:blog" to true)))
        assertEquals(listOf("b", "c", "a"), open.agents.map { it.id })
        assertEquals(1, open.foldedSeen)
        assertTrue(open.seenExpanded)
    }

    @Test
    fun `an old Mac that lists no projects still opens the machine by switching`() {
        val rows = ProjectsState().listRows(
            RowInputs(machines = listOf(section(projects = null, record = saved)))
        )
        val header = rows.single() as ProjectsListRow.MachineEntry
        assertTrue(header.opensOnlyBySwitching)
        assertEquals(null, header.count)

        val unsaved = ProjectsState().listRows(
            RowInputs(machines = listOf(section(projects = listOf(project("api")))))
        )
        val project = unsaved.filterIsInstance<ProjectsListRow.MachineProjectEntry>().single()
        assertFalse(project.canOpen)
        assertFalse((unsaved.first() as ProjectsListRow.MachineEntry).canOpen)
    }
}
