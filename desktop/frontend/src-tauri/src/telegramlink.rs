// Which Telegram bot lpm writes through and the chats it writes to. Neither is
// secret, so they live in ~/.lpm/telegram.json (the token is with the other
// secrets). Each chat keeps a short key, fixed when it's added, that jobs name
// it by — "telegram:releases" — so renaming a group never breaks a job.
//
// A chat only joins through a link lpm handed out: the first chat is the one
// that taps Start on the bot's link, which carries a code only that link has,
// and whoever tapped it becomes the owner — the one person lpm answers to.
// After that only the owner brings chats in, by adding the bot to a group or
// channel. Anyone else who finds the bot or sees the code is ignored.

use crate::config;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::path::PathBuf;

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct Chat {
    pub key: String,
    #[serde(rename = "chatId")]
    pub chat_id: i64,
    pub name: String,
    /// "private", "group", "supergroup" or "channel".
    #[serde(default)]
    pub kind: String,
}

#[derive(Serialize, Deserialize, Default)]
pub struct Link {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub bot: Option<String>,
    #[serde(default)]
    pub chats: Vec<Chat>,
    /// The newest update already read from the bot, so the next look only
    /// sees what came after it.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub offset: Option<i64>,
    /// What the Start links lpm hands out carry, so a chat that taps Start on
    /// one is known to be the user's.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub code: Option<String>,
    /// The Telegram user who tapped Start on the first chat.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub(crate) owner: Option<i64>,
    // The one chat a link file from before several chats were possible held.
    #[serde(rename = "chatId", default, skip_serializing)]
    chat_id: Option<i64>,
    #[serde(default, skip_serializing)]
    chat: Option<String>,
}

/// Under ~/.lpm, and one of the files config sync carries to a paired Mac.
pub const FILE: &str = "telegram.json";

fn path() -> PathBuf {
    config::lpm_dir().join(FILE)
}

impl Link {
    /// A fresh link to a bot, with no chats yet.
    pub fn for_bot(bot: String) -> Link {
        Link {
            bot: Some(bot),
            code: Some(new_code()),
            ..Link::default()
        }
    }

    /// The code Start links carry, made the first time one is asked for.
    /// Returns whether it was just made, so the caller knows to save.
    pub fn ensure_code(&mut self) -> bool {
        if self.code.is_some() {
            return false;
        }
        self.code = Some(new_code());
        true
    }

    pub fn load() -> Link {
        Link::try_load().unwrap_or_default()
    }

    /// The link as saved, or None when the file is missing or unreadable.
    pub fn try_load() -> Option<Link> {
        std::fs::read(path())
            .ok()
            .and_then(|bytes| Link::parse(&bytes).ok())
    }

    pub fn parse(bytes: &[u8]) -> Result<Link, String> {
        let mut link: Link = serde_json::from_slice(bytes).map_err(|e| format!("{FILE}: {e}"))?;
        link.adopt_single_chat();
        link.adopt_owner();
        Ok(link)
    }

    /// No bot and no chats: what Disconnect leaves behind.
    pub fn is_empty(&self) -> bool {
        self.bot.is_none() && self.chats.is_empty()
    }

    pub fn save(&self) -> Result<(), String> {
        let path = path();
        let tmp = path.with_extension("json.tmp");
        let text = serde_json::to_string_pretty(self).map_err(|e| e.to_string())?;
        std::fs::write(&tmp, text).map_err(|e| e.to_string())?;
        std::fs::rename(&tmp, &path).map_err(|e| e.to_string())
    }

    fn adopt_single_chat(&mut self) {
        if let (true, Some(chat_id)) = (self.chats.is_empty(), self.chat_id.take()) {
            let name = self.chat.take().unwrap_or_else(|| "your chat".into());
            self.chats.push(Chat {
                key: unique_key(&name, &[]),
                chat_id,
                name,
                kind: "private".into(),
            });
        }
    }

    /// A link file from before the owner was kept: chats join in order, so the
    /// first private one is the user's.
    fn adopt_owner(&mut self) {
        if self.owner.is_none() {
            self.owner = self
                .chats
                .iter()
                .find(|c| c.kind == "private")
                .map(|c| c.chat_id);
        }
    }

