package cx.lpm.mobile.core.data.share

import cx.lpm.mobile.core.data.mac.ThisDevice
import cx.lpm.mobile.core.data.testing.FakeSocket
import cx.lpm.mobile.core.data.testing.SessionHarness
import cx.lpm.mobile.core.model.PendingShare
import cx.lpm.mobile.core.model.ShareDestination
import cx.lpm.mobile.core.model.ShareMac
import cx.lpm.mobile.core.model.objects
import cx.lpm.mobile.core.model.string
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.async
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class ShareDeliveryTest {
    private fun TestScope.settle(millis: Long = 0) {
        testScheduler.advanceTimeBy(millis)
        testScheduler.runCurrent()
    }

    private fun share(destination: ShareDestination, note: String = "Fix this") = PendingShare(
        id = "S-1",
        serverId = "srv-2",
        macName = "Office Mac",
        project = "storefront",
        projectTitle = "Storefront",
        destination = destination,
        agent = if (destination == ShareDestination.Agent) "claude" else "",
        note = note,
        text = "https://example.com/page",
        createdAt = 0
    )

    private val mac = ShareMac(
        localId = "L-2",
        serverId = "srv-2",
        name = "Office Mac",
        hosts = listOf("10.0.0.5"),
        port = 8765
    )

    private class Fixture(test: TestScope) {
        val h = SessionHarness(test)
        val delivery = ShareDelivery(h.credentials, h.clients, h.prober, ThisDevice("Test Phone"))
    }

    private fun TestScope.fixture(reachable: Boolean = true, paired: Boolean = true): Fixture {
        val f = Fixture(this)
        if (paired) f.h.credentials.save("dev-2", "tok-2", mac.localId)
        if (reachable) f.h.prober.reachable += "10.0.0.5"
        return f
    }

    /** The share's own link, signed in. */
    private fun TestScope.signIn(f: Fixture): FakeSocket {
        settle()
        val link = f.h.transport.last
        link.open()
        settle()
        assertEquals("tok-2", link.sentOf("auth").single().string("token"))
        link.receive("""{"t":"ready","serverId":"srv-2","features":["agentLaunch"]}""")
        settle()
        return link
    }

    @Test
    fun anAgentGetsEachImageUploadedThenANewTabWithTheirPaths() = runTest {
        val f = fixture()
        val outcome = async {
            f.delivery.send(
                share(ShareDestination.Agent),
                listOf(byteArrayOf(1, 2, 3), byteArrayOf(4)),
                mac
            )
        }
        val link = signIn(f)

        val first = link.sentOf("upload").single()
        assertEquals("share", first.string("id"))
        assertEquals("image/jpeg", first.string("mime"))
        assertEquals("shared-1.jpg", first.string("name"))
        assertEquals("AQID", first.string("data"))
        link.receive(
            """{"t":"upload","id":"share","ok":true,"path":"/tmp/x.jpg","reqId":"other"}"""
        )
        settle()
        assertEquals(1, link.sentOf("upload").size)
        link.receive(
            """{"t":"upload","id":"share","ok":true,"path":"/tmp/a.jpg",""" +
                """"reqId":"${first.string("reqId")}"}"""
        )
        settle()
        val second = link.sentOf("upload")[1]
        assertEquals("shared-2.jpg", second.string("name"))
        link.receive(
            """{"t":"upload","id":"share","ok":true,"path":"/tmp/b.jpg",""" +
                """"reqId":"${second.string("reqId")}"}"""
        )
        settle()

        val tab = link.sentOf("newTerminal").single()
        assertEquals("storefront", tab.string("project"))
        assertEquals("claude", tab.string("agent"))
        assertEquals(
            "Fix this\n\nhttps://example.com/page\n\n/tmp/a.jpg /tmp/b.jpg",
            tab.string("prompt")
        )
        link.receive("""{"t":"newTerminal","ok":true}""")
        settle()
        assertEquals(ShareDelivery.Outcome.Sent, outcome.await())
        assertEquals(listOf("auth", "upload", "upload", "newTerminal"), link.sentTypes)
        assertTrue(link.closed)
    }

    @Test
    fun aNoteGoesToTheMostRecentChatWithTheImagesAttached() = runTest {
        val f = fixture()
        val outcome = async {
            f.delivery.send(share(ShareDestination.Notes), listOf(byteArrayOf(1, 2, 3)), mac)
        }
        val link = signIn(f)
        assertEquals("storefront", link.sentOf("notesChats").single().string("project"))
        link.receive("""{"t":"notesChats","project":"api","ok":true,"chats":[{"id":"c-9"}]}""")
        link.receive(
            """{"t":"notesChats","project":"storefront","ok":true,""" +
                """"chats":[{"id":"c-1","title":"Ideas"},{"id":"c-2","title":"Old"}]}"""
        )
        settle()

        val note = link.sentOf("notesAddMessage").single()
        assertEquals("c-1", note.string("chatId"))
        assertEquals("Fix this\n\nhttps://example.com/page", note.string("text"))
        val attachment = note.objects("attachments")!!.single()
        assertEquals("shared-1.jpg", attachment.string("name"))
        assertEquals("image/jpeg", attachment.string("mimeType"))
        assertEquals("AQID", attachment.string("data"))
        link.receive(
            """{"t":"notesAddMessage","project":"storefront","chatId":"c-1","ok":false,""" +
                """"reqId":"other"}"""
        )
        settle()
        assertTrue(!outcome.isCompleted)
        link.receive(
            """{"t":"notesAddMessage","project":"storefront","chatId":"c-1","ok":true,""" +
                """"reqId":"${note.string("reqId")}"}"""
        )
        settle()
        assertEquals(ShareDelivery.Outcome.Sent, outcome.await())
        assertTrue(link.sentOf("upload").isEmpty())
    }

    @Test
    fun theMacsRefusalIsShownInItsWordsOrTheFallback() = runTest {
        val f = fixture()
        val image = async {
            f.delivery.send(share(ShareDestination.Agent), listOf(byteArrayOf(1)), mac)
        }
        var link = signIn(f)
        val upload = link.sentOf("upload").single()
        link.receive("""{"t":"upload","ok":false,"reqId":"${upload.string("reqId")}"}""")
        settle()
        assertEquals(ShareDelivery.Outcome.Failed("Couldn't send the image."), image.await())
        assertTrue(link.sentOf("newTerminal").isEmpty())

        val tab = async { f.delivery.send(share(ShareDestination.Agent), emptyList(), mac) }
        link = signIn(f)
        link.receive(
            """{"t":"newTerminal","ok":false,"project":"storefront",""" +
                """"error":"Open the lpm window on your Mac first."}"""
        )
        settle()
        assertEquals(
            ShareDelivery.Outcome.Failed("Open the lpm window on your Mac first."),
            tab.await()
        )

        val bare = async { f.delivery.send(share(ShareDestination.Agent), emptyList(), mac) }
        link = signIn(f)
        link.receive("""{"t":"newTerminal","ok":false}""")
        settle()
        assertEquals(ShareDelivery.Outcome.Failed("Couldn't open a new tab."), bare.await())

        val notes = async { f.delivery.send(share(ShareDestination.Notes), emptyList(), mac) }
        link = signIn(f)
        link.receive("""{"t":"notesChats","project":"storefront","ok":true,"chats":[]}""")
        settle()
        assertEquals(
            ShareDelivery.Outcome.Failed("Couldn't open the project's notes."),
            notes.await()
        )

        val note = async { f.delivery.send(share(ShareDestination.Notes), emptyList(), mac) }
        link = signIn(f)
        link.receive(
            """{"t":"notesChats","project":"storefront","ok":true,"chats":[{"id":"c-1"}]}"""
        )
        settle()
        val sent = link.sentOf("notesAddMessage").single()
        link.receive("""{"t":"notesAddMessage","ok":false,"reqId":"${sent.string("reqId")}"}""")
        settle()
        assertEquals(ShareDelivery.Outcome.Failed("Couldn't add the note."), note.await())
    }

    @Test
    fun noAnswerOrADroppedLinkKeepsTheShare() = runTest {
        val f = fixture(reachable = false)
        assertEquals(
            ShareDelivery.Outcome.Unreachable,
            f.delivery.send(share(ShareDestination.Agent), emptyList(), mac)
        )
        assertTrue(f.h.transport.sockets.isEmpty())

        f.h.prober.reachable += "10.0.0.5"
        val dropped = async { f.delivery.send(share(ShareDestination.Notes), emptyList(), mac) }
        val link = signIn(f)
        link.fail()
        settle()
        assertEquals(ShareDelivery.Outcome.Unreachable, dropped.await())
        assertTrue(link.closed)

        val quiet = async { f.delivery.send(share(ShareDestination.Notes), emptyList(), mac) }
        val quietLink = signIn(f)
        settle(20_001)
        // Heartbeats answered: the link is up, the Mac just never replies.
        quietLink.answerPings()
        settle(9_997)
        assertTrue(!quiet.isCompleted)
        settle(3)
        assertEquals(ShareDelivery.Outcome.Unreachable, quiet.await())
    }

    @Test
    fun aMacThatTurnsThePhoneAwayOrIsntPairedAsksToPairAgain() = runTest {
        val f = fixture()
        val refused = async { f.delivery.send(share(ShareDestination.Agent), emptyList(), mac) }
        settle()
        val link = f.h.transport.last
        link.open()
        settle()
        link.receive("""{"t":"error","error":"unauthorized"}""")
        settle()
        assertEquals(
            ShareDelivery.Outcome.Failed(
                "Office Mac turned this phone away. Pair lpm Link with it again to share to it."
            ),
            refused.await()
        )

        val unpaired = fixture(paired = false)
        assertEquals(
            ShareDelivery.Outcome.Failed("Pair lpm Link with Office Mac again to share to it."),
            unpaired.delivery.send(share(ShareDestination.Agent), emptyList(), mac)
        )
    }

    @Test
    fun aMacThatNeverSignsInIsUnreachable() = runTest {
        val f = fixture()
        val outcome = async { f.delivery.send(share(ShareDestination.Agent), emptyList(), mac) }
        settle()
        f.h.transport.last.open()
        settle(6_001)
        assertEquals(ShareDelivery.Outcome.Unreachable, outcome.await())
        assertTrue(f.h.transport.last.closed)
    }
}
