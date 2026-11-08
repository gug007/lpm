package cx.lpm.mobile.core.model

import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Test

class ShareTest {
    private fun share(note: String, text: String) = PendingShare(
        id = "S-1",
        serverId = "srv-1",
        macName = "Studio Mac",
        project = "storefront",
        projectTitle = "Storefront",
        destination = ShareDestination.Agent,
        agent = "claude",
        note = note,
        text = text,
        createdAt = 1_792_000_000_000
    )

    private fun mac(serverId: String, name: String = serverId) = ShareMac(
        localId = "L-$serverId",
        serverId = serverId,
        name = name,
        hosts = emptyList(),
        port = 8765
    )

    @Test
    fun thePromptIsTheNoteTheTextAndThePathsAParagraphEach() {
        val share = share("  Fix this layout \n", "https://example.com/a")
        assertEquals(
            "Fix this layout\n\nhttps://example.com/a\n\n/tmp/a.jpg /tmp/b.jpg",
            share.prompt(listOf("/tmp/a.jpg", "/tmp/b.jpg"))
        )
        assertEquals("Fix this layout\n\nhttps://example.com/a", share.prompt(emptyList()))
        assertEquals("Fix this layout\n\nhttps://example.com/a", share.noteText)
    }

    @Test
    fun emptyPartsLeaveNoBlankParagraphs() {
        assertEquals("/tmp/a.jpg", share(" ", "").prompt(listOf("/tmp/a.jpg")))
        assertEquals("", share("", "\n").noteText)
    }

    @Test
    fun theLiveMacGoesFirstAndMacsNoLongerSavedDrop() {
        val directory = ShareDirectory(listOf(mac("a"), mac("b"), mac("c")))
        val updated = directory.updating(mac("b", "Office Mac"), keeping = setOf("a", "b"))
        assertEquals(listOf(mac("b", "Office Mac"), mac("a")), updated.macs)
        assertEquals(listOf(mac("a")), directory.updating(null, keeping = setOf("a")).macs)
    }

    @Test
    fun aProjectWithoutALabelIsTitledByItsName() {
        assertEquals("api", ShareProject("api", "").title)
        assertEquals("API Gateway", ShareProject("api", "API Gateway").title)
    }

    @Test
    fun aShareKeepsItsDestinationByItsIosName() {
        val share = share("note", "")
        val text = Json.encodeToString(PendingShare.serializer(), share)
        assertEquals(true, text.contains("\"destination\":\"agent\""))
        assertEquals(share, Json.decodeFromString(PendingShare.serializer(), text))
        assertEquals(ShareDestination.Notes, ShareDestination.of("notes"))
        assertEquals(null, ShareDestination.of("tab"))
        ShareDestination.entries.forEach {
            assertEquals(
                "\"${it.rawValue}\"",
                Json.encodeToString(ShareDestination.serializer(), it)
            )
        }
    }
}