    /// The chat a job's target names, or the first one for plain "telegram".
    pub fn chat(&self, target: Option<&str>) -> Option<&Chat> {
        match target {
            Some(key) => self.chats.iter().find(|c| c.key == key),
            None => self.chats.first(),
        }
    }

    pub fn remove(&mut self, key: &str) -> bool {
        let before = self.chats.len();
        self.chats.retain(|c| c.key != key);
        self.chats.len() != before
    }

    /// Takes in what the bot has heard since the last look: a chat that tapped
    /// Start on one of lpm's links, or a group or channel the user added the bot
    /// to, becomes one lpm can send to. Returns the chats that are new.
    pub fn take_updates(&mut self, updates: &Value) -> Vec<Chat> {
        let mut added = Vec::new();
        for update in updates.as_array().into_iter().flatten() {
            if let Some(id) = update["update_id"].as_i64() {
                self.offset = Some(self.offset.map_or(id, |o| o.max(id)));
            }
            let Some(chat) = self.joining_chat(update) else {
                continue;
            };
            let Some(chat_id) = chat["id"].as_i64() else {
                continue;
            };
            if self.chats.iter().any(|c| c.chat_id == chat_id) {
                continue;
            }
            let name = chat_name(chat);
            let taken: Vec<&str> = self.chats.iter().map(|c| c.key.as_str()).collect();
            let new = Chat {
                key: unique_key(&name, &taken),
                chat_id,
                name,
                kind: chat["type"].as_str().unwrap_or_default().to_string(),
            };
            self.owner.get_or_insert(chat_id);
            self.chats.push(new.clone());
            added.push(new);
        }
        added
    }
}

impl Link {
    pub(crate) fn is_owner(&self, user: i64) -> bool {
        self.owner == Some(user)
    }

    /// The chat an update brings in, if it's one the user meant: the first
    /// chat's Start carrying this link's code, the owner's own Start in a chat,
    /// or the owner adding the bot to a group or channel. Being removed is
    /// never a reason to send.
    fn joining_chat<'a>(&self, update: &'a Value) -> Option<&'a Value> {
        if let Some(member) = update.get("my_chat_member") {
            let status = member["new_chat_member"]["status"].as_str().unwrap_or_default();
            let by_owner = member["from"]["id"].as_i64().is_some_and(|id| self.is_owner(id));
            return (by_owner && !matches!(status, "left" | "kicked"))
                .then(|| member.get("chat"))
                .flatten();
        }
        let message = update.get("message")?;
        let sender_counts = match self.owner {
            Some(owner) => message["from"]["id"].as_i64() == Some(owner),
            None => self.chats.is_empty() && message["chat"]["type"] == "private",
        };
        let code = self.code.as_deref()?;
        (sender_counts && start_payload(message["text"].as_str()?) == Some(code))
            .then(|| message.get("chat"))
            .flatten()
    }
}

/// "/start abc" or "/start@some_bot abc" → "abc".
fn start_payload(text: &str) -> Option<&str> {
    let mut words = text.split_whitespace();
    let command = words.next()?;
    let is_start = command == "/start" || command.starts_with("/start@");
    is_start.then(|| words.next()).flatten()
}

fn new_code() -> String {
    uuid::Uuid::new_v4().simple().to_string()[..12].to_string()
}

/// What a chat is called: a group's or channel's title, or a person's name.
pub fn chat_name(chat: &Value) -> String {
    if let Some(title) = chat["title"].as_str() {
        return title.to_string();
    }
    let name = [chat["first_name"].as_str(), chat["last_name"].as_str()]
        .into_iter()
        .flatten()
        .collect::<Vec<_>>()
        .join(" ");
    if !name.is_empty() {
        return name;
    }
    chat["username"].as_str().map_or_else(|| "your chat".into(), |u| format!("@{u}"))
}

