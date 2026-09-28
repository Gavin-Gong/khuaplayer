# Privacy policy

Effective date: September 28, 2026

Khua does not use advertising SDKs or accounts and does not collect playback
analytics. It does not transmit playback files, playback history, subtitles,
or language preferences to Khua. Its runtime media stack is built without
network protocol support. Runtime network activity includes system-managed
language-model downloads and the channel-specific update checks described below.
Starting with version 0.6.1, the official direct-download build also measures
update-check activity through those existing requests.

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

## Update-check statistics

Starting with version 0.6.1, an existing update check to the official feed also
sends a randomly generated installation identifier. It is stored in this app's
local preferences, not derived from hardware, an account, an advertising ID,
or media files, and is not stored in Keychain or synchronized through iCloud.
The updater already sends the app version in its User-Agent header. Together,
these fields let us count an installation once per UTC date and understand
version adoption. There is no analytics SDK, extra heartbeat, additional
request, or increase in update-check frequency.

This is pseudonymous installation-level statistics, not fully anonymous data:
the random identifier can link update checks across days. The statistics
database stores only a SHA-256 hash of that identifier, a UTC date, and the app
version. It does not store raw identifiers, IP addresses, full User-Agent
strings, exact request times, hardware identifiers, media details, or playback
events. We do not use this data for advertising or combine it with other
services' user profiles. An installation is not necessarily one person;
resetting preferences or restoring a backup can affect the counts.

Installation-level records are kept for a rolling window of 30 UTC dates and
pruned by a daily job. Aggregate daily counts without installation identifiers
may be retained longer. Cloudflare's operational processing and disaster-recovery
backups have separate provider-managed retention; deleting records from the
live database does not instantly remove every backup. Worker application logs
omit identifiers, and query strings are redacted in Worker observability.

There is no separate statistics setting or permission dialog. Automatic update
checks remain enabled by default and can be disabled using the existing App
menu setting. With automatic checks off, a manual **Check for Updates** still
contacts the feed and sends the same statistics fields. No update check means
no statistics request. Other distributors' feeds and Mac App Store builds do
not participate in this official-channel mechanism. Statistics failures do not
prevent the app from checking for or downloading updates.

If a future version adds purchases, network playback, crash reporting, or any
other data processing, this policy and the relevant store privacy disclosure
must be updated before that version is distributed.
