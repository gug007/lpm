package cx.lpm.mobile.feature.widgets

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import cx.lpm.mobile.core.data.push.NotificationOpenTarget
import cx.lpm.mobile.core.model.AgentState
import cx.lpm.mobile.core.model.AgentWidgetRow
import cx.lpm.mobile.core.model.Project
import cx.lpm.mobile.core.push.PushNotifier
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import org.junit.Assert.assertEquals
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class AppShortcutsTest {
    private val context = ApplicationProvider.getApplicationContext<Context>()

    private fun row(
        title: String,
        state: AgentState,
        since: Long?,
        project: String = "storefront",
        terminal: String? = title
    ) = AgentWidgetRow(
        project = project,
        key = title,
        terminalId = terminal,
        title = title,
        state = state,
        since = since
    )

    private fun project(name: String, label: String = "") = Project.parse(
        Json.parseToJsonElement("""{"name":"$name","label":"$label"}""") as JsonObject
    )

    private val labels = mapOf("storefront" to "Storefront", "api" to "")

    private fun label(name: String) = labels[name]?.takeIf { it.isNotEmpty() } ?: name

    @Test
    fun `tabs needing you come first, then the most recently busy, three at most`() {
        val rows = listOf(
            row("Done long ago", AgentState.Done, since = 1),
            row("Working early", AgentState.Working, since = 10),
            row("Working lately", AgentState.Working, since = 50),
            row("Broke", AgentState.Error, since = 5),
            row("Asks", AgentState.NeedsYou, since = 2)
        )
        assertEquals(
            listOf("Asks", "Broke", "Working lately"),
            appShortcutTabs(rows).map { it.title }
        )
    }

    @Test
    fun `a row without a terminal is left out and each tab is listed once`() {
        val rows = listOf(
            row("No tab", AgentState.NeedsYou, since = 9, terminal = null),
            row("First", AgentState.Working, since = 8, terminal = "t1"),
            row("Same tab", AgentState.Working, since = 7, terminal = "t1"),
            row("Other project", AgentState.Working, since = 6, project = "api", terminal = "t1"),
            row("Never seen starting", AgentState.Working, since = null, terminal = "t2")
        )
        assertEquals(
            listOf("First", "Other project", "Never seen starting"),
            appShortcutTabs(rows).map { it.title }
        )
    }

    @Test
    fun `each tab reads its project and state, and New Tab follows`() {
        val rows = listOf(
            row("Fix login", AgentState.NeedsYou, since = 1, terminal = "t1"),
            row("Write tests", AgentState.Done, since = 2, project = "api", terminal = "t2")
        )
        val shortcuts = appShortcuts(rows, "srv-1", project("api"), ::label)
        assertEquals(
            listOf(
                AppShortcut.Tab(
                    "srv-1",
                    "storefront",
                    "t1",
                    "Fix login",
                    "Storefront · Needs you",
                    AgentState.NeedsYou
                ),
                AppShortcut.Tab("srv-1", "api", "t2", "Write tests", "api · Done", AgentState.Done),
                AppShortcut.NewTab("srv-1", "api", "api")
            ),
            shortcuts
        )
        assertEquals(
            listOf("terminal/storefront/t1", "terminal/api/t2", "newTab"),
            shortcuts.map {
                it.id
            }
        )
    }

    @Test
    fun `without a project to offer there's no New Tab`() {
        val rows = listOf(row("Broke", AgentState.Error, since = 1))
        assertEquals(
            listOf("Storefront · Problem"),
            appShortcuts(rows, null, null, ::label).map { (it as AppShortcut.Tab).subtitle }
        )
        assertEquals(emptyList<AppShortcut>(), appShortcuts(emptyList(), null, null, ::label))
    }

    @Test
    fun `a tab opens its terminal on its Mac, as a notification tap does`() {
        val tab = AppShortcut.Tab(
            "srv-1",
            "storefront",
            "t1",
            "Fix login",
            "Storefront · Working",
            AgentState.Working
        )
        val info = tab.info(context, rank = 0)
        assertEquals("Fix login", info.shortLabel)
        assertEquals("Fix login · Storefront · Working", info.longLabel)
        assertEquals(PushNotifier.ACTION_OPEN, info.intent.action)
        assertEquals(
            NotificationOpenTarget(
                "srv-1",
                "storefront",
                NotificationOpenTarget.Kind.Terminal,
                "t1"
            ),
            NotificationOpenTarget.from(info.intent::getStringExtra)
        )
    }

    @Test
    fun `New Tab opens its project with the New Tab sheet up`() {
        val info = AppShortcut.NewTab(null, "storefront", "Storefront").info(context, rank = 3)
        assertEquals("New Tab", info.shortLabel)
        assertEquals("New Tab in Storefront", info.longLabel)
        assertEquals(3, info.rank)
        assertEquals(
            NotificationOpenTarget(null, "storefront", NotificationOpenTarget.Kind.NewTab, null),
            NotificationOpenTarget.from(info.intent::getStringExtra)
        )
    }
}