/// "Release Notes 🚀" → "release-notes", made unique against `taken`.
fn unique_key(name: &str, taken: &[&str]) -> String {
    let mut base = String::new();
    for c in name.to_lowercase().chars() {
        if c.is_ascii_alphanumeric() {
            base.push(c);
        } else if !base.is_empty() && !base.ends_with('-') {
            base.push('-');
        }
    }
    let base = base.trim_end_matches('-');
    let base = if base.is_empty() { "chat" } else { base };
    let mut key = base.to_string();
    let mut n = 2;
    while taken.contains(&key.as_str()) {
        key = format!("{base}-{n}");
        n += 1;
    }
    key
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn a_disconnected_link_reads_back_empty_and_an_old_one_does_not() {
        let disconnected = serde_json::to_vec(&Link::default()).unwrap();
        assert!(Link::parse(&disconnected).unwrap().is_empty());
        assert!(!Link::for_bot("lpm_bot".into()).is_empty());
        let single_chat = br#"{ "chatId": 42, "chat": "Ada" }"#;
        assert!(!Link::parse(single_chat).unwrap().is_empty());
        assert!(Link::parse(b"not json").is_err());
    }

    #[test]
    fn names_a_chat_by_title_then_person() {
        assert_eq!(chat_name(&json!({ "title": "Ops" })), "Ops");
        assert_eq!(chat_name(&json!({ "first_name": "Ada", "last_name": "L" })), "Ada L");
        assert_eq!(chat_name(&json!({ "username": "ada" })), "@ada");
    }

    #[test]
    fn keys_are_short_unique_and_never_empty() {
        assert_eq!(unique_key("Release Notes 🚀", &[]), "release-notes");
        assert_eq!(unique_key("Ops", &["ops"]), "ops-2");
        assert_eq!(unique_key("Ops", &["ops", "ops-2"]), "ops-3");
        assert_eq!(unique_key("🚀", &[]), "chat");
    }

    fn linked(code: &str) -> Link {
        Link {
            code: Some(code.into()),
            ..Link::default()
        }
    }

    #[test]
    fn takes_in_only_chats_that_start_with_the_code_or_the_user_added_it_to() {
        let mut link = linked("c0de");
        let updates = json!([
            { "update_id": 4, "message": { "text": "hi", "chat": { "id": 7, "type": "private", "first_name": "Stranger" } } },
            { "update_id": 5, "message": { "text": "/start c0de", "chat": { "id": 1, "type": "private", "first_name": "Ada" } } },
            { "update_id": 6, "message": { "text": "/start wrong", "chat": { "id": 8, "type": "private", "first_name": "Eve" } } },
            { "update_id": 7, "my_chat_member": { "from": { "id": 1 }, "chat": { "id": -9, "type": "channel", "title": "Releases" },
                "new_chat_member": { "status": "administrator" } } },
            { "update_id": 8, "my_chat_member": { "from": { "id": 7 }, "chat": { "id": -5, "type": "group", "title": "Theirs" },
                "new_chat_member": { "status": "member" } } },
            { "update_id": 9, "my_chat_member": { "from": { "id": 1 }, "chat": { "id": -4, "type": "group", "title": "Old" },
                "new_chat_member": { "status": "left" } } },
            { "update_id": 10, "message": { "text": "/start@lpm_bot c0de", "from": { "id": 1 }, "chat": { "id": -3, "type": "group", "title": "Ops" } } },
        ]);
        let added = link.take_updates(&updates);
        assert_eq!(
            added.iter().map(|c| c.key.as_str()).collect::<Vec<_>>(),
            ["ada", "releases", "ops"]
        );
        assert_eq!(link.chats[1].kind, "channel");
        assert_eq!(link.offset, Some(10));
        assert!(link.take_updates(&updates).is_empty());
    }

    #[test]
    fn someone_else_holding_the_code_is_not_the_owner() {
        let mut link = linked("c0de");
        let added = link.take_updates(&json!([
            { "update_id": 1, "message": { "text": "/start c0de", "from": { "id": 1 }, "chat": { "id": 1, "type": "private", "first_name": "Ada" } } },
            { "update_id": 2, "message": { "text": "/start@lpm_bot c0de", "from": { "id": 1 }, "chat": { "id": -3, "type": "group", "title": "Team" } } },
            { "update_id": 3, "message": { "text": "/start c0de", "from": { "id": 66 }, "chat": { "id": 66, "type": "private", "first_name": "Mallory" } } },
            { "update_id": 4, "message": { "text": "/start@lpm_bot c0de", "from": { "id": 66 }, "chat": { "id": -6, "type": "group", "title": "Hers" } } },
            { "update_id": 5, "channel_post": { "text": "/start c0de", "chat": { "id": -7, "type": "channel", "title": "Hers" } } },
        ]));
        assert_eq!(
            added.iter().map(|c| c.key.as_str()).collect::<Vec<_>>(),
            ["ada", "team"]
        );
        assert!(link.is_owner(1));
        assert!(!link.is_owner(66));
    }

    #[test]
    fn the_first_chat_must_be_a_private_start() {
        let mut link = linked("c0de");
        let group_first = json!([
            { "update_id": 1, "message": { "text": "/start@lpm_bot c0de", "from": { "id": 66 }, "chat": { "id": -6, "type": "group", "title": "Hers" } } },
        ]);
        assert!(link.take_updates(&group_first).is_empty());
        assert_eq!(link.owner, None);
    }

    #[test]
    fn an_older_link_file_takes_its_first_private_chat_as_owner() {
        let link = Link::parse(
            br#"{ "chats": [
                { "key": "ops", "chatId": -3, "name": "Ops", "kind": "group" },
                { "key": "ada", "chatId": 1, "name": "Ada", "kind": "private" },
                { "key": "eve", "chatId": 8, "name": "Eve", "kind": "private" }
            ] }"#,
        )
        .unwrap();
        assert!(link.is_owner(1));
        assert!(!link.is_owner(8));
        assert!(Link::parse(br#"{ "chatId": 42 }"#).unwrap().is_owner(42));
    }

    #[test]
    fn reads_the_start_payload() {
        assert_eq!(start_payload("/start abc"), Some("abc"));
        assert_eq!(start_payload("/start@lpm_bot abc"), Some("abc"));
        assert_eq!(start_payload("/start"), None);
        assert_eq!(start_payload("/started abc"), None);
        assert_eq!(start_payload("hello abc"), None);
    }

    #[test]
    fn finds_a_chat_by_key_or_the_first_for_plain_telegram() {
        let mut link = linked("k");
        link.take_updates(&json!([
            { "update_id": 1, "message": { "text": "/start k", "chat": { "id": 1, "type": "private", "first_name": "Ada" } } },
            { "update_id": 2, "my_chat_member": { "from": { "id": 1 }, "chat": { "id": -2, "type": "channel", "title": "Ops" },
                "new_chat_member": { "status": "administrator" } } },
        ]));
        assert_eq!(link.chat(None).unwrap().chat_id, 1);
        assert_eq!(link.chat(Some("ops")).unwrap().chat_id, -2);
        assert!(link.chat(Some("gone")).is_none());
        assert!(link.remove("ada"));
        assert_eq!(link.chat(None).unwrap().key, "ops");
    }

    #[test]
    fn makes_a_code_once() {
        let mut link = Link::default();
        assert!(link.ensure_code());
        let code = link.code.clone().unwrap();
        assert_eq!(code.len(), 12);
        assert!(!link.ensure_code());
        assert_eq!(link.code.as_deref(), Some(code.as_str()));
        assert!(Link::for_bot("b".into()).code.is_some());
    }

    #[test]
    fn adopts_the_one_chat_an_older_link_file_held() {
        let mut link: Link =
            serde_json::from_str(r#"{ "bot": "lpm_bot", "chatId": 42, "chat": "Ada Lovelace" }"#).unwrap();
        link.adopt_single_chat();
        assert_eq!(link.chats.len(), 1);
        assert_eq!(link.chats[0].key, "ada-lovelace");
        assert_eq!(link.chats[0].chat_id, 42);
        let saved = serde_json::to_value(&link).unwrap();
        assert!(saved.get("chatId").is_none() && saved.get("chat").is_none());
    }
}
