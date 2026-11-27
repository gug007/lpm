/// One note's share of what the composer sends: the first carries the text.
struct NotePart {
    let text: String
    let drafts: [NoteAttachmentDraft]

    static func split(text: String, drafts: [NoteAttachmentDraft]) -> [NotePart] {
        ShareDelivery.noteGroups(drafts, bytes: { $0.data.count }).enumerated().map {
            NotePart(text: $0.offset == 0 ? text : "", drafts: $0.element)
        }
    }
}

/// A part of a note the Mac accepted: whether it carried the text, and how many
/// of the composer's attachments, from the first.
struct NoteSentPart: Equatable {
    let tick: Int
    let text: Bool
    let attachments: Int
}
