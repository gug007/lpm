package cx.lpm.mobile.core.data.mac

import cx.lpm.mobile.core.protocol.Inbound
import java.io.File
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

@OptIn(kotlinx.coroutines.ExperimentalCoroutinesApi::class)
class AgentTabSnapshotsTest {
    @get:Rule
    val folder = TemporaryFolder()

    private val dir by lazy { File(folder.root, "agent-tabs") }
    private val answers by lazy { LastAnswers(File(folder.root, "answers.json")) }

    private fun TestScope.snapshots() = AgentTabSnapshots(
        dir,
        answers,
        backgroundScope,
        StandardTestDispatcher(testScheduler)
    )

    private fun frame(vararg tabs: Pair<String, String>) = tabs.joinToString(
        ",",
        """{"t":"terminals","project":"api","terminals":[""",
        "]}"
    ) { (id, cli) -> """{"id":"$id","label":"$id","project":"api","cli":"$cli"}""" }

    private fun AgentTabSnapshots.record(text: String, mac: String) =
        record(Inbound.parse(text) as Inbound.Terminals, text, mac)

    private suspend fun AgentTabSnapshots.readable() = readableTabs("api", MAC, "srv").map { it.id }

    private fun TestScope.settle() {
        advanceTimeBy(3_000)
        runCurrent()
    }

    @Test
    fun `agent tabs and their screens come back after a relaunch`() = runTest {
        val first = snapshots()
        first.record(frame("t1" to "claude", "t2" to ""), MAC)
        first.saveScreen("hello", 7, "t1", MAC)
        settle()
        val second = snapshots()
        assertEquals(listOf("t1"), second.tabs("api", MAC).map { it.id })
        assertEquals(listOf("t1"), second.readable())
        assertEquals(AgentTabSnapshots.Screen("hello", 7), second.screen("t1", MAC))
        assertNull(second.screen("t2", MAC))
        assertTrue(second.tabs("api", "other").isEmpty())
    }

    @Test
    fun `a closed tab's screen goes, and a removed project's`() = runTest {
        val s = snapshots()
        s.record(frame("t1" to "claude", "t2" to "codex"), MAC)
        s.saveScreen("a", 0, "t1", MAC)
        s.saveScreen("b", 0, "t2", MAC)
        settle()
        assertEquals(listOf("t1", "t2"), s.readable())
        s.record(frame("t2" to "codex"), MAC)
        settle()
        assertNull(s.screen("t1", MAC))
        assertEquals(listOf("t2"), s.readable())
        s.keep(setOf("web"), MAC)
        settle()
        assertNull(s.screen("t2", MAC))
        assertTrue(s.tabs("api", MAC).isEmpty())
    }

    @Test
    fun `unpairing leaves nothing, whatever was still being written`() = runTest {
        val s = snapshots()
        s.record(frame("t1" to "claude"), MAC)
        answers.record("srv", mapOf("t1" to LastAnswer("answer", 1)))
        assertEquals(listOf("t1"), s.readable())
        s.saveScreen("a", 0, "t1", MAC)
        s.remove(MAC)
        settle()
        assertFalse(File(dir, MAC).exists())
        assertTrue(s.tabs("api", MAC).isEmpty())
    }

    @Test
    fun `broken files read as nothing kept`() = runTest {
        File(dir, MAC).mkdirs()
        File(File(dir, MAC), "tabs.json").writeText("[")
        assertTrue(snapshots().tabs("api", MAC).isEmpty())
    }

    private companion object {
        const val MAC = "mac-1"
    }
}
