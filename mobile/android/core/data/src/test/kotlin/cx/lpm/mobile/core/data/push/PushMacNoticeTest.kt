package cx.lpm.mobile.core.data.push

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class PushMacNoticeTest {
    private fun obj(json: String) = Json.parseToJsonElement(json) as JsonObject

    private val keepAwake =
        """{"serverId":"srv-1","target":"keepAwake","title":"Studio can sleep in 5 min",""" +
            """"body":"The time you set is running out.","ts":7,"key":"keepAwake"}"""

    @Test
    fun `Keep awake about to let go is shown in the Mac's words`() {
        assertEquals(
            PushMacNotice(
                serverId = "srv-1",
                target = PushMacNotice.KEEP_AWAKE,
                title = "Studio can sleep in 5 min",
                body = "The time you set is running out.",
                key = "keepAwake"
            ),
            PushMacNotice.parse(obj(keepAwake))
        )
        assertNull(PushAlert.parse(obj(keepAwake)))
        assertNull(PushRecap.parse(obj(keepAwake)))
    }

    @Test
    fun `only Mac notices with a title are read`() {
        assertEquals(
            PushMacNotice.USAGE,
            PushMacNotice.parse(obj("""{"target":"usage","title":"Codex reset"}"""))?.target
        )
        assertNull(PushMacNotice.parse(obj("""{"target":"keepAwake"}""")))
        assertNull(PushMacNotice.parse(obj("""{"target":"recap","title":"Ready"}""")))
    }

    @Test
    fun `a tap opens Keep awake on the Mac it came from, with no project`() {
        val extras = mapOf("serverId" to "srv-1", "target" to "keepAwake")
        assertEquals(
            NotificationOpenTarget(
                serverId = "srv-1",
                project = "",
                kind = NotificationOpenTarget.Kind.KeepAwake,
                itemId = null
            ),
            NotificationOpenTarget.from(extras::get)
        )
    }
}
