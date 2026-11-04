package cx.lpm.mobile.core.protocol

import cx.lpm.mobile.core.model.ComposerAction
import cx.lpm.mobile.core.model.HistoryFolder
import cx.lpm.mobile.core.model.HistoryItem
import cx.lpm.mobile.core.model.HistoryRow
import cx.lpm.mobile.core.model.MentionComputer
import cx.lpm.mobile.core.model.MentionEntry
import cx.lpm.mobile.core.model.SlashCommand
import cx.lpm.mobile.core.model.bool
import cx.lpm.mobile.core.model.int
import cx.lpm.mobile.core.model.list
import cx.lpm.mobile.core.model.obj
import cx.lpm.mobile.core.model.reqIdString

internal val composerParsers = parsers {
    put("slash") { o ->
        Inbound.Slash(id = o.str("id"), commands = o.list("commands", SlashCommand::parse))
    }
    put("mentions") { o ->
        Inbound.Mentions(
            project = o.str("project"),
            entries = o.list("entries", MentionEntry::parse),
            computers = o.list("computers", MentionComputer::parse)
        )
    }
    put("history") { o ->
        Inbound.History(project = o.str("project"), rows = o.list("rows", HistoryRow::parse))
    }
    put("composerActions") { o ->
        Inbound.ComposerActions(o.list("actions", ComposerAction::parse))
    }
    put("transform") { o ->
        Inbound.TransformVariant(
            reqId = o["reqId"].reqIdString(),
            idx = o.int("idx") ?: 0,
            text = if (o.ok) o.str("text") else null,
            error = o.failure("The rewrite failed.")
        )
    }
    put("transformDone") { o -> Inbound.TransformDone(reqId = o["reqId"].reqIdString(), ok = o.ok) }
    put("composerDraft") { o ->
        Inbound.ComposerDraft(
            id = o.str("id"),
            text = o.str("text"),
            rev = o.int("rev") ?: 0,
            origin = o.str("origin")
        )
    }
    put("historyQuery") { o ->
        Inbound.HistoryQuery(
            items = o.list("items", HistoryItem::parse),
            hasMore =
                o.bool("hasMore") ?: false
        )
    }
    put("historySaveDraft") { o -> Inbound.HistorySaveDraft(ok = o.ok) }
    put("historyToggleFavorite") { o ->
        Inbound.HistoryToggleFavorite(
            id = o.str("id"),
            favorite = o.bool("favorite") ?: false,
            error = o.failure("Couldn't update favorite.")
        )
    }
    for (t in listOf("historySetFolder", "historyDelete", "historyDeleteFolder")) {
        put(t) { o ->
            Inbound.HistoryMutated(ok = o.ok, error = o.failure("Couldn't update history."))
        }
    }
    put("historyFolders") { o -> Inbound.HistoryFolders(o.list("folders", HistoryFolder::parse)) }
    put("historyCreateFolder") { o ->
        Inbound.HistoryCreateFolder(
            folder = if (o.ok) HistoryFolder.parse(o.obj("folder") ?: emptyObject) else null,
            error = o.failure("Couldn't create the folder.")
        )
    }
}
