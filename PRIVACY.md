# Privacy policy

Effective date: September 28, 2026

Khua does not use analytics, advertising SDKs, accounts, or telemetry,
and it does not transmit playback files, playback history, or language
preferences. Its runtime media stack is built without network protocol support.
Optional runtime network activity includes system-managed language-model
downloads and the channel-specific update check described below.

Media files are opened only after an explicit user action, such as selecting a
file, dropping a file onto the app, or opening it from Finder. Playback resume
positions and language preference are stored locally in macOS user defaults.
Screenshots are written only to a location explicitly selected in the system
Save panel. The Mac App Store build uses App Sandbox access limited to files
selected through system Open and Save panels.
The **Clear All History** command removes playback positions and recent-file
history managed by the app and the system.

On supported macOS versions, subtitle generation and translation use Apple's
on-device speech and translation services. Khua does not upload the selected
media or subtitle text to a Khua server. macOS may download required language
models through its system services; those downloads follow Apple's prompts and
system settings. No microphone recording is used. Generated or translated
subtitles are written to a user-selected output location. Intermediate work and
save-recovery data remain local, and deleting playback history does not delete
subtitle files the user has saved.

The build scripts download checksum-pinned open-source dependencies when a
developer compiles the app. That build-time activity is separate from the
runtime application.

Non-App-Store builds contain optional software-update support. Unless a
distributor supplies both an appcast URL and an EdDSA public key at build time,
the updater remains inactive and makes no request. When configured, Sparkle may
contact that appcast automatically by default or after a manual check. Automatic
checks can be disabled from the App menu. System profiling is explicitly
disabled, and no playback files, history, or language preference are added to
the request. As with any network connection, the feed host can observe ordinary
transport metadata such as the requesting IP address. Mac App Store builds
exclude Sparkle and update only through the store.

The official direct-download channel enables this configuration starting with
version 0.6.0. Its signed update feed is hosted at `khua.app`, and update packages
are served from `downloads.khua.app`. Cloudflare provides website, feed, and
download hosting and may process ordinary request metadata to deliver and
protect these services. The website does not add analytics or advertising
scripts. Its language choice is stored in the browser's local storage.

If a future version adds purchases, network playback, crash reporting, or any
other data processing, this policy and the relevant store privacy disclosure
must be updated before that version is distributed.
