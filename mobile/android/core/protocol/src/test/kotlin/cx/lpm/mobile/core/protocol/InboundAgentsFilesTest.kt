package cx.lpm.mobile.core.protocol

import cx.lpm.mobile.core.model.AgentEffortOption
import cx.lpm.mobile.core.model.AgentSession
import cx.lpm.mobile.core.model.LocatedKind
import cx.lpm.mobile.core.model.ProjectFileEntry
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class InboundAgentsFilesTest {
    @Test
    fun agentOptions() {
        val f = decode<Inbound.AgentOptions>(
            """{ "t": "agentOptions", "agents": [
                 { "id": "claude", "label": "Claude Code", "models": [
                   { "value": "", "label": "Default", "efforts": [
                     { "value": "", "label": "Default" }, { "value": "high", "label": "High" }] },
                   { "value": "opus", "label": "Opus", "efforts": [] }] },
                 { "id": "gemini", "label": "Gemini", "models": [] },
                 { "id": "opencode" }] }"""
        )
        val (claude, gemini, opencode) = f.agents
        assertEquals("Claude Code", claude.label)
        assertEquals(listOf("", "opus"), claude.models.map { it.value })
        assertEquals(AgentEffortOption("high", "High"), claude.models[0].efforts[1])
        assertTrue(gemini.models.isEmpty())
        assertEquals("opencode", opencode.label)
        assertEquals(
            emptyList<Any>(),
            decode<Inbound.AgentOptions>("""{ "t": "agentOptions", "agents": [] }""").agents
        )
    }

    @Test
    fun agentSessions() {
        val f = decode<Inbound.AgentSessions>(
            """{ "t": "agentSessions", "project": "storefront", "search": "", "limit": 40, "ok": true, "hasMore": true,
                 "sessions": [
                   { "key": "claude:4f1c", "provider": "claude", "sessionId": "4f1c",
                     "title": "Fix checkout tax rounding", "preview": "totals are off by a cent when…",
                     "updatedAt": 1792312712000, "gitBranch": "fix/tax", "account": "Work", "openIn": "t-123" },
                   { "provider": "codex", "sessionId": "9a", "title": "Migrate cart store", "preview": "",
                     "updatedAt": 0, "gitBranch": null, "openIn": "" }] }"""
        )
        val page = f.page
        assertEquals("storefront", page.project)
        assertEquals("", page.search)
        assertTrue(page.hasMore)
        assertNull(page.error)
        assertEquals(
            AgentSession(
                key = "claude:4f1c",
                provider = "claude",
                sessionId = "4f1c",
                title = "Fix checkout tax rounding",
                preview = "totals are off by a cent when…",
                updatedAt = 1_792_312_712_000,
                gitBranch = "fix/tax",
                account = "Work",
                openIn = "t-123"
            ),
            page.sessions?.first()
        )
        val codex = page.sessions!![1]
        assertEquals("codex:9a", codex.key)
        assertNull(codex.gitBranch)
        assertNull(codex.account)
        assertNull(codex.openIn)
    }

    @Test
    fun agentSessionsFailure() {
        val page = decode<Inbound.AgentSessions>(
            """{ "t": "agentSessions", "project": "remote-box", "ok": false, "error": "SSH projects have no sessions here." }"""
        ).page
        assertNull(page.sessions)
        assertEquals("SSH projects have no sessions here.", page.error)
        assertNull(page.search)
        assertEquals(
            "Couldn't load past sessions.",
            decode<Inbound.AgentSessions>("""{ "t": "agentSessions", "ok": false }""").page.error
        )
    }

    @Test
    fun resumeSessionFailureStopsThePlaceholder() {
        assertNull(Inbound.parse("""{ "t": "resumeSession", "ok": true }"""))
        assertEquals(
            Inbound.ActionFailed("storefront", "Open the lpm app on your Mac to resume a session."),
            Inbound.parse(
                """{ "t": "resumeSession", "ok": false, "project": "storefront", "error": "Open the lpm app on your Mac to resume a session." }"""
            )
        )
    }

    @Test
    fun listDir() {
        val contents = decode<Inbound.ListDir>(
            """{ "t": "listDir", "project": "storefront", "dir": "src/app", "ok": true, "root": "/Users/me/dev/storefront",
                 "entries": [
                   { "name": "checkout", "dir": true, "ignored": false, "changed": 2 },
                   { "name": "page.tsx", "dir": false, "ignored": false, "status": "modified" },
                   { "name": ".next", "dir": true, "ignored": true }] }"""
        ).contents
        assertEquals("src/app", contents.dir)
        assertEquals("/Users/me/dev/storefront", contents.root)
        assertEquals(
            listOf(
                ProjectFileEntry(
                    "checkout",
                    dir = true,
                    ignored = false,
                    status = null,
                    changed = 2
                ),
                ProjectFileEntry(
                    "page.tsx",
                    dir = false,
                    ignored = false,
                    status = "modified",
                    changed = 0
                ),
                ProjectFileEntry(".next", dir = true, ignored = true, status = null, changed = 0)
            ),
            contents.entries
        )
        assertNull(contents.error)
    }

    @Test
    fun listDirFailure() {
        val contents = decode<Inbound.ListDir>(
            """{ "t": "listDir", "project": "storefront", "dir": "gone", "ok": false, "error": "No such folder" }"""
        ).contents
        assertNull(contents.entries)
        assertEquals("No such folder", contents.error)
        assertNull(contents.root)
    }

    @Test
    fun locatePath() {
        val inside = decode<Inbound.LocatePath>(
            """{ "t": "locatePath", "project": "storefront", "path": "./src", "ok": true,
                 "kind": "dir", "at": "/Users/me/dev/storefront/src", "rel": "src" }"""
        ).located
        assertEquals(LocatedKind.DIR, inside.kind)
        assertEquals("./src", inside.typed)
        assertEquals("src", inside.rel)

        val outside = decode<Inbound.LocatePath>(
            """{ "t": "locatePath", "project": "storefront", "path": "/etc/hosts", "ok": true,
                 "kind": "file", "at": "/etc/hosts", "rel": null }"""
        ).located
        assertEquals(LocatedKind.FILE, outside.kind)
        assertEquals("/etc/hosts", outside.path)
        assertNull(outside.rel)
    }

    @Test
    fun locatePathFailure() {
        val failed = decode<Inbound.LocatePath>(
            """{ "t": "locatePath", "project": "gone", "path": "/x", "ok": false, "error": "no such project" }"""
        ).located
        assertNull(failed.kind)
        assertEquals("/x", failed.typed)
    }
}
