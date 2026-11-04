package cx.lpm.mobile.core.protocol

import cx.lpm.mobile.core.model.ComposerAction
import cx.lpm.mobile.core.model.HistoryFolder
import cx.lpm.mobile.core.model.HistoryRow
import cx.lpm.mobile.core.model.MentionComputer
import cx.lpm.mobile.core.model.MentionEntry
import cx.lpm.mobile.core.model.MentionPlace
import cx.lpm.mobile.core.model.SlashCommand
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class InboundComposerTest {
    @Test
    fun slashMentionsAndHistory() {
        assertEquals(
            Inbound.Slash("t-1", listOf(SlashCommand("review", "Review a PR", "<pr>", "builtin"))),
            Inbound.parse(
                """{ "t": "slash", "id": "t-1", "commands": [{ "name": "review", "description": "Review a PR",
                     "argumentHint": "<pr>", "source": "builtin" }] }"""
            )
        )
        assertEquals(
            Inbound.Mentions(
                "api",
                listOf(MentionEntry("src/main.rs", dir = false, changed = true))
            ),
            Inbound.parse(
                """{ "t": "mentions", "project": "api", "entries": [{ "path": "src/main.rs", "changed": true }] }"""
            )
        )
        assertEquals(
            Inbound.Mentions(
                "storefront",
                emptyList(),
                listOf(
                    MentionComputer(
                        "Mac mini",
                        "commands · copy from it",
                        listOf(
                            MentionPlace(
                                "storefront",
                                "Mac mini:~/storefront",
                                "Mac mini:~/storefront (on another computer; reach it with lpm exec --on and lpm cp)"
                            ),
                            MentionPlace("Home folder", "Mac mini:~", "")
                        )
                    )
                )
            ),
            Inbound.parse(
                """{ "t": "mentions", "project": "storefront", "computers": [{ "name": "Mac mini",
                     "slug": "c2a0e3b1", "access": "commands · copy from it", "places": [
                     { "label": "storefront", "path": "Mac mini:~/storefront",
                       "insert": "Mac mini:~/storefront (on another computer; reach it with lpm exec --on and lpm cp)" },
                     { "label": "Home folder", "path": "Mac mini:~" }] }] }"""
            )
        )
        assertEquals(
            Inbound.History(
                "api",
                listOf(HistoryRow("h-1", "fix it", "Terminal 1", isDraft = false))
            ),
            Inbound.parse(
                """{ "t": "history", "project": "api", "rows": [{ "id": "h-1", "text": "fix it", "terminalLabel": "Terminal 1" }] }"""
            )
        )
    }

    @Test
    fun composerActions() {
        assertEquals(
            Inbound.ComposerActions(
                listOf(ComposerAction("polish", "sparkles", "Polish", "Make it clearer"))
            ),
            Inbound.parse(
                """{ "t": "composerActions", "actions": [{ "id": "polish", "icon": "sparkles", "label": "Polish",
                     "instruction": "Make it clearer" }] }"""
            )
        )
        assertTrue(
            decode<Inbound.ComposerActions>("""{ "t": "composerActions" }""").actions.isEmpty()
        )
    }

    @Test
    fun transformVariantsAndDone() {
        assertEquals(
            Inbound.TransformVariant("7", 1, "Clearer text", null),
            Inbound.parse(
                """{ "t": "transform", "reqId": 7, "idx": 1, "ok": true, "text": "Clearer text" }"""
            )
        )
        assertEquals(
            Inbound.TransformVariant("r", 0, null, "The rewrite failed."),
            Inbound.parse("""{ "t": "transform", "reqId": "r", "ok": false }""")
        )
        assertEquals(
            Inbound.TransformDone("r", true),
            Inbound.parse("""{ "t": "transformDone", "reqId": "r", "ok": true }""")
        )
        assertEquals(
            Inbound.TransformDone("", false),
            Inbound.parse("""{ "t": "transformDone" }""")
        )
    }

    @Test
    fun composerDraft() {
        assertEquals(
            Inbound.ComposerDraft("t-1", "half a thought", 12, "mac"),
            Inbound.parse(
                """{ "t": "composerDraft", "id": "t-1", "text": "half a thought", "rev": 12, "origin": "mac" }"""
            )
        )
    }

    @Test
    fun historyQuery() {
        val f = decode<Inbound.HistoryQuery>(
            """{ "t": "historyQuery", "hasMore": true, "items": [{ "id": "m-1", "text": "ship it",
                 "images": {}, "timestamp": 1760000000000, "favorite": true, "folder": "f-1", "kind": "draft",
                 "project": "api", "at": 1760000000000, "seq": 3 }] }"""
        )
        val item = f.items.single()
        assertTrue(f.hasMore)
        assertTrue(item.isDraft)
        assertEquals("f-1", item.folder)
        assertEquals(3L, item.seq)
        assertFalse(decode<Inbound.HistoryQuery>("""{ "t": "historyQuery" }""").hasMore)
    }

    @Test
    fun historyMutations() {
        assertEquals(
            Inbound.HistorySaveDraft(true),
            Inbound.parse("""{ "t": "historySaveDraft", "ok": true }""")
        )
        assertEquals(
            Inbound.HistoryToggleFavorite("m-1", true, null),
            Inbound.parse(
                """{ "t": "historyToggleFavorite", "id": "m-1", "ok": true, "favorite": true }"""
            )
        )
        assertEquals(
            Inbound.HistoryToggleFavorite("m-1", false, "Couldn't update favorite."),
            Inbound.parse("""{ "t": "historyToggleFavorite", "id": "m-1" }""")
        )
        for (t in listOf("historySetFolder", "historyDelete", "historyDeleteFolder")) {
            assertEquals(
                Inbound.HistoryMutated(true, null),
                Inbound.parse("""{ "t": "$t", "ok": true }""")
            )
            assertEquals(
                Inbound.HistoryMutated(false, "Couldn't update history."),
                Inbound.parse("""{ "t": "$t", "ok": false }""")
            )
        }
    }

    @Test
    fun historyFolders() {
        assertEquals(
            Inbound.HistoryFolders(listOf(HistoryFolder("f-1", "Prompts", 4))),
            Inbound.parse(
                """{ "t": "historyFolders", "folders": [{ "id": "f-1", "name": "Prompts", "count": 4 }] }"""
            )
        )
        assertEquals(
            Inbound.HistoryCreateFolder(HistoryFolder("f-2", "Ideas", 0), null),
            Inbound.parse(
                """{ "t": "historyCreateFolder", "ok": true, "folder": { "id": "f-2", "name": "Ideas", "count": 0 } }"""
            )
        )
        assertEquals(
            HistoryFolder("", "Folder", 0),
            decode<Inbound.HistoryCreateFolder>(
                """{ "t": "historyCreateFolder", "ok": true }"""
            ).folder
        )
        val failed =
            decode<Inbound.HistoryCreateFolder>("""{ "t": "historyCreateFolder", "ok": false }""")
        assertNull(failed.folder)
        assertEquals("Couldn't create the folder.", failed.error)
    }
}
