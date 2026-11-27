package cx.lpm.mobile.core.data.widget

import cx.lpm.mobile.core.data.push.PushClear
import cx.lpm.mobile.core.data.push.StatusIdentity
import cx.lpm.mobile.core.model.AgentState
import cx.lpm.mobile.core.model.AgentWidgetMac
import cx.lpm.mobile.core.model.AgentWidgetRow
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

class AgentWidgetStoreTest {
    @get:Rule
    val dir = TemporaryFolder()

    private var refreshes = 0
    private var clock = 900L

    private fun store() = AgentWidgetStore(dir.root, { clock }) { refreshes++ }

    private fun push(status: String, ts: Long, target: String = "terminal") =
        Json.parseToJsonElement(
            """{"serverId":"mac","project":"storefront","target":"$target",""" +
                """"terminal":"Fix tax","terminalId":"t1","status":"$status",""" +
                """"ts":$ts,"key":"claude_code_1"}"""
        ).jsonObject

    private val working = AgentWidgetRow(
        project = "storefront",
        key = "claude_code_1",
        terminalId = "t1",
        title = "Fix tax",
        state = AgentState.Working,
        since = 100
    )

    @Test
    fun `a wait counts from when it began and keeps the tab's name`() {
        val store = store()
        store.apply(push("Waiting", ts = 500))
        assertEquals(
            listOf(
                AgentWidgetMac(
                    "mac",
                    listOf(working.copy(state = AgentState.NeedsYou, since = 500)),
                    seenAt = 900
                )
            ),
            store.macs.value
        )
        assertEquals(1, refreshes)
    }

    @Test
    fun `a finished turn holds at how long the work took`() {
        val store = store()
        store.publish(AgentWidgetMac("mac", listOf(working)))
        store.apply(push("Done", ts = 400))
        val done = store.macs.value.single().rows.single()
        assertEquals(AgentState.Done, done.state)
        assertEquals(100L, done.since)
        assertEquals(400L, done.until)
    }

    @Test
    fun `automations and running reports leave the list alone`() {
        val store = store()
        store.apply(push("Done", ts = 400, target = "automation"))
        store.apply(push("Running", ts = 400))
        store.apply(push("Paused", ts = 400))
        assertEquals(emptyList<AgentWidgetMac>(), store.macs.value)
        assertEquals(0, refreshes)
    }

    @Test
    fun `a long pause's notice leaves a working row as it was`() {
        val store = store()
        store.publish(AgentWidgetMac("mac", listOf(working)))
        val before = store.macs.value
        store.apply(push("Paused", ts = 400))
        assertEquals(before, store.macs.value)
    }

    @Test
    fun `a clear removes only that Mac's rows`() {
        val store = store()
        store.publish(AgentWidgetMac("mac", listOf(working)))
        store.publish(AgentWidgetMac("other", listOf(working)))
        store.apply(PushClear("mac", setOf(StatusIdentity("storefront", "claude_code_1"))))
        assertEquals(
            listOf(
                AgentWidgetMac("mac", emptyList(), seenAt = 900),
                AgentWidgetMac("other", listOf(working), seenAt = 900)
            ),
            store.macs.value
        )
    }

    @Test
    fun `an unchanged list isn't written again, and the rows outlive the store`() {
        store().publish(AgentWidgetMac("mac", listOf(working)))
        val reopened = store()
        reopened.publish(AgentWidgetMac("mac", listOf(working)))
        assertEquals(1, refreshes)
        reopened.remove(setOf("mac"))
        assertEquals(emptyList<AgentWidgetMac>(), store().macs.value)
    }

    @Test
    fun `leaving the app stamps an unchanged list as seen again`() {
        val store = store()
        val mac = AgentWidgetMac("mac", emptyList(), name = "MacBook Pro")
        store.publish(mac)
        clock = 1_500
        store.publish(mac)
        assertEquals(900L, store.macs.value.single().seenAt)
        store.confirm(mac)
        assertEquals(listOf(mac.copy(seenAt = 1_500)), store.macs.value)
        assertEquals(2, refreshes)
    }
}
