package cx.lpm.mobile.core.protocol

import cx.lpm.mobile.core.model.CommandScope
import cx.lpm.mobile.core.model.ExpandedCommand
import cx.lpm.mobile.core.model.LpmCommand
import cx.lpm.mobile.core.model.LpmCommandList
import cx.lpm.mobile.core.model.LpmCommandLists
import cx.lpm.mobile.core.model.SlashCommand
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class InboundCommandsTest {
    @Test
    fun listsDecodeBothScopes() {
        val reply = decode<LpmCommandsInbound.Reply>(
            """{ "t": "lpmCommands", "project": "api", "ok": true, "reqId": 7, "lists": {
                 "global": { "folders": ["Git"], "commands": [{ "name": "commit-parts", "folder": "Git",
                   "description": "Small commits", "body": "Split it", "scope": "global", "argumentHint": "" }] },
                 "project": { "folders": [], "commands": [{ "name": "fix-ticket", "folder": null,
                   "description": "", "body": "Fix {{ticket}}", "scope": "project", "argumentHint": "<ticket>" }] },
                 "projectError": null } }"""
        )
        assertEquals("7", reply.reqId)
        assertNull(reply.error)
        assertEquals(
            LpmCommandLists(
                global = LpmCommandList(
                    listOf("Git"),
                    listOf(
                        LpmCommand(
                            "commit-parts",
                            "Git",
                            "Small commits",
                            "Split it",
                            CommandScope.Global,
                            ""
                        )
                    )
                ),
                project = LpmCommandList(
                    emptyList(),
                    listOf(
                        LpmCommand(
                            "fix-ticket",
                            null,
                            "",
                            "Fix {{ticket}}",
                            CommandScope.Project,
                            "<ticket>"
                        )
                    )
                )
            ),
            reply.lists
        )
    }

    @Test
    fun outsideAProjectTheProjectListIsNull() {
        val reply = decode<LpmCommandsInbound.Reply>(
            """{ "t": "lpmCommandFolder", "project": "ssh-box", "ok": true, "reqId": "f1", "lists": {
                 "global": { "folders": [], "commands": [] }, "project": null,
                 "projectError": "The host didn't answer." } }"""
        )
        assertEquals("f1", reply.reqId)
        assertNull(reply.lists?.project)
        assertEquals("The host didn't answer.", reply.lists?.projectError)
    }

    @Test
    fun failuresCarryTheMacsSentence() {
        val save = decode<LpmCommandsInbound.Reply>(
            """{ "t": "lpmCommandSave", "project": "api", "ok": false, "reqId": "s1",
                 "error": "/ship already exists in No folder." }"""
        )
        assertNull(save.lists)
        assertEquals("/ship already exists in No folder.", save.error)
        assertEquals(
            "Couldn't delete the command.",
            decode<LpmCommandsInbound.Reply>("""{ "t": "lpmCommandDelete", "ok": false }""").error
        )
    }

    @Test
    fun expandAndChanged() {
        assertEquals(
            LpmCommandsInbound.Reply(
                "e1",
                expanded = ExpandedCommand("Fix {{ticket}} on main", listOf("ticket"))
            ),
            Inbound.parse(
                """{ "t": "lpmCommandExpand", "project": "api", "ok": true, "reqId": "e1",
                     "text": "Fix {{ticket}} on main", "missing": ["ticket"] }"""
            )
        )
        assertEquals(
            LpmCommandsInbound.Reply("e2", error = "/nope isn't one of your commands."),
            Inbound.parse(
                """{ "t": "lpmCommandExpand", "project": "api", "ok": false, "reqId": "e2",
                     "error": "/nope isn't one of your commands." }"""
            )
        )
        assertEquals(
            LpmCommandsInbound.Changed(""),
            Inbound.parse("""{ "t": "lpmCommandsChanged", "project": "" }""")
        )
    }

    @Test
    fun slashRowsCarryTheirFolderAndList() {
        val slash = decode<Inbound.Slash>(
            """{ "t": "slash", "id": "t-1", "commands": [
                 { "name": "fix-ticket", "description": "Fix", "argumentHint": "<ticket>", "source": "lpm",
                   "folder": "Bugs", "scope": "project" },
                 { "name": "explain", "description": "", "argumentHint": "", "source": "lpm",
                   "folder": null, "scope": "global" },
                 { "name": "review", "description": "", "argumentHint": "", "source": "builtin" }] }"""
        )
        assertEquals(
            listOf(
                SlashCommand("fix-ticket", "Fix", "<ticket>", "lpm", "Bugs", CommandScope.Project),
                SlashCommand("explain", "", "", "lpm", null, CommandScope.Global),
                SlashCommand("review", "", "", "builtin")
            ),
            slash.commands
        )
    }
}
