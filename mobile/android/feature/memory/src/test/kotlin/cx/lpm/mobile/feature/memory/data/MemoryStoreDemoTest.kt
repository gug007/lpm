package cx.lpm.mobile.feature.memory.data

import cx.lpm.mobile.core.model.Haptic
import cx.lpm.mobile.feature.memory.demoSession
import cx.lpm.mobile.feature.memory.memory
import cx.lpm.mobile.feature.memory.settle
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class MemoryStoreDemoTest {
    private val k = memoryKey("storefront", "checkout-redesign")

    @Test
    fun `the storefront's sessions list newest first`() = runTest {
        val t = demoSession()
        t.memory.screenDidOpen("storefront")
        assertTrue("storefront" in t.memory.state.value.listLoading)
        t.settle()
        val s = t.memory.state.value
        assertEquals(
            listOf("checkout-redesign", "payments-module", "cart-badge-bug"),
            s.sessions("storefront").map { it.name }
        )
        assertTrue(s.folderExists("storefront"))
        assertFalse(s.isShared("storefront"))
        assertEquals("storefront", s.owner("storefront"))
        assertTrue(s.listLoading.isEmpty())
    }

    @Test
    fun `a project with no folder yet is the empty state, not a failure`() = runTest {
        val t = demoSession()
        t.memory.load("blog")
        t.settle()
        val s = t.memory.state.value
        assertTrue(s.sessions("blog").isEmpty())
        assertFalse(s.folderExists("blog"))
        assertNull(s.listError["blog"])
    }

    @Test
    fun `opening a session fetches the whole document`() = runTest {
        val t = demoSession()
        t.memory.openSession("storefront", "checkout-redesign")
        assertTrue(k in t.memory.state.value.documentLoading)
        t.settle()
        val s = t.memory.state.value
        val doc = s.document("storefront", "checkout-redesign")!!
        assertTrue(doc.content.startsWith("# Checkout redesign\n\n## Goal\n"))
        assertTrue("— codex" in doc.content)
        assertEquals(1, s.documentRevision[k])
        assertTrue(s.documentLoading.isEmpty())
    }

    @Test
    fun `a save against the loaded text lands and updates the held document`() = runTest {
        val t = demoSession()
        t.memory.openSession("storefront", "checkout-redesign")
        t.settle()
        val loaded = t.memory.state.value.document("storefront", "checkout-redesign")!!.content
        t.memory.save("storefront", "checkout-redesign", "$loaded- More\n", baseline = loaded)
        assertTrue(k in t.memory.state.value.saving)
        t.settle()
        val s = t.memory.state.value
        assertEquals(1, s.savedTick[k])
        assertEquals("$loaded- More\n", s.document("storefront", "checkout-redesign")!!.content)
        assertEquals(Haptic.Success, s.feedback?.haptic)
        assertTrue(s.saving.isEmpty())
        assertNull(s.conflictNotice[k])
    }

    @Test
    fun `a save against text that moved reloads the latest and notes the conflict`() = runTest {
        val t = demoSession()
        t.memory.openSession("storefront", "checkout-redesign")
        t.settle()
        t.memory.beginEditing("storefront", "checkout-redesign")
        t.memory.save("storefront", "checkout-redesign", "mine", baseline = "what I loaded")
        t.settle()
        val s = t.memory.state.value
        assertEquals(
            "Changed on your Mac by an agent — reloaded the latest version.",
            s.conflictNotice[k]
        )
        assertNull(s.saveError[k])
        assertNull(s.savedTick[k])
        assertEquals(2, s.documentRevision[k])
        assertEquals(Haptic.Error, s.feedback?.haptic)
        assertTrue(s.document("storefront", "checkout-redesign")!!.content.startsWith("# Checkout"))

        t.memory.consumeConflict("storefront", "checkout-redesign")
        assertNull(t.memory.state.value.conflictNotice[k])
    }

    @Test
    fun `a create reports its name for the list to open`() = runTest {
        val t = demoSession()
        t.memory.screenDidOpen("storefront")
        t.settle()
        t.memory.create("storefront", "release-notes", "# Release notes\n")
        t.settle()
        val s = t.memory.state.value
        assertEquals("release-notes", s.createdName["storefront"])
        assertTrue(s.sessions("storefront").any { it.name == "release-notes" })

        t.memory.consumeCreated("storefront")
        assertNull(t.memory.state.value.createdName["storefront"])
    }

    @Test
    fun `a delete drops the session and signals the open page`() = runTest {
        val t = demoSession()
        t.memory.screenDidOpen("storefront")
        t.memory.openSession("storefront", "cart-badge-bug")
        t.settle()
        t.memory.delete("storefront", "cart-badge-bug")
        assertTrue(memoryKey("storefront", "cart-badge-bug") in t.memory.state.value.deleting)
        t.settle()
        val s = t.memory.state.value
        assertEquals(1, s.deletedTick[memoryKey("storefront", "cart-badge-bug")])
        assertNull(s.document("storefront", "cart-badge-bug"))
        assertEquals(
            listOf("checkout-redesign", "payments-module"),
            s.sessions("storefront").map {
                it.name
            }
        )
    }

    @Test
    fun `memory-changed refreshes the list and the open document, coalesced`() = runTest {
        val t = demoSession()
        t.memory.screenDidOpen("storefront")
        t.memory.openSession("storefront", "checkout-redesign")
        t.settle()
        t.memory.changed("storefront")
        t.settle(200)
        t.memory.changed("storefront")
        t.settle(400)
        assertFalse(k in t.memory.state.value.documentLoading)
        t.settle(100)
        assertTrue(k in t.memory.state.value.documentLoading)
        assertTrue("storefront" in t.memory.state.value.listLoading)
        t.settle()
        assertEquals(2, t.memory.state.value.documentRevision[k])
    }

    @Test
    fun `memory-changed leaves a document being edited alone`() = runTest {
        val t = demoSession()
        t.memory.screenDidOpen("storefront")
        t.memory.openSession("storefront", "checkout-redesign")
        t.settle()
        t.memory.beginEditing("storefront", "checkout-redesign")
        t.memory.changed("storefront")
        t.settle(500)
        assertTrue("storefront" in t.memory.state.value.listLoading)
        assertFalse(k in t.memory.state.value.documentLoading)

        t.memory.endEditing("storefront", "checkout-redesign")
        t.memory.changed("storefront")
        t.settle(500)
        assertTrue(k in t.memory.state.value.documentLoading)
    }

    @Test
    fun `reset forgets everything`() = runTest {
        val t = demoSession()
        t.memory.screenDidOpen("storefront")
        t.settle()
        t.memory.reset()
        assertEquals(MemoryState(), t.memory.state.value)
    }
}
