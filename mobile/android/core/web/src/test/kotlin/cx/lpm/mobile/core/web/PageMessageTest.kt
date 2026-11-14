package cx.lpm.mobile.core.web

import kotlinx.serialization.json.JsonNull
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class PageMessageTest {
    @Test
    fun parsesAStringBody() {
        val message = PageMessage.parse("""{"name":"input","body":"ls\r"}""")
        assertEquals("input", message?.name)
        assertEquals("ls\r", message?.string)
    }

    @Test
    fun parsesAnObjectBody() {
        val message = PageMessage.parse("""{"name":"resize","body":{"cols":54,"rows":38}}""")!!
        assertEquals(54, message.int("cols"))
        assertEquals(38, message.int("rows"))
        assertNull(message.string)
    }

    @Test
    fun aMissingBodyIsNull() {
        assertEquals(PageMessage("ready", JsonNull), PageMessage.parse("""{"name":"ready"}"""))
    }

    @Test
    fun rejectsWhatIsNotAnEnvelope() {
        assertNull(PageMessage.parse(null))
        assertNull(PageMessage.parse(""))
        assertNull(PageMessage.parse("not json"))
        assertNull(PageMessage.parse("\"input\""))
        assertNull(PageMessage.parse("""{"body":"x"}"""))
        assertNull(PageMessage.parse("""{"name":3}"""))
    }

    @Test
    fun fieldsReadLikeSwiftCasts() {
        val message = PageMessage.parse(
            """{"name":"x","body":{"bottom":412.5,"whole":300,"fills":false,"s":"5","n":null,"paths":["a.ts","b.ts"],"mixed":["a",1]}}"""
        )!!
        assertEquals(412.5, message.double("bottom")!!, 0.0)
        assertEquals(300.0, message.double("whole")!!, 0.0)
        assertNull(message.int("bottom"))
        assertEquals(false, message.boolean("fills"))
        assertNull(message.int("s"))
        assertNull(message.boolean("s"))
        assertNull(message.int("n"))
        assertNull(message.int("absent"))
        assertEquals(listOf("a.ts", "b.ts"), message.strings("paths"))
        assertEquals("5", message.string("s"))
        assertNull(message.string("whole"))
        assertNull(message.string("n"))
        assertNull(message.strings("mixed"))
        assertNull(message.strings("s"))
    }

    @Test
    fun aStringBodyHasNoFields() {
        assertNull(PageMessage.parse("""{"name":"x","body":"y"}""")!!.int("cols"))
    }
}
