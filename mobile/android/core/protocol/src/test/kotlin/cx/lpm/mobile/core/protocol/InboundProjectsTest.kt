package cx.lpm.mobile.core.protocol

import cx.lpm.mobile.core.model.AutoPullMode
import cx.lpm.mobile.core.model.CustomWorkStatus
import cx.lpm.mobile.core.model.DirListing
import cx.lpm.mobile.core.model.ProjectFolder
import cx.lpm.mobile.core.model.SshHostInfo
import cx.lpm.mobile.core.model.defaultWorkStatusPalette
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertSame
import org.junit.Assert.assertTrue
import org.junit.Test

class InboundProjectsTest {
    @Test
    fun projects() {
        val f = decode<Inbound.Projects>(
            """{ "t": "projects", "autoPullMode": "chosen", "workStatusOrder": ["done", "custom:Ship"],
                 "workStatuses": [{ "label": "Ship", "emoji": "🚢" }, { "label": " " }],
                 "projects": [{ "name": "storefront", "label": "Storefront", "running": true },
                              { "name": "storefront-2", "parentName": "storefront", "worktree": true }] }"""
        )
        assertEquals(listOf("Storefront", "storefront-2"), f.projects.map { it.label })
        assertTrue(f.projects[1].isDuplicate)
        assertEquals(listOf(CustomWorkStatus("Ship", "🚢")), f.workStatuses)
        assertEquals(listOf("done", "custom:Ship"), f.workStatusOrder)
        assertEquals(AutoPullMode.Chosen, f.autoPullMode)
        assertEquals(3, f.seenAgentsShown)
        assertFalse(f.keepFinishedAgents)
    }

    @Test
    fun keepFinishedAgentsComesWithTheProjects() {
        val f = decode<Inbound.Projects>("""{ "t": "projects", "keepFinishedAgents": true }""")
        assertTrue(f.keepFinishedAgents)
    }

    @Test
    fun seenAgentsShownStaysWithinTheMacsRange() {
        fun shown(value: Int) = decode<Inbound.Projects>(
            """{ "t": "projects", "seenAgentsShown": $value }"""
        ).seenAgentsShown
        assertEquals(5, shown(5))
        assertEquals(1, shown(0))
        assertEquals(10, shown(40))
    }

    @Test
    fun projectsFromAnOlderMacGetTheShippedPalette() {
        val f = decode<Inbound.Projects>("""{ "t": "projects", "projects": [] }""")
        assertEquals(defaultWorkStatusPalette, f.workStatuses)
        assertEquals(AutoPullMode.Off, f.autoPullMode)
        assertTrue(f.workStatusOrder.isEmpty())
        val malformed =
            decode<Inbound.Projects>(
                """{ "t": "projects", "workStatuses": [{ "label": "A" }, 3] }"""
            )
        assertEquals(defaultWorkStatusPalette, malformed.workStatuses)
        val empty = decode<Inbound.Projects>("""{ "t": "projects", "workStatuses": [] }""")
        assertTrue(empty.workStatuses.isEmpty())
    }

    @Test
    fun sidebar() {
        val f = decode<Inbound.Sidebar>(
            """{ "t": "sidebar", "order": ["storefront", "g-1"],
                 "groups": [{ "id": "g-1", "name": "Client Work", "collapsed": true, "members": ["blog"] }] }"""
        )
        assertEquals(listOf("storefront", "g-1"), f.order)
        assertEquals(ProjectFolder("g-1", "Client Work", true, listOf("blog")), f.groups.single())
    }

    @Test
    fun pushesWithoutPayload() {
        assertSame(Inbound.ProjectsChanged, Inbound.parse("""{ "t": "projects-changed" }"""))
        assertEquals(
            Inbound.StatusChanged("api"),
            Inbound.parse("""{ "t": "status-changed", "project": "api" }""")
        )
    }

    @Test
    fun status() {
        val f = decode<Inbound.Status>(
            """{ "t": "status", "project": "storefront", "status": [{ "key": "claude", "value": "Running",
                 "priority": 1, "timestamp": 1760000000000, "paneID": "storefront-1", "turnStart": 1759999990000 }] }"""
        )
        assertEquals("Running", f.entries.single().value)
        assertEquals(1_759_999_990_000L, f.entries.single().turnStart)
        assertEquals(0L, f.entries.single().endedAt)
        assertTrue(f.seen.isEmpty())
    }

    @Test
    fun statusWithSeenAgents() {
        val f = decode<Inbound.Status>(
            """{ "t": "status", "project": "storefront", "status": [],
                 "seen": [{ "key": "codex_1", "value": "Done", "priority": 20, "timestamp": 1760000000000,
                            "paneID": "storefront-1", "endedAt": 1760000000000, "seenAt": 1760000060000 }] }"""
        )
        assertTrue(f.entries.isEmpty())
        assertEquals(1_760_000_060_000L, f.seen.single().seenAt)
    }

    @Test
    fun duplicateFlow() {
        assertEquals(
            Inbound.DuplicateProgress(1, 3, "storefront-2"),
            Inbound.parse(
                """{ "t": "duplicateProgress", "done": 1, "total": 3, "name": "storefront-2" }"""
            )
        )
        assertEquals(
            Inbound.Duplicate("storefront-2", null, "Open lpm to run the task"),
            Inbound.parse(
                """{ "t": "duplicate", "ok": true, "name": "storefront-2", "names": ["storefront-2"],
                     "warning": "Open lpm to run the task" }"""
            )
        )
        assertEquals(
            Inbound.Duplicate("", "Couldn't duplicate the project.", null),
            Inbound.parse("""{ "t": "duplicate", "ok": false }""")
        )
    }

