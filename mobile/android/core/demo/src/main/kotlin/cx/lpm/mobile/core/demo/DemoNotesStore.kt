package cx.lpm.mobile.core.demo

import java.security.MessageDigest
import java.util.Base64

// The Notes notebook's state: chats, paging, posting, search, and attachment blobs.

internal sealed interface AddNoteResult {
    class Success(val note: DemoWorld.NoteRec) : AddNoteResult

    class Failure(val message: String) : AddNoteResult
}

/**
 * A project with no notebook gets one on first open, back-filled with a General chat,
 * exactly as the Mac does.
 */
internal fun DemoServer.ensureNotebook(project: String) {
    if (world.noteChats[project] != null) return
    world.noteChats[project] = mutableListOf()
    newChat(project, title = "General")
}

internal fun DemoServer.newChat(project: String, title: String): DemoWorld.NoteChatRec {
    val now = nowMillis()
    world.noteSeq += 1
    val chat = DemoWorld.NoteChatRec(
        id = "chat-${world.noteSeq}",
        title = title,
        createdAt = now,
        updatedAt = now
    )
    world.noteChats.getOrPut(project) { mutableListOf() }.add(0, chat)
    return chat
}

internal fun DemoServer.sortedChats(project: String): List<DemoWorld.NoteChatRec> =
    (world.noteChats[project] ?: emptyList()).sortedByDescending { it.updatedAt }

private fun DemoServer.chat(project: String, chatId: String): DemoWorld.NoteChatRec? =
    world.noteChats[project]?.firstOrNull { it.id == chatId }

/**
 * One page, newest first. `beforeId` is the oldest note the phone holds, so a page is
 * everything below its seq.
 */
internal fun DemoServer.notePage(
    project: String,
    chatId: String,
    limit: Int,
    beforeId: String
): List<DemoWorld.NoteRec> {
    val all = (world.noteMessages[project] ?: emptyList())
        .filter { it.chatId == chatId }
        .sortedByDescending { it.seq }
    if (beforeId.isEmpty()) return all.take(maxOf(limit, 1))
    val before = all.firstOrNull { it.id == beforeId } ?: return emptyList()
    return all.filter { it.seq < before.seq }.take(maxOf(limit, 1))
}

internal fun DemoServer.addNote(
    project: String,
    chatId: String,
    text: String,
    drafts: List<Dict>
): AddNoteResult {
    val chat =
        chat(project, chatId) ?: return AddNoteResult.Failure("That chat is no longer on your Mac.")
    val attachments = mutableListOf<DemoWorld.NoteAttachmentRec>()
    for (draft in drafts) {
        val encoded = draft.string("data") ?: ""
        if (noteEncodedOverCap(encoded)) {
            return AddNoteResult.Failure(
                "That file is too large to send from your phone. Add it from your Mac instead."
            )
        }
        val bytes = decodeBase64(encoded)
            ?: return AddNoteResult.Failure(
                "That attachment could not be read. Try sending it again."
            )
        val hash = sha256(bytes)
        world.noteBlobs[hash] = encoded
        attachments.add(
            DemoWorld.NoteAttachmentRec(
                hash = hash,
                name = draft.string("name") ?: "attachment",
                size = bytes.size,
                mimeType = draft.string("mimeType") ?: "application/octet-stream"
            )
        )
    }
    val now = nowMillis()
    world.noteSeq += 1
    val note = DemoWorld.NoteRec(
        id = "note-${world.noteSeq}",
        chatId = chatId,
        seq = world.noteSeq,
        ts = now,
        text = text,
        attachments = attachments
    )
    world.noteMessages.getOrPut(project) { mutableListOf() }.add(note)
    chat.updatedAt = now
    return AddNoteResult.Success(note)
}

internal fun DemoServer.noteHits(project: String, query: String, limit: Int): List<Dict> {
    val term = query.trimmingWhitespacesAndNewlines()
    if (term.isEmpty()) return emptyList()
    val titles = (world.noteChats[project] ?: emptyList()).associate { it.id to it.title }
    return (world.noteMessages[project] ?: emptyList())
        .filter { it.text.contains(term, ignoreCase = true) }
        // Newest first across every chat, so this orders on the timestamp rather than
        // the per-chat paging seq.
        .sortedWith(compareByDescending<DemoWorld.NoteRec> { it.ts }.thenByDescending { it.seq })
        .take(maxOf(limit, 1))
        .map { note ->
            mapOf(
                "id" to note.id,
                "chatId" to note.chatId,
                "chatTitle" to (titles[note.chatId] ?: ""),
                "ts" to note.ts,
                "snippet" to noteSnippet(note.text, term)
            )
        }
}

/**
 * Drop the bytes of attachments no note references any more, the way a chat delete
 * sweeps orphaned blobs on the Mac.
 */
