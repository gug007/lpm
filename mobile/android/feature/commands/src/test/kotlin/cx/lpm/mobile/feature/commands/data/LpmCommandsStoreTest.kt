package cx.lpm.mobile.feature.commands.data

import cx.lpm.mobile.core.data.commands.CommandOutcome
import cx.lpm.mobile.core.data.commands.LpmCommandsStore
import cx.lpm.mobile.core.model.CommandRef
import cx.lpm.mobile.core.model.CommandScope
import cx.lpm.mobile.core.model.ExpandedCommand
import cx.lpm.mobile.core.model.string
import cx.lpm.mobile.core.protocol.CommandFolderOp
import cx.lpm.mobile.core.testing.FakeSocket
import cx.lpm.mobile.feature.commands.commands
import cx.lpm.mobile.feature.commands.demoSession
import cx.lpm.mobile.feature.commands.liveSession
import cx.lpm.mobile.feature.commands.settle
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.async
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class LpmCommandsStoreTest {
    @Test
    fun `a project's screen gets both lists, sorted by folder`() = runTest {
        val t = demoSession()
        assertTrue(t.commands.available)
        t.commands.open("storefront")
        assertTrue("storefront" in t.commands.state.value.loading)
        t.settle()
        val lists = t.commands.state.value.lists.getValue("storefront")
        assertEquals(listOf("Git", "Testing"), lists.global.folders)
        assertEquals(
            listOf("commit-parts", "write-tests", "explain"),
            lists.global.commands.map { it.name }
        )
        assertEquals(
            listOf("fix-ticket", "review-changes"),
            lists.project?.commands?.map {
                it.name
            }
        )
        assertEquals("<ticket>", lists.project?.commands?.first()?.argumentHint)
        assertTrue(t.commands.state.value.loading.isEmpty())
    }

    @Test
    fun `outside a project only the global list comes`() = runTest {
        val t = demoSession()
        t.commands.load("")
        t.settle()
        assertNull(t.commands.state.value.lists.getValue("").project)
    }

    @Test
    fun `a save lands its lists and the change push refreshes what's open`() = runTest {
        val t = demoSession()
        t.commands.open("storefront")
        t.settle()
        val revision = t.commands.state.value.revision
        val save = async {
            t.commands.save(
                "storefront",
                CommandRef(CommandScope.Project, "Ops", "ship"),
                "Ships it",
                "Ship it",
                previous = null
            )
        }
        t.settle()
        assertEquals(CommandOutcome.Done(Unit), save.await())
        val project = t.commands.state.value.lists.getValue("storefront").project!!
        assertEquals(listOf("Bugs", "Ops", "Review"), project.folders)
        assertEquals(revision + 1, t.commands.state.value.revision)
    }

    @Test
    fun `a refused save carries the Mac's sentence`() = runTest {
        val t = demoSession()
        val save = async {
            t.commands.save(
                "storefront",
                CommandRef(CommandScope.Project, null, "fix-ticket"),
                "",
                "Again",
                previous = null
            )
        }
        t.settle()
        assertEquals(
            CommandOutcome.Failed("/fix-ticket already exists in the Bugs folder."),
            save.await()
        )
    }

    @Test
    fun `deleting a folder moves its commands to No folder`() = runTest {
        val t = demoSession()
        val delete = async {
            t.commands.folder("storefront", CommandFolderOp.Delete, CommandScope.Project, "Bugs")
        }
        t.settle()
        assertEquals(CommandOutcome.Done(Unit), delete.await())
        val project = t.commands.state.value.lists.getValue("storefront").project!!
        assertEquals(listOf("Review"), project.folders)
        assertNull(project.commands.single { it.name == "fix-ticket" }.folder)
    }

    @Test
    fun `a run comes back filled in, the project's command ahead of a global one`() = runTest {
        val t = demoSession()
        val run = async { t.commands.expand("storefront", "fix-ticket", "LPM-12") }
        t.settle()
        val expanded = (run.await() as CommandOutcome.Done<ExpandedCommand>).value
        assertTrue(expanded.text.startsWith("Fix LPM-12 on branch "))
        assertTrue(expanded.missing.isEmpty())
    }

    @Test
    fun `a Mac that doesn't answer in time fails the request`() = runTest {
        val t = liveSession()
        val socket = t.connectReady(features = listOf("lpmCommands"))
        val run = async { t.commands.expand("api", "explain", "") }
        t.settle()
        assertEquals("lpmCommandExpand", socket.sentTypes.last())
        // The link itself stays up: its heartbeat is answered.
        t.settle(21_000)
        socket.receive("""{"t":"pong"}""")
        t.settle(9_000)
        assertEquals(CommandOutcome.Failed(LpmCommandsStore.TIMED_OUT), run.await())
    }

    @Test
    fun `a dropped link fails what's in flight and reloads open screens`() = runTest {
        val t = liveSession()
        val socket = t.connectReady(features = listOf("lpmCommands"))
        t.commands.open("api")
        t.settle()
        val first = socket.sentOf("lpmCommands").single()
        socket.receive(
            """{"t":"lpmCommands","project":"api","ok":true,"reqId":"${first.string("reqId")}",""" +
                """"lists":{"global":{"folders":[],"commands":[]},"project":null,""" +
                """"projectError":"The host didn't answer."}}"""
        )
        t.settle()
        assertEquals(
            "The host didn't answer.",
            t.commands.state.value.lists.getValue("api").projectError
        )
        val delete = async {
            t.commands.delete("api", CommandRef(CommandScope.Global, null, "x"))
        }
        t.settle()
        t.commands.onConnectionReset()
        t.settle()
        assertEquals(CommandOutcome.Failed(LpmCommandsStore.DISCONNECTED), delete.await())
        assertEquals(2, socket.sentOf("lpmCommands").size)
    }

    @Test
    fun `a screen over one showing the same project doesn't fetch again`() = runTest {
        val t = liveSession()
        val socket = t.connectReady(features = listOf("lpmCommands"))
        t.commands.open("api")
        t.settle()
        socket.answerLists("api")
        t.settle()
        t.commands.open("api")
        t.settle()
        assertEquals(listOf("api"), socket.projectsAsked())
        t.commands.close("api")
        t.commands.close("api")
        t.commands.open("api")
        t.settle()
        assertEquals(listOf("api", "api"), socket.projectsAsked())
    }

    @Test
    fun `a change push refetches the lists on screen it touches`() = runTest {
        val t = liveSession()
        val socket = t.connectReady(features = listOf("lpmCommands"))
        t.commands.open("api")
        t.commands.open("web")
        t.settle()
        socket.answerLists("api")
        socket.answerLists("web")
        t.settle()
        socket.receive("""{"t":"lpmCommandsChanged","project":"web"}""")
        t.settle()
        assertEquals(listOf("api", "web", "web"), socket.projectsAsked())
        socket.answerLists("web")
        t.settle()
        socket.receive("""{"t":"lpmCommandsChanged","project":""}""")
        t.settle()
        assertEquals(listOf("api", "web"), socket.projectsAsked().drop(3).sorted())
    }

    @Test
    fun `a load that fails with nothing shown says why`() = runTest {
        val t = liveSession()
        val socket = t.connectReady(features = listOf("lpmCommands"))
        t.commands.open("api")
        t.settle()
        val reqId = socket.sentOf("lpmCommands").single().string("reqId")
        socket.receive(
            """{"t":"lpmCommands","ok":false,"reqId":"$reqId","error":"No such project."}"""
        )
        t.settle()
        assertEquals("No such project.", t.commands.state.value.loadError["api"])
        assertTrue(t.commands.state.value.loading.isEmpty())
    }
}

/** The projects `lpmCommands` was asked for, in order. */
private fun FakeSocket.projectsAsked(): List<String> =
    sentOf("lpmCommands").map { it.string("project").orEmpty() }

/** Answers the last `lpmCommands` request for [project] with empty lists. */
private fun FakeSocket.answerLists(project: String) {
    val reqId = sentOf("lpmCommands").last { it.string("project") == project }.string("reqId")
    receive(
        """{"t":"lpmCommands","project":"$project","ok":true,"reqId":"$reqId",""" +
            """"lists":{"global":{"folders":[],"commands":[]},"project":null}}"""
    )
}
