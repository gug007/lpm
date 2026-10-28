# Icons

SF Symbols can't ship on Android, so the app uses Material Symbols **Rounded**
(weight 400) as vector drawables in this module. Add one with

```sh
tools/add-icon.sh <material-symbol-name>        # res/drawable/ic_<name>.xml
tools/add-icon.sh <material-symbol-name> fill   # res/drawable/ic_<name>_fill.xml
```

and use it as `painterResource(R.drawable.ic_<name>)`. Names are listed at
<https://fonts.google.com/icons?icon.style=Rounded>. Reuse the mapping below so the same
SF Symbol always becomes the same drawable, and add a row when you map a new one.

A Material Symbol's glyph fills less of its 24 dp canvas than an SF Symbol fills its
frame, so **draw size** is the canvas size that gives the glyph iOS draws (measured on
the iPhone screenshots). An icon-only control keeps the accessible name iOS gives it
(`contentDescription`); SwiftUI names some symbols itself, noted in the last column.

| SF Symbol | Material Symbol | Draw size | Where | iOS name |
|---|---|---|---|---|
| `chevron.right` | `chevron_right` | 24 dp (6.6 × 11.3 glyph) | row disclosure (`DisclosureChevron`), submenu rows at 22 dp | "Forward" |
| `chevron.left` (nav back) | `arrow_back_ios_new` | 24 dp | `GlassIconButton` back | |
| `chevron.down` | `keyboard_arrow_down` | 18 dp folder rows, 22 dp Mac switcher and submenu header | folder rows, Mac switcher, submenu header | |
| `chevron.up.chevron.down` | `unfold_more` | 18 dp | `PickerRow` | |
| `ellipsis` | `more_horiz` | 28 dp | "…" toolbar button | "More" |
| `plus` | `add` | 30 dp toolbar, 24 dp in rows, 22 dp stepper | "+", "New tab", stepper | "Add" |
| `minus` | `remove` | 22 dp | stepper | |
| `magnifyingglass` | `search` | 22 dp | `SearchField` | |
| `xmark` | `close` | 24 dp | close buttons | |
| `xmark.circle.fill` | `cancel` (fill) | 20 dp | search field clear ("Clear text") | |
| `checkmark` | `check` | 22 dp | picked option in menus (`iconDescription`) | "selected" |
| `bolt` | `bolt` | 28 dp toolbar, 22 dp in rows | actions button, background-run rows | |
| `square.3.layers.3d` | `stacks` | 27 dp | Activity group-by button | |
| `play.circle` | `play_circle` | 20 dp | "No Mac nearby? Try the demo" | |
| `play.circle.fill` | `play_circle` (fill) | 18 dp | demo banner | |
| `play.rectangle.fill` | `smart_display` (fill) | 24 dp | "Watch how to connect" | |
| `stop.fill` | `stop` (fill) | 22–26 dp | Stop | |
| `checklist` | `checklist` | 22 dp | Review Changes | |
| `arrow.trianglehead.branch` | `call_split` | 22 dp | Git | |
| `brain` | `psychology` | 22 dp | Memory (`neurology` is closer but its path is too long for lint) | |
| `note.text` | `article` | 22 dp | Notes | |
| `clock.arrow.circlepath` | `history` | 22 dp | Automations | |
| `person.crop.circle` | `account_circle` | 22 dp | Claude Account | |
| `face.smiling` | `sentiment_satisfied` | 22 dp | Status | |
| `pencil` | `edit` | 22 dp | Rename… | |
| `slider.horizontal.3` | `tune` | 22 dp | Configure… | |
| `textformat.size` | `format_size` | 22 dp | Terminal Settings | |
| `arrow.down` / `arrow.up` | `arrow_downward` / `arrow_upward` | 22 dp | Pull / Push, folder browser "Up" | |
| `arrow.triangle.2.circlepath` | `sync` | 22 dp | Fetch, a machine being added (Mac switcher) | |
| `network` | `language` | 26 dp in rows, 24 dp on a tile | Built-in Tailscale | |
| `iphone` | `smartphone` | 24 dp | Theme "System" | |
| `sun.max` / `moon` | `light_mode` / `dark_mode` | 22 dp | Theme "Light" / "Dark" | |
| `speaker.wave.2` | `volume_up` | 26 dp | Read aloud | |
| `bell.badge` | `notifications_unread` | 26 dp | Notifications | |
| `server.rack` | `dns` | 22 dp | Activity service card, machine section header, offline machine | |
| `wifi` | `wifi` | 22 dp | "Pairing for this Wi-Fi only", home address | |
| `qrcode.viewfinder` | `qr_code_scanner` | 24 dp | "Scan QR code" | |
| `keyboard` | `keyboard_alt` | 24 dp | "Enter a code" | |
| `lock.shield` | `shield_lock` | 24 dp | Local Network access off | |
| `desktopcomputer` | `desktop_mac` | 26 dp, 22 dp in menus and headers | nearby Mac, saved Mac, Mac switcher row, machine section header | |
| `hourglass` | `hourglass` | 44 dp | "Mac is busy" | |
| `exclamationmark.triangle` | `warning` | 44 dp | "Address not usable", fallback issue icon | |
| `hand.raised.slash` | `do_not_touch` | 44 dp | "Pairing declined" | |
| `clock.badge.xmark` | `timer_off` | 44 dp | "No answer" | |
| `checkmark.shield` | `verified_user` | 46 dp sheet, 22 dp row | "Confirm on your Mac", "Open admin console" | |
| `checkmark.circle.fill` | `check_circle` (fill) | 56 dp, 24 dp, 22 dp, 16 dp | "Connected to …", lpm update bar ("Updated to lpm …", "lpm is up to date"), update section, Git notice ("Pulled") | |
| `checkmark.circle` | `check_circle` | 22 dp | "Test addresses" | |
| `bell.badge.fill` | `notifications_unread` (fill) | 18 dp | paired summary Notifications | |
| `exclamationmark.shield` | `gpp_maybe` | 46 dp sheet, 18 dp issue | identity check | |
| `xmark.shield` | `gpp_bad` | 18 dp | "Identity check failed" | |
| `arrow.clockwise` | `refresh` | 22 dp | "Test again" | |
| `point.3.connected.trianglepath.dotted` | `device_hub` | 22 dp | "Addresses", relay issues | |
| `macbook.and.iphone` | `devices` | 22 dp | "Pair again" | |
| `trash` | `delete` | 22–24 dp | "Remove from this phone", Remove, Delete folder, Discard All Changes…, config list swipe "Delete" | |
| `person.crop.circle.badge.checkmark` | `person_check` | 22 dp | "Sign in with Tailscale" | |
| `house` | `home` | 18 dp | name on your network | |
| `globe` | `public` | 18 dp | internet address | |
| `plus.circle` | `add_circle` | 22 dp | "Add address", removed machine "Tap to add" | |
| `wifi.slash` | `wifi_off` | 18 dp | phone offline | |
| `moon.zzz` / `moon.fill` | `bedtime` / `bedtime` (fill) | 18 dp | Mac not answering / asleep | |
| `app.dashed` | `check_box_outline_blank` | 18 dp | lpm not running / closed | |
| `lock.trianglebadge.exclamationmark` | `lock` | 18 dp | couldn't connect securely | |
| `wifi.exclamationmark` | `signal_wifi_bad` | 18 dp | Mac isn't answering (pairing) | |
| `key.slash` | `key_off` | 18 dp | code rejected | |
| `qrcode` | `qr_code` | 18 dp | QR mismatch | |
| `arrow.up.circle` | `arrow_circle_up` | 18 dp, 22 dp in menus | update lpm, machine "Update lpm on it to add it here" | |
| `iphone.slash` | `mobile_off` | 18 dp | remote control off | |
| `play.fill` | `play_arrow` (fill) | 22 dp | Start (project menu) | |
| `xmark.circle` | `cancel` | 22 dp | Exit Demo, Clear status | |
| `square.stack.3d.up` | `layers` | 22 dp | Activity (projects "…" menu) | |
| `chart.bar` | `bar_chart` | 22 dp | Stats | |
| `speedometer` | `speed` | 22 dp | Usage | |
| `gearshape` | `settings` | 22 dp | Settings | |
| `arrow.down.circle` | `arrow_circle_down` | 22 dp, 24 dp in rows | Auto Pull, "Check for lpm Updates…", "Update to …" | |
| `arrow.down.circle.fill` | `arrow_circle_down` (fill) | 24 dp | lpm update bar ("lpm … is available") | |
| `arrow.left.arrow.right` | `swap_horiz` | 22 dp | machine header "Switch to …" | |
| `link` | `link` | 22 dp | "Pair Directly with …" | |
| `plus.rectangle.on.folder` | `add_box` | 22 dp | Add Project… | |
| `folder.badge.plus` | `create_new_folder` | 22 dp | New Folder…, New folder… | |
| `folder` | `folder` | 22 dp menu and folder browser rows, 56 dp empty state | Move to folder, "No projects", Mac folders | |
| `folder.badge.minus` | `folder_off` | 22 dp | No folder | |
| `plus.square.on.square` | `library_add` | 22–24 dp | Duplicate (menu, swipe) | |
| `pin` / `pin.slash` | `keep` / `keep_off` | 22–24 dp | Pin / Unpin a tab | |
| `pin.fill` | `keep` (fill) | 13 dp | pinned tab mark | |
| `bell.fill` | `notifications` (fill) | text size | agent needs you | |
| `exclamationmark.circle.fill` | `error` (fill) | text size | agent problem | |
| `exclamationmark.circle` | `error` | 14 dp, 56 dp | queued action not sent, invalid configuration | |
| `clock` | `schedule` | 14 dp | queued action waiting | |
| `doc.on.doc` | `content_copy` | 22 dp | Copy Branch Name | |
| `arrow.triangle.pull` | `merge` | 22 dp | Create Pull Request… | |
| `sparkles` | `auto_awesome` | 22 dp | Auto Commit / Auto Create PR | |
| `arrow.uturn.backward` | `undo` | 22 dp | Undo Auto Pull | |
| `terminal` | `terminal` | 56 dp | "No Terminals" | |
| `minus.circle.fill` | `do_not_disturb_on` (fill) | 22 dp | edit-mode delete ("Delete") | |
| `line.3.horizontal` | `drag_handle` | 22 dp | edit-mode reorder ("Reorder") | |
| `chevron.up` | `keyboard_arrow_up` | 22 dp | terminal key bar | "Up" |
| `chevron.left` (key) | `chevron_left` | 22 dp | terminal key bar | "Left" |
| `return` (⏎ cap) | `keyboard_return` | 17 dp | terminal key bar ⏎ (the platform font's ⏎ is thin) | "⏎" |
| `doc.on.clipboard` | `content_paste` | 22 dp | "Paste Image" | |
| `keyboard.chevron.compact.down` | `keyboard_hide` | 22 dp | key bar, closes the keyboard | "Hide keyboard" |
| `wand.and.stars` | `auto_fix_high` | 15–22 dp | "Rewrite", default rewrite action | |
| `arrow.down.right.and.arrow.up.left` | `close_fullscreen` | 20 dp | "Make shorter" | |
| `textformat.abc.dottedunderline` | `spellcheck` | 20 dp | "Fix grammar" | |
| `chevron.left.forwardslash.chevron.right` | `code` | 20 dp | code rewrite action | |
| `bolt.fill` | `bolt` (fill) | 20 dp | "More detailed" | |
| `arrow.right.circle.fill` | `arrow_circle_right` (fill) | 28 dp | run a rewrite action | |
| `photo.on.rectangle` | `photo_library` | 22 dp | "Photo Library" | |
| `camera` | `photo_camera` | 22 dp | "Take Photo" | |
| `doc` / `doc.text` | `description` | 22 dp menu, 17 dp mention | "Choose Files", file mention | |
| `doc.fill` | `description` (fill) | 24 dp | file attachment | |
| `film` | `movie` | 24 dp | video attachment | |
| `plus.bubble` | `add_comment` | 22 dp | "New prompt" | |
| `tray.and.arrow.down` | `move_to_inbox` | 22 dp | "Save as draft" | |
| `paperclip` | `attach_file` | 11 dp | prompt tab with attachments | |
| `eye` | `visibility` | 17 dp | preview a mentioned file | "Preview" |
| `arrow.branch` | `fork_right` | 17 dp | local branch mention | |
| `terminal` / `terminal.fill` | `terminal` | 17 dp row, 56 dp placeholder | output mention, "Active on …", "Terminal unavailable" | |
| `stop.circle` | `stop_circle` | 17 dp | terminal ended banner | |
| `star` / `star.fill` | `star` / `star` (fill) | 12–22 dp | history favorites | |
| `paperplane` | `send` | 22 dp | "Send now" | |
| `square.and.pencil` | `edit_square` | 22 dp | "Load into composer" | |
| `exclamationmark.triangle.fill` | `warning` (fill) | 20 dp, 24 dp | failed rewrite variant, lpm update bar ("Couldn't update lpm") | |
| `chart.bar.xaxis` | `bar_chart` | 40 dp | "No local agent usage found" (Stats) | |
| `exclamationmark.triangle` (32 pt) | `warning` | 37 dp | "Couldn't load stats" / "Couldn't load usage" | |
| `chevron.right` / `chevron.down` (caption2) | `chevron_right` / `keyboard_arrow_down` | 17 dp in a 12 dp frame | usage row closed / open | |
| `checkmark.circle.fill` (title3) | `check_circle` (fill) | 24 dp | usage row "Always use …" / "Using …" | |
| `arrow.left.arrow.right.circle` | `swap_horizontal_circle` | 24 dp | usage row "Switch to …" | |
| `person.crop.circle` / `checkmark` | `account_circle` / `check` | 22 dp | usage row long-press "Switch to …" | |
| `envelope.open` | `drafts` | 22–24 dp | Mark read / Read (automation rows) | |
| `pause.fill` | `pause` (fill) | 22–24 dp | Turn off (automation rows) | |
| `power` | `power_settings_new` | 22–24 dp | Turn on (automation rows, run bar) | |
| `clock.badge.questionmark` | `history_toggle_off` | 56 dp | "Automation not found" | |
| `square.stack.3d.up.fill` | `stacks` (fill) | 27 dp | Activity group-by button while grouped | |
| `questionmark` | `question_mark` | 24 dp | Activity swipe "Why?" | |
| `arrow.up.arrow.down` | `swap_vert` | 15 dp | Activity "sort now" | |
| `nosign` | `block` | 30 dp | action color picker "No color" | |
| `square.and.pencil` (Notes bar) | `edit_square` | 24 dp toolbar, 56 dp empty chat | "New Chat", "No notes here yet" | "New Chat" |
| `note.text` (empty notebook) | `article` | 56 dp | "No notes yet" | |
| `plus` (notes attach menu) | `add` | 26 dp | notes composer's attach menu | "Attach" |
| `arrow.up.circle.fill` | `arrow_circle_up` (fill) | 32 dp | notes composer Send | "Send" |
| `xmark.circle.fill` (chip badge) | `close` on a 20 dp 55 % black circle | 13 dp | remove a queued note attachment | "Remove" |
| `xmark` (error banner) | `close` | 16 dp | notes error banner, lpm update bar | "Close" |
| `square.and.arrow.up` | `ios_share` | 20 dp card, 24 dp toolbar | note attachment Share | "Share" |
| `arrow.down.circle` (attachment) | `arrow_circle_down` | 20 dp | note attachment Download | "Download" |
| `photo` | `image` | 22 dp | image attachment not loaded yet | |
| `doc.questionmark` | `unknown_document` | 56 dp | "Can't open this session" | |
| `eye` (memory picker) | `visibility` | 17 dp | preview a saved session from the composer's memory picker | "Preview" |
| `trash` (memory session bar) | `delete` | 24 dp | delete a session memory | "Delete session" |
| `folder.fill` | `folder` (fill) | 20 dp | folder browser path bar | |
| `folder.badge.questionmark` | `folder_limited` | 56 dp | "Can't open that folder" | |
| `exclamationmark.triangle` (largeTitle) | `warning` | 39 dp | "Couldn't load configuration" | |
| `lock` (largeTitle) | `lock` | 39 dp | "Not available for this project" | |
| `square.and.arrow.up` | `ios_share` | 24 dp | file preview toolbar share (`ShareLink`) | "Share…" |
| `doc` (40 pt light) | `description` | 48 dp loading, 56 dp empty state | file preview loading, "Empty file", "No preview" | |
| `doc.questionmark` | `unknown_document` | 56 dp | "Couldn't open the file" | |
| `speaker.wave.2` / `stop.circle` (message) | `volume_up` / `stop_circle` | 18 dp | automation message read aloud / stop | "Read aloud" / "Stop reading" |
| `backward.end.fill` / `forward.end.fill` | `skip_previous` / `skip_next` (fill) | 30 dp | reader bar sentence skips, media notification | "Previous sentence" / "Next sentence" |
| `gobackward.15` / `goforward.15` | `replay` (mirrored for forward) with "15" drawn inside | 26 dp | reader bar skips on the Mac's clip | "Back 15 seconds" / "Forward 15 seconds" |
| `play.fill` / `pause.fill` (reader) | `play_arrow` / `pause` (fill) | 28 dp in a 46 dp circle | reader bar play / pause | "Play" / "Pause" |
| `xmark` (reader) | `close` | 22 dp | reader bar stop | "Stop reading" |
| `play.circle` (sample) | `play_circle` | 24 dp | Settings → Read aloud "Hear a sample" | |
| `waveform.badge.exclamationmark` | `graphic_eq` | 24 dp | "Your installed voices are all basic ones…" | |
| `arrow.clockwise` (service) | `refresh` | 17 dp | an ended service's Restart button and long-press Restart, "Reopened after lpm restarted" banner | "Restart <service>" |
| `stop.fill` (service menu) | `stop` (fill) | 24 dp | a service's long-press Stop | |
| `exclamationmark.triangle.fill` (footnote) | `warning` (fill) | 15 dp | "An action couldn't be loaded" notice | |
| `terminal` / `sparkle` (New Tab) | `terminal` / `auto_awesome` (fill) | 16 dp on a 28 dp tile | New Tab "Terminal" and agent rows (no single four-point sparkle in Material Symbols) | |
| `clock.arrow.circlepath` (agents) | `history` | 22 dp menu and row, 56 dp empty state | "Resume Session…", "Resume a Past Session…", "No Past Sessions" | |
| `arrow.triangle.branch` (session row) | `call_split` | 1 em, inline | a past session's branch in Resume Session | |
| `folder` (Files) | `folder` | 22 dp menu, 56 dp empty state | "Files", "Empty Folder" | |
| `folder.fill` / `doc` (Files rows) | `folder` (fill) / `description` | 24 dp | Files folder and file rows, Go to File results | |
| `eye` / `doc.on.doc` (Files menu) | `visibility` / `content_copy` | 22 dp | a Files row's long-press Preview, Copy Path, Copy Relative Path | |
| `calendar` | `calendar_month` | 24 dp row, 38 dp empty state | Stats "Weekly recap" row, "No agent work last week" | |
| `archivebox` | `archive` | 24 dp swipe, 22 dp menu | an agent row's swipe and long-press Archive | "Archive" |
| `envelope.open` / `envelope.badge` (agents) | `drafts` / `mark_email_unread` | 22 dp | an agent row's long-press Mark as Seen / Mark as Unread | |
| `terminal` (agent menu) | `terminal` | 22 dp | an agent row's long-press Open | |
| `chevron.down` / `chevron.up` (caption2) | `keyboard_arrow_down` / `keyboard_arrow_up` | 17 dp | "N more seen" / "Show fewer" under a project's agents | |
