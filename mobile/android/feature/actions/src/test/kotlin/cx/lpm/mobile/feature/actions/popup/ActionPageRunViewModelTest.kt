package cx.lpm.mobile.feature.actions.popup

import cx.lpm.mobile.core.model.SessionKey
import cx.lpm.mobile.core.testing.MainDispatcherRule
import cx.lpm.mobile.core.testing.TestSession
import cx.lpm.mobile.feature.actions.demoSession
import cx.lpm.mobile.feature.actions.settle
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.boolean
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test

class ActionPageRunViewModelTest {
    @get:Rule
    val main = MainDispatcherRule()

    private val replies = mutableListOf<JsonObject>()
    private var refreshes = 0

    private fun TestScope.page(t: TestSession, project: String): ActionPageRunViewModel {
        t.settle()
        return ActionPageRunViewModel(project, SessionKey.Live, t.sessions)
    }

    private fun ActionPageRunViewModel.post(message: String) =
        ask(message, onRefresh = { refreshes++ }, onSpawn = null) {
            replies += Json.parseToJsonElement(it).jsonObject
        }

    private fun run(id: String, action: String, inputs: String = "{}") =
        """{"lpmRun":{"id":"$id","action":"$action","inputs":$inputs}}"""

    private fun JsonObject.flag(key: String) = getValue(key).jsonPrimitive.boolean

    private fun JsonObject.text(key: String) = getValue(key).jsonPrimitive.content

    @Test
    fun `the Releases page releases after the confirmation and hears the output`() = runTest {
        val t = demoSession()
        val vm = page(t, "api-gateway")
        vm.post(run("1", "release"))
        val confirm = vm.step.value as PageRunStep.Confirm
        assertEquals("release", confirm.action.name)

        vm.confirm()
        t.settle()
        assertTrue(vm.step.value is PageRunStep.Background)
        vm.post(run("2", "release"))
        assertEquals("This page's last run hasn't finished.", replies.single().text("error"))

        t.settle(8_000)
        t.settle(4_000)
        val done = replies.last()
        assertEquals("1", done.text("id"))
        assertTrue(done.flag("ok"))
        assertTrue(done.text("output").endsWith("Released v2.4.2."))
    }

    @Test
    fun `turning the confirmation down tells the page, and runs nothing`() = runTest {
        val t = demoSession()
        val vm = page(t, "api-gateway")
        vm.post(run("1", "release"))
        vm.dismiss(vm.step.value!!)
        assertNull(vm.step.value)
        assertTrue(replies.single().flag("canceled"))
        assertEquals(false, replies.single().flag("ok"))
    }

    @Test
    fun `inputs the page fills go unasked, and the rest are asked from what it gave`() = runTest {
        val t = demoSession()
        val vm = page(t, "blog")
        vm.post(run("1", "new-post", """{"title":"Hello world"}"""))
        assertTrue(vm.step.value is PageRunStep.Background)
        t.settle(8_000)
        t.settle(4_000)
        assertTrue(replies.single().text("output").contains("posts/hello-world.md created"))

        val other = page(t, "blog")
        other.post(run("1", "new-post", """{"title":"  "}"""))
        val inputs = other.step.value as PageRunStep.Inputs
        assertEquals(emptyMap<String, String>(), inputs.initial)
    }

    @Test
    fun `a missing action is an error and a refresh goes to the page's data`() = runTest {
        val t = demoSession()
        val vm = page(t, "api-gateway")
        vm.post(run("1", "nope"))
        vm.post("""{"lpmRefresh":true}""")
        vm.post("""{"lpmOpen":"https://lpm.cx"}""")
        assertEquals("There's no action \"nope\" in this project.", replies.single().text("error"))
        assertEquals(1, refreshes)
    }
}