    @Test
    fun duplicateDefaultsPullLatestUnlessSaid() {
        assertEquals(
            Inbound.DuplicateDefaults(
                excludeUncommitted = false,
                reinstallDeps = false,
                pullLatest = true
            ),
            Inbound.parse("""{ "t": "duplicateDefaults" }""")
        )
        assertEquals(
            Inbound.DuplicateDefaults(
                excludeUncommitted = true,
                reinstallDeps = true,
                pullLatest = false
            ),
            Inbound.parse(
                """{ "t": "duplicateDefaults", "excludeUncommitted": true, "reinstallDeps": true, "pullLatest": false }"""
            )
        )
    }

    @Test
    fun projectMutationReplies() {
        assertEquals(Inbound.Remove(null), Inbound.parse("""{ "t": "remove", "ok": true }"""))
        assertEquals(
            Inbound.Remove("Couldn't remove the project."),
            Inbound.parse("""{ "t": "remove" }""")
        )
        assertEquals(
            Inbound.RenameProject("api", null),
            Inbound.parse("""{ "t": "renameProject", "project": "api", "ok": true }""")
        )
        assertEquals(
            Inbound.RenameProject("api", "Couldn't rename the project."),
            Inbound.parse("""{ "t": "renameProject", "project": "api" }""")
        )
        assertEquals(
            Inbound.SetWorkStatus("api", "Couldn't set the status."),
            Inbound.parse("""{ "t": "setWorkStatus", "project": "api", "ok": false }""")
        )
        assertEquals(
            Inbound.SetAutoPull("api", null),
            Inbound.parse("""{ "t": "setAutoPull", "project": "api", "ok": true }""")
        )
        assertEquals(
            Inbound.SetAutoPull("api", "Couldn't change auto pull."),
            Inbound.parse("""{ "t": "setAutoPull", "project": "api" }""")
        )
        assertEquals(
            Inbound.SetClaudeAccount("api", "Couldn't change the Claude account."),
            Inbound.parse("""{ "t": "setClaudeAccount", "project": "api", "ok": false }""")
        )
        assertEquals(
            Inbound.SetClaudeAccount("api", "Not signed in"),
            Inbound.parse(
                """{ "t": "setClaudeAccount", "project": "api", "ok": false, "error": "Not signed in" }"""
            )
        )
    }

    @Test
    fun claudeAccounts() {
        val ok = decode<Inbound.ClaudeAccounts>(
            """{ "t": "claudeAccounts", "ok": true, "accounts": [{ "id": "default", "signedIn": true }],
                 "switching": { "enabled": false, "active": false, "paused": null, "allowed": [], "maxMembers": 3 } }"""
        )
        assertEquals("Main login", ok.accounts!!.accounts.single().label)
        assertNull(ok.accounts.switching.paused)
        assertNull(
            decode<Inbound.ClaudeAccounts>("""{ "t": "claudeAccounts", "accounts": [] }""").accounts
        )
    }

    @Test
    fun everySidebarMutationReadsTheSameWay() {
        for (t in listOf(
            "sidebarCreateFolder",
            "sidebarRenameFolder",
            "sidebarDeleteFolder",
            "sidebarMoveProject"
        )) {
            val ok = decode<Inbound.SidebarMutation>(
                """{ "t": "$t", "ok": true, "order": ["g-1"], "groups": [{ "id": "g-1", "name": "Client Work" }] }"""
            )
            assertEquals(listOf("g-1"), ok.order)
            assertNull(ok.error)
            val failed = decode<Inbound.SidebarMutation>("""{ "t": "$t", "ok": false }""")
            assertEquals("Couldn't update folders.", failed.error)
        }
    }

    @Test
    fun listDirs() {
        assertEquals(
            Inbound.ListDirs(DirListing("/Users/me", "/Users", listOf("code", "notes")), null),
            Inbound.parse(
                """{ "t": "listDirs", "ok": true, "path": "/Users/me", "parent": "/Users", "dirs": ["code", "notes"] }"""
            )
        )
        assertNull(
            decode<Inbound.ListDirs>(
                """{ "t": "listDirs", "ok": true, "path": "/", "parent": null }"""
            ).listing!!.parent
        )
        assertEquals(
            Inbound.ListDirs(null, "No such folder"),
            Inbound.parse("""{ "t": "listDirs", "ok": false, "error": "No such folder" }""")
        )
    }

    @Test
    fun listSshHosts() {
        val ok = decode<Inbound.ListSshHosts>(
            """{ "t": "listSshHosts", "ok": true, "hosts": [{ "name": "box", "hostName": "10.0.0.4", "user": "me", "port": 22 }] }"""
        )
        assertEquals(SshHostInfo("box", "10.0.0.4", "me", 22, ""), ok.hosts.single())
        val failed =
            decode<Inbound.ListSshHosts>(
                """{ "t": "listSshHosts", "hosts": [{ "name": "box" }] }"""
            )
        assertTrue(failed.hosts.isEmpty())
        assertEquals("Couldn't list SSH hosts.", failed.error)
    }

    @Test
    fun newProjectReplies() {
        assertEquals(
            Inbound.CreateProject("blog", null),
            Inbound.parse(
                """{ "t": "createProject", "ok": true, "name": "blog", "existing": false, "services": ["web"] }"""
            )
        )
        assertEquals(
            Inbound.CreateSshProject("", "Couldn't create the project."),
            Inbound.parse("""{ "t": "createSshProject", "ok": false }""")
        )
        assertEquals(
            Inbound.CloneProject("site", "Couldn't clone the repository."),
            Inbound.parse("""{ "t": "cloneProject", "name": "site" }""")
        )
        assertFalse(
            decode<Inbound.CloneProject>(
                """{ "t": "cloneProject", "ok": true, "name": "site" }"""
            ).error !=
                null
        )
    }
}