internal fun DemoServer.sweepNoteBlobs() {
    val live = world.noteMessages.values.flatten().flatMap { note ->
        note.attachments.map { it.hash }
    }.toSet()
    world.noteBlobs = world.noteBlobs.filterKeys { it in live }.toMutableMap()
}

internal fun sha256(bytes: ByteArray): String =
    MessageDigest.getInstance("SHA-256").digest(bytes).joinToString("") { "%02x".format(it) }

/**
 * The per-file ceiling the Mac enforces on this link. Base64 emits four characters per
 * three bytes, so the encoded length is what the cap is measured against: the same
 * bound, derived in the same direction, as the real hub's.
 */
private const val DEMO_ATTACHMENT_BYTE_LIMIT = 8 * 1024 * 1024

private fun noteEncodedOverCap(encoded: String): Boolean =
    encoded.length > (DEMO_ATTACHMENT_BYTE_LIMIT + 2) / 3 * 4

/** A window around the match, matching the Mac's 80-before / 160-after budget. */
private fun noteSnippet(text: String, term: String): String {
    val before = 80
    val after = 160
    val match = text.indexOf(term, ignoreCase = true)
    if (match < 0) {
        return if (text.graphemeCount() <= before + after) {
            text
        } else {
            text.graphemePrefix(before + after) + "…"
        }
    }
    val start = text.graphemeOffset(match, -before)
    val end = text.graphemeOffset(match + term.length, after)
    return (if (start > 0) "…" else "") + text.substring(start, end) +
        (if (end < text.length) "…" else "")
}

// fixtures

internal fun DemoServer.seedNotesFixtures() {
    seedNoteChat(
        "storefront",
        title = "Checkout redesign",
        texts = demoCheckoutNotes,
        fromMinutesAgo = 15_800,
        toMinutesAgo = 22,
        attachmentAt = 34
    )
    seedNoteChat(
        "storefront",
        title = "Ideas",
        texts = demoIdeaNotes,
        fromMinutesAgo = 20_000,
        toMinutesAgo = 2_600
    )
    seedNoteChat(
        "storefront",
        title = "General",
        texts = demoStorefrontGeneralNotes,
        fromMinutesAgo = 26_000,
        toMinutesAgo = 8_400
    )
    seedNoteChat(
        "api-gateway",
        title = "General",
        texts = demoGatewayNotes,
        fromMinutesAgo = 30_000,
        toMinutesAgo = 5_100
    )
    seedNoteChat(
        "mobile-app",
        title = "General",
        texts = demoMobileNotes,
        fromMinutesAgo = 24_000,
        toMinutesAgo = 9_600
    )
}

/**
 * Seed one chat with its notes spread evenly across a window, oldest first.
 * `attachmentAt` indexes `texts` and gets the summary-card image.
 */
private fun DemoServer.seedNoteChat(
    project: String,
    title: String,
    texts: List<String>,
    fromMinutesAgo: Int,
    toMinutesAgo: Int,
    attachmentAt: Int? = null
) {
    if (world.noteChats[project] == null) world.noteChats[project] = mutableListOf()
    val chat = newChat(project, title)
    val span = (fromMinutesAgo - toMinutesAgo).toDouble()
    val step = span / maxOf(texts.size - 1, 1)
    val notes = texts.mapIndexed { i, text ->
        // A deterministic wobble so the thread doesn't read as machine-spaced.
        val minutesAgo = fromMinutesAgo - step * i - (i * 37) % 13
        world.noteSeq += 1
        DemoWorld.NoteRec(
            id = "note-${world.noteSeq}",
            chatId = chat.id,
            seq = world.noteSeq,
            ts = nowMillis() - (maxOf(minutesAgo, 1.0) * 60_000).toLong(),
            text = text,
            attachments = if (i == attachmentAt) listOf(seedNoteImage()) else emptyList()
        )
    }
    world.noteMessages.getOrPut(project) { mutableListOf() }.addAll(notes)
    if (notes.isNotEmpty()) {
        chat.updatedAt = notes.last().ts
        chat.createdAt = notes.first().ts
    }
}

/** Store the summary-card screenshot and describe it the way a real attachment is described. */
private fun DemoServer.seedNoteImage(): DemoWorld.NoteAttachmentRec {
    val bytes = summaryCardPng()
    val hash = sha256(bytes)
    world.noteBlobs[hash] = Base64.getEncoder().encodeToString(bytes)
    return DemoWorld.NoteAttachmentRec(
        hash = hash,
        name = "summary-card.png",
        size = bytes.size,
        mimeType = "image/png"
    )
}

/**
 * The attached "screenshot": a checkout summary card. iOS draws it in process with UIKit;
 * a JVM module can't draw text, so the same card ships pre-rendered at 3x.
 */
private fun summaryCardPng(): ByteArray =
    // An absolute path, so it still resolves once R8 has renamed this package.
    DemoServer::class.java.getResourceAsStream("/summary-card.png")
        ?.use { it.readBytes() }
        ?: ByteArray(0)
