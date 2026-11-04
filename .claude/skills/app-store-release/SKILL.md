---
name: app-store-release
description: "Release the latest lpm Link iOS build on App Store Connect (appstoreconnect.apple.com) through Chrome: first suggest the What's New text for the user's OK, then upload a build with mobile/ios/deploy.sh when needed, add the new version, attach the newest build, save What's New, refresh the screenshots (app-store-screenshots) and review video (app-review-video) when they're stale, then submit for review. Use when the user asks to release, ship or submit lpm Link / the iOS app to the App Store."
version: 1.1.0
argument-hint: "[--upload] [--screenshots] [--video]"
metadata:
  lpm-created: "true"
---

1. **What's New first.** Before opening Chrome or uploading anything, draft the release notes:
   - Live version: `curl -s 'https://itunes.apple.com/lookup?bundleId=cx.lpm.mobile'` → `results[0].version`. The lookup can lag a few hours after a release; if App Store Connect later shows a newer live version, redraft.
   - The commit that set it: `git log --reverse --format=%h -S'MARKETING_VERSION: "<live>"' -- '*project.yml' | head -1` (the `*` matters: `project.yml` moved from `mobile/` to `mobile/ios/`).
   - Changes since then: `git log --oneline <commit>..HEAD -- mobile ':!mobile/android' ':!mobile/parity'`.

   Write 3–6 short bullets of user-visible changes with no commit jargon and no mention of Tailscale. Show them to the user and wait for their OK or edits before going on.

Then use Claude in Chrome on the user's logged-in Chrome, starting at `https://appstoreconnect.apple.com/apps` → **lpm Link**.

2. **Build.** Open TestFlight and find the newest build. If it isn't from the current `mobile/ios` code, or the user passed `--upload`, run `mobile/ios/deploy.sh`. It bumps `MARKETING_VERSION` in `project.yml` (tell the user to commit that change), archives the app and uploads it. Reload until the build is no longer Processing, which takes about 5–15 minutes.
3. **Version.** On the Distribution tab, click **+** next to iOS App and enter the build's version. If a draft version already exists, use it instead.
4. **What's New.** Paste the text the user approved in step 1. If new user-visible commits landed since the draft, show the extra bullets first.
5. **Screenshots.** If the screens changed or the user passed `--screenshots`, run the `app-store-screenshots` skill and upload the images as its "After a run" step says. Otherwise keep the screenshots from the previous version.
6. **Build + review info.** In the Build section, pick the build from step 2. If pairing or the main flows changed or the user passed `--video`, run `app-review-video` and update App Review Information → Notes with the new version, build and video link. Keep Release set to the user's earlier choice. Leave everything else as it was.
7. **Submit.** Ask for the user's OK, then click **Add for Review** → **Submit to App Review**. Confirm the status reads "Waiting for Review". Report the version, build, What's New text and status.

Traps: `ITSAppUsesNonExemptEncryption` is false, so no export compliance question should come up. If one does, ask the user. Never press **Release** or change pricing or availability without the user's explicit request.
