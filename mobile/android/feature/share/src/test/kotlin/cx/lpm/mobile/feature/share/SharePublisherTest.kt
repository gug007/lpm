package cx.lpm.mobile.feature.share

import android.Manifest
import android.app.Application
import android.app.NotificationManager
import android.content.Context
import androidx.test.core.app.ApplicationProvider
import cx.lpm.mobile.core.data.agents.AgentLaunchStore
import cx.lpm.mobile.core.data.mac.MacRecord
import cx.lpm.mobile.core.data.mac.MacVia
import cx.lpm.mobile.core.data.projects.ProjectsState
import cx.lpm.mobile.core.data.session.SessionState
import cx.lpm.mobile.core.data.session.SessionStore
import cx.lpm.mobile.core.data.share.ShareDelivery
import cx.lpm.mobile.core.data.share.ShareDirectoryStore
import cx.lpm.mobile.core.data.share.ShareInbox
import cx.lpm.mobile.core.data.share.ShareOutbox
import cx.lpm.mobile.core.model.AgentOption
import cx.lpm.mobile.core.model.PendingShare
import cx.lpm.mobile.core.model.Project
import cx.lpm.mobile.core.model.ShareAgent
import cx.lpm.mobile.core.model.ShareDestination
import cx.lpm.mobile.core.model.ShareMac
import cx.lpm.mobile.core.model.ShareProject
import cx.lpm.mobile.core.model.string
import cx.lpm.mobile.core.push.ShareNotices
import cx.lpm.mobile.core.testing.TestSession
import cx.lpm.mobile.core.testing.settle
import java.io.File
import java.nio.file.Files
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf

@OptIn(ExperimentalCoroutinesApi::class)
@RunWith(RobolectricTestRunner::class)
class SharePublisherTest {
    private val app: Application = ApplicationProvider.getApplicationContext()

    private fun project(name: String, remote: Boolean = false) = Project.parse(
        buildJsonObject {
            put("name", name)
            put("label", name.uppercase())
            put("isRemote", remote)
        }
    )

    private val record = MacRecord(
        localId = "L-1",
        serverId = "srv-1",
        name = "Studio Mac",
        hosts = listOf("192.168.1.20"),
        port = 8765
    )

    @Test
    fun theSheetListsTheLiveMacsLocalProjectsAndAgents() {
        val state = SessionState(macs = listOf(record), activeMacId = "L-1")
        val projects = ProjectsState(
            projects = listOf(project("storefront"), project("server", remote = true)),
            projectsLoaded = true
        )
        val options = listOf(AgentOption("claude", "Claude Code", emptyList()))
        assertEquals(
            ShareMac(
                localId = "L-1",
                serverId = "srv-1",
                name = "Studio Mac",
                hosts = listOf("192.168.1.20"),
                port = 8765,
                projects = listOf(ShareProject("storefront", "STOREFRONT")),
                agents = listOf(ShareAgent("claude", "Claude Code"))
            ),
            shareDirectoryMac(state, projects, options, canLaunchAgents = true)
        )
        assertEquals(
            emptyList<ShareAgent>(),
            shareDirectoryMac(state, projects, options, canLaunchAgents = false)?.agents
        )
        assertNull(shareDirectoryMac(state, projects.copy(projectsLoaded = false), options, true))
        assertNull(shareDirectoryMac(state.copy(demoMode = true), projects, options, true))
        val through = record.copy(via = MacVia("L-0", "mini"))
        assertNull(shareDirectoryMac(state.copy(macs = listOf(through)), projects, options, true))
    }

    private class Fixture(test: TestScope) {
        val t = TestSession(test, stores = setOf(SessionStore.Factory(::AgentLaunchStore)))
        private val dir: File = Files.createTempDirectory("lpm-share").toFile()
        private val io = UnconfinedTestDispatcher(test.testScheduler)
        val directories = ShareDirectoryStore(File(dir, "share-directory.json"), io)
        val inbox = ShareInbox(File(dir, "share-inbox"), io)
        val publisher = SharePublisher(
            t.session,
            directories,
            ShareOutbox(inbox, ShareDelivery(t.credentials, t.clients, t.prober, t.device)),
            ShareNotices(ApplicationProvider.getApplicationContext()),
            test.backgroundScope
        )
    }

    @Test
    fun theDirectoryFollowsTheLiveMacOnceItsListArrives() = runTest {
        val f = Fixture(this)
        f.t.savedMac()
        f.t.session.bootstrap()
        f.publisher.start()
        settle()
        val live = f.t.transport.last
        live.open()
        settle()
        live.receive("""{"t":"ready","serverId":"srv-1","features":["agentLaunch"]}""")
        settle()
        assertEquals(1, live.sentOf("agentOptions").size)
        live.receive(
            """{"t":"projects","projects":[{"name":"storefront","label":"Storefront"},""" +
                """{"name":"server","isRemote":true}]}"""
        )
        live.receive(
            """{"t":"agentOptions","agents":[{"id":"claude","label":"Claude Code","models":[]}]}"""
        )
        settle()

        val mac = f.directories.load().macs.single()
        assertEquals("srv-1", mac.serverId)
        assertEquals("Studio Mac", mac.name)
        assertEquals(listOf(ShareProject("storefront", "Storefront")), mac.projects)
        assertEquals(listOf(ShareAgent("claude", "Claude Code")), mac.agents)

        f.t.session.removeMac(f.t.session.state.value.macs.single().localId)
        settle()
        assertTrue(f.directories.load().macs.isEmpty())
    }

    @Test
    fun aShareKeptForLaterIsSentWhenTheAppComesBackAndToldAbout() = runTest {
        shadowOf(app).grantPermissions(Manifest.permission.POST_NOTIFICATIONS)
        val f = Fixture(this)
        val saved = f.t.savedMac(host = "192.168.1.20")
        f.t.session.bootstrap()
        settle()
        f.inbox.save(
            PendingShare(
                id = "S-1",
                serverId = "srv-1",
                macName = "Studio Mac",
                project = "storefront",
                projectTitle = "Storefront",
                destination = ShareDestination.Notes,
                agent = "",
                note = "Read later",
                text = "",
                createdAt = 0
            ),
            emptyList()
        )
        f.t.prober.reachable += saved.hosts
        val before = f.t.transport.sockets.size
        f.publisher.start()
        settle()

        val link = f.t.transport.sockets[before]
        link.open()
        settle()
        link.receive("""{"t":"ready","serverId":"srv-1"}""")
        settle()
        assertEquals("storefront", link.sentOf("notesChats").single().string("project"))
        link.receive(
            """{"t":"notesChats","project":"storefront","ok":true,"chats":[{"id":"c-1"}]}"""
        )
        settle()
        val note = link.sentOf("notesAddMessage").single()
        link.receive("""{"t":"notesAddMessage","ok":true,"reqId":"${note.string("reqId")}"}""")
        settle()

        assertTrue(f.inbox.all().isEmpty())
        val manager = app.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        val extras = manager.activeNotifications.single().notification.extras
        assertEquals("Sent to Storefront", extras.getCharSequence("android.title").toString())
        assertEquals(
            "What you shared reached Studio Mac.",
            extras.getCharSequence("android.text").toString()
        )
    }
}
