package cx.lpm.mobile.core.data.push

import cx.lpm.mobile.core.model.Project
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class DeliveredNotesTest {
    private fun note(
        id: Int,
        project: String? = "api",
        key: String? = "k1",
        status: String? = "Waiting",
        serverId: String? = "srv-1"
    ) = DeliveredNote("tag-$id", id, project, key, status, serverId)

    private fun project(name: String, vararg entries: Pair<String, String>): Project {
        val statuses = entries.joinToString(",") { (key, value) ->
            """{"key":"$key","value":"$value","priority":0,"timestamp":0}"""
        }
        return Project.parse(
            Json.parseToJsonElement(
                """{"name":"$name","statusEntries":[$statuses]}"""
            ) as JsonObject
        ).also { assertEquals(entries.size, it.statusEntries.size) }
    }

    @Test
    fun aWithdrawalTakesItsEntriesFromItsOwnMac() {
        val delivered = listOf(
            note(1),
            note(2, key = "k2"),
            note(3, serverId = "srv-2"),
            note(4, serverId = null),
            note(5, project = null)
        )
        val clear = PushClear("srv-1", setOf(StatusIdentity("api", "k1")))
        assertEquals(listOf(1, 4), DeliveredNotes.cleared(delivered, clear).map { it.id })
        // An older Mac names no server: any Mac's matching note goes.
        val legacy = PushClear(null, setOf(StatusIdentity("api", "k1")))
        assertEquals(listOf(1, 3, 4), DeliveredNotes.cleared(delivered, legacy).map { it.id })
    }

    @Test
    fun aNoteGoesOnceItsStatusIsGoneOrHasMovedOn() {
        val delivered = listOf(
            note(1, key = "k1", status = "Waiting"),
            note(2, key = "k2", status = "Waiting"),
            note(3, key = "k3", status = "Done"),
            note(4, key = "k4", status = null),
            note(5, project = "web", key = "k1"),
            note(6, key = ""),
            note(7, key = "gone", serverId = "srv-2")
        )
        val projects = listOf(
            project("api", "k1" to "Waiting", "k2" to "Running", "k4" to "Done")
        )
        assertEquals(
            listOf(2, 3),
            DeliveredNotes.stale(delivered, projects, activeServerId = "srv-1").map { it.id }
        )
    }

    @Test
    fun withNoKnownServerOnlyLegacyNotesAreJudged() {
        val delivered = listOf(note(1, key = "gone"), note(2, key = "gone", serverId = null))
        val stale = DeliveredNotes.stale(delivered, listOf(project("api")), activeServerId = null)
        assertEquals(listOf(2), stale.map { it.id })
    }

    @Test
    fun serverIdsMatchUnlessBothDiffer() {
        assertEquals(true, serverIdsMatch("a", "a"))
        assertEquals(true, serverIdsMatch(null, "a"))
        assertEquals(true, serverIdsMatch("a", ""))
        assertEquals(false, serverIdsMatch("a", "b"))
    }

    @Test
    fun aTapOpensTheTargetItNames() {
        fun target(vararg extras: Pair<String, String>) =
            NotificationOpenTarget.from(extras.toMap()::get)
        assertEquals(
            NotificationOpenTarget("srv-1", "api", NotificationOpenTarget.Kind.Terminal, "t-1"),
            target(
                "project" to "api",
                "target" to "terminal",
                "terminalId" to "t-1",
                "serverId" to "srv-1"
            )
        )
        assertEquals(
            NotificationOpenTarget(null, "api", NotificationOpenTarget.Kind.Automation, "job"),
            target("project" to "api", "target" to "automation", "automationId" to "job")
        )
        assertEquals(
            NotificationOpenTarget(null, "api", NotificationOpenTarget.Kind.Project, null),
            target("project" to "api", "target" to "terminal", "serverId" to "")
        )
        assertNull(target("target" to "terminal", "terminalId" to "t-1"))
    }

    @Test
    fun theAppIconsNewTabOpensItsProjectWithTheSheet() {
        val extras = mapOf("project" to "api", "target" to "newTab", "serverId" to "srv-1")
        assertEquals(
            NotificationOpenTarget("srv-1", "api", NotificationOpenTarget.Kind.NewTab, null),
            NotificationOpenTarget.from(extras::get)
        )
        assertNull(NotificationOpenTarget.from(mapOf("target" to "newTab")::get))
    }
}
