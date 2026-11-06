package cx.lpm.mobile.core.web

import java.io.File
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class ActionPopupPageTest {
    private val template = File("../../../shared/web/popup/bootstrap.js").readText()

    @Test
    fun `the payload replaces the token the bootstrap is called with`() {
        val script = ActionPopupPage.bootstrap(template, """{"data":1}""")
        assertTrue(script.trimEnd().endsWith("""})({"data":1});"""))
        assertTrue("__LPM_POPUP_PAYLOAD__" !in script)
    }

    @Test
    fun `the script goes first in the head`() {
        assertEquals(
            "<!doctype html><html lang=\"en\"><HEAD data-x><script>s</script><title>x</title>",
            ActionPopupPage.withScript(
                "<!doctype html><html lang=\"en\"><HEAD data-x><title>x</title>",
                "s"
            )
        )
    }

    @Test
    fun `a page without a head gets the script after its html or doctype, else first`() {
        assertEquals(
            "<html><script>s</script><body>",
            ActionPopupPage.withScript("<html><body>", "s")
        )
        assertEquals(
            "<!DOCTYPE html><script>s</script><body>",
            ActionPopupPage.withScript("<!DOCTYPE html><body>", "s")
        )
        assertEquals(
            "<script>s</script><header>hi</header>",
            ActionPopupPage.withScript("<header>hi</header>", "s")
        )
    }

    @Test
    fun `only the page's own load stays, a tapped web link opens outside`() {
        assertEquals(PopupNavigation.OpenOutside, popupNavigation("https", true, tapped = true))
        assertEquals(PopupNavigation.OpenOutside, popupNavigation("HTTP", false, tapped = true))
        assertEquals(PopupNavigation.Drop, popupNavigation("mailto", true, tapped = true))
        assertEquals(PopupNavigation.Drop, popupNavigation("https", true, tapped = false))
        assertEquals(PopupNavigation.Drop, popupNavigation("about", true, tapped = false))
        assertEquals(PopupNavigation.Allow, popupNavigation("https", false, tapped = false))
        assertEquals(PopupNavigation.Allow, popupNavigation("about", false, tapped = false))
        assertEquals(PopupNavigation.Drop, popupNavigation("intent", false, tapped = false))
        assertEquals(PopupNavigation.Drop, popupNavigation(null, false, tapped = false))
    }
}
