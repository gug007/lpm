package cx.lpm.mobile.feature.mac.data

import cx.lpm.mobile.core.data.client.LpmClient
import cx.lpm.mobile.core.data.session.SessionStore
import cx.lpm.mobile.core.model.string
import cx.lpm.mobile.core.testing.FakeSocket
import cx.lpm.mobile.core.testing.TestSession
import cx.lpm.mobile.feature.mac.settle
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class GenerateStoreTest {
    private val TestSession.generate: GenerateStore get() = store()

    private fun TestScope.generateSession(): TestSession =
        TestSession(this, setOf(SessionStore.Factory(::GenerateStore)))

    private fun TestSession.ready(offered: Boolean = true): FakeSocket = connectReady(
        features = if (offered) listOf(LpmClient.GENERATE_APPROVAL_FEATURE) else emptyList()
    )

    private fun request(id: String, needsKey: String = "null") =
        """{"id":"$id","kind":"image","agent":"Claude","project":"web","prompt":"A fox",""" +
            """"model":"Nano Banana 2.1","provider":"Google","details":["16:9"],""" +
            """"cost":"about 3¢","out":"generated/a-fox.png","needsKey":$needsKey,""" +
            """"keyLabel":"Google Gemini","projectGrant":true,"overLimit":false,""" +
            """"today":"Today: 1 image, 3¢"}"""

    @Test
    fun `a Mac that offers it is asked for its requests and takes the answer`() = runTest {
        val t = generateSession()
        val socket = t.ready()
        assertEquals(1, socket.sentOf("generateRequests").size)

        socket.receive("""{"t":"generateRequests","requests":[${request("g1")}]}""")
        t.settle()
        val shown = t.generate.state.value.shown!!
        assertEquals("Claude wants to make an image", shown.title)
        assertEquals("Allow in web", shown.primaryLabel)
        assertEquals("Nano Banana 2.1 · Google · 16:9 · about 3¢", shown.facts)

        t.generate.answer(shown, "project", "A red fox", "")
        t.settle()
        val sent = socket.sentOf("answerGenerate").single()
        assertEquals("g1", sent.string("id"))
        assertEquals("project", sent.string("decision"))
        assertEquals("A red fox", sent.string("prompt"))
        assertNull(sent["key"])

        socket.receive("""{"t":"answerGenerate","id":"g1","ok":true}""")
        t.settle()
        assertNull(t.generate.state.value.shown)
    }

    @Test
    fun `a Mac without it is never asked`() = runTest {
        val t = generateSession()
        val socket = t.ready(offered = false)
        assertTrue(socket.sentOf("generateRequests").isEmpty())
    }

    @Test
    fun `a missing key comes first and a swiped request stays waiting on the Mac`() = runTest {
        val t = generateSession()
        val socket = t.ready()
        socket.receive(
            """{"t":"generateRequests","requests":[${request(
                "g1",
                "\"gemini\""
            )},${request("g2")}]}"""
        )
        t.settle()
        val first = t.generate.state.value.shown!!
        assertEquals("Add a Google Gemini key to make this image", first.title)
        assertEquals("Save and continue", first.primaryLabel)
        assertEquals("once", first.primaryDecision)
        assertEquals(1, t.generate.state.value.waiting)

        t.generate.answer(first, "once", "A fox", " AIza-key ")
        t.settle()
        assertEquals("AIza-key", socket.sentOf("answerGenerate").single().string("key"))
        assertNull(socket.sentOf("answerGenerate").single()["prompt"])
        socket.receive(
            """{"t":"answerGenerate","id":"g1","ok":false,"error":"that request is gone"}"""
        )
        t.settle()
        assertEquals("that request is gone", t.generate.state.value.error)

        t.generate.setAside(first)
        assertEquals("g2", t.generate.state.value.shown?.id)
        assertEquals(2, t.generate.state.value.requests.size)
    }
}
