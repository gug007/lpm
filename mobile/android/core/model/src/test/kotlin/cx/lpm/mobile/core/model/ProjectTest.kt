package cx.lpm.mobile.core.model

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class ProjectTest {
    private fun obj(json: String): JsonObject = Json.parseToJsonElement(json).jsonObject

    private val storefront = obj(
        """
        {
          "name": "storefront", "label": "", "running": true, "isRemote": false,
          "parentName": "", "worktree": false, "autoPull": true,
          "claudeAccounts": ["work", "personal"],
          "workStatus": {"state": "custom", "label": " Review ", "emoji": "👀", "since": 1734567890123},
          "statusEntries": [{"key": "claude:1", "value": "Waiting", "priority": 2,
                             "timestamp": 1734567890000, "paneID": "storefront-1"}],
          "seenEntries": [{"key": "codex_2", "value": "Done", "priority": 20, "timestamp": 1734567800000,
                           "paneID": "storefront-2", "turnStart": 1734567700000,
                           "endedAt": 1734567800000, "seenAt": 1734567850000}],
          "services": [{"name": "web", "cmd": "npm run dev", "port": 3000}],
          "allServices": [{"name": "web", "port": 3000}, {"name": "worker"}],
          "profiles": [{"name": "default", "services": ["web", "api"]}],
          "activeProfile": "default",
          "actions": [
            {"name": "deploy", "label": "Deploy", "type": "", "confirm": true, "position": 2,
             "children": [{"name": "deploy:staging", "type": "terminal"},
                          {"name": "deploy:prod", "label": "", "inputs": [
                             {"key": "tag", "type": "radio", "default": "latest",
                              "options": [{"value": "latest"}, {"label": "Stable", "value": "v1"}]}]}]}
          ],
          "zones": [{"name": "ship", "rows": 9, "display": "footer", "layers": [{"name": "a"}, {"name": "b", "label": "Bee"}]},
                    {"name": "tools", "label": "Tools", "rows": 0, "position": 1.5, "source": "repo"}],
          "configError": ""
        }
        """
    )

    @Test
    fun parsesAProjectsEntry() {
        val p = Project.parse(storefront)
        assertEquals("storefront", p.name)
        assertEquals("storefront", p.label)
        assertTrue(p.running)
        assertFalse(p.isDuplicate)
        assertTrue(p.canHaveWorkStatus)
        assertEquals(true, p.autoPull)
        assertEquals(
            ClaudeOwnChoice(account = null, accounts = listOf("work", "personal")),
            p.claude
        )
        assertEquals(
            WorkStatus(WorkState.Custom, "Review", "👀", null, 1_734_567_890_123),
            p.workStatus
        )
        assertEquals(
            StatusEntry("claude:1", "Waiting", 2, 1_734_567_890_000, "storefront-1", 0, 0),
            p.statusEntries[0]
        )
        assertEquals(
            StatusEntry(
                "codex_2",
                "Done",
                20,
                1_734_567_800_000,
                "storefront-2",
                1_734_567_700_000,
                1_734_567_800_000,
                1_734_567_850_000
            ),
            p.seenEntries.single()
        )
        assertEquals(listOf(Service("web", 3000)), p.services)
        assertEquals(Service("worker", 0), p.allServices[1])
        assertEquals(Profile("default", listOf("web", "api")), p.profiles[0])
        assertEquals("default", p.activeProfile)
        assertNull(p.configError)
    }

    @Test
    fun parsesNestedActions() {
        val deploy = Project.parse(storefront).actions.single()
        assertEquals("Deploy", deploy.label)
        assertEquals(2.0, deploy.position!!, 0.0)
        assertTrue(deploy.confirm)
        assertFalse(deploy.isRunnable)
        assertEquals(listOf("deploy:staging", "deploy:prod"), deploy.runnableLeaves.map { it.name })
        val (staging, prod) = deploy.children
        assertFalse(staging.runsInBackground)
        assertTrue(prod.runsInBackground)
        assertEquals("deploy:prod", prod.label)
        val tag = prod.inputs.single()
        assertEquals("tag", tag.label)
        assertEquals("latest", tag.defaultValue)
        assertTrue(tag.isSelect)
        assertFalse(tag.isSecret)
        assertEquals(listOf("latest", "Stable"), tag.options.map { it.label })
    }

    @Test
    fun parsesZonesWithClampedRowsAndDefaults() {
        val (ship, tools) = Project.parse(storefront).zones
        assertEquals("ship", ship.label)
        assertEquals(3, ship.rows)
        assertTrue(ship.isFooter)
        assertEquals("project", ship.source)
        assertEquals("b", ship.layer(named = "b"))
        assertEquals("a", ship.layer(named = "nope"))
        assertEquals("Layer 1", ship.layers[0].title(0))
        assertEquals("Bee", ship.layers[1].title(1))
        assertEquals(1, tools.rows)
        assertFalse(tools.isFooter)
        assertEquals(1.5, tools.position!!, 0.0)
        assertEquals("repo", tools.source)
        assertNull(tools.layer(named = "a"))
    }

    @Test
    fun emptyObjectGetsSwiftDefaults() {
        val p = Project.parse(obj("{}"))
        assertEquals("", p.name)
        assertNull(p.workStatus)
        assertNull(p.autoPull)
        assertTrue(p.claude.followsParent)
        assertTrue(p.actions.isEmpty())
        assertTrue(p.seenEntries.isEmpty())
        assertNull(p.configError)
    }

    @Test
    fun copiesKeepEverythingElse() {
        val p = Project.parse(storefront)
        val entry = StatusEntry("k", "Done", 0, 1, "", 0, 0)
        val seen = entry.copy(key = "s", seenAt = 2)
        assertEquals(
            p.copy(statusEntries = listOf(entry), seenEntries = listOf(seen)),
            p.withStatus(listOf(entry), listOf(seen))
        )
        assertNull(p.withWorkStatus(null).workStatus)
        assertNull(p.withAutoPull(null).autoPull)
        assertEquals("x", p.withClaude(ClaudeOwnChoice(account = "x")).claude.account)
        assertEquals(p.actions, p.withAutoPull(false).actions)
    }

    @Test
    fun sidebarFolderDefaultsItsName() {
        assertEquals(
            ProjectFolder("", "Folder", false, emptyList()),
            ProjectFolder.parse(obj("{}"))
        )
    }

    @Test
    fun terminalLabelFallsBackToItsId() {
        val t = TerminalInfo.parse(
            obj("""{"id": "storefront-2", "label": "", "project": "storefront"}""")
        )
        assertEquals("storefront-2", t.label)
        assertEquals(80, t.cols)
        assertEquals(24, t.rows)
    }

    @Test
    fun controlOwnerIsNullUnlessAnObject() {
        assertNull(ControlOwner.parse(obj("""{"owner": null}""")["owner"]))
        assertEquals(
            ControlOwner("window", "main", "Main window"),
            ControlOwner.parse(
                obj(
                    """{"owner": {"kind": "window", "id": "main", "label": "Main window"}}"""
                )["owner"]
            )
        )
    }
}
