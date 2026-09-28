# Khua

Khua is an open-source, native video player for Apple Silicon Macs. It
combines VideoToolbox decoding, a Metal rendering pipeline, and a deliberately
small FFmpeg fallback build for broad local-file support without a Homebrew
runtime dependency.

The project currently targets arm64 Macs running macOS 14 or later. Building
requires Xcode with the macOS 26.4 SDK or later. Subtitle generation and
translation require macOS 26 at runtime; basic playback still supports macOS 14.
Motion+ also requires macOS 26 and a device supporting system frame-rate conversion.

## Highlights

- Native Metal video rendering with IOSurface-backed zero-copy paths
- VideoToolbox hardware decoding with a minimal FFmpeg/dav1d fallback
- MKV, MP4, MOV, WebM, AVI, MPEG-TS, FLV, WMV, and common audio containers
- HDR/EDR presentation, color conversion, and HDR-to-SDR tone mapping
- Native multichannel audio output and A/V synchronization through AudioUnit
- On-device subtitle generation and translation on supported macOS 26 systems
- Optional EDR enhancement for SDR video on compatible displays
- Motion+ adaptive frame interpolation and hold-to-compare preview
- Best-effort recovery and content mapping for damaged or incomplete downloads
- Particle Star Trail, Liquid, and Classic timelines
- Embedded and external text subtitles rendered with libass
- Finder document associations and a Quick Look preview extension
- Per-format controls for making Khua the default video or audio player
- Interface localization for 17 languages

## Build

Install the build tools once:

```bash
brew install xcodegen meson ninja cmake pkg-config
```

Build the application:

```bash
./Apps/Mac/Scripts/build.sh          # Debug
./Apps/Mac/Scripts/build.sh Release  # optimized local build
```

Run these commands from the repository root. `Scripts/build.sh` remains a
compatibility entry point with the same arguments and environment settings.
The Mac project definition is [`Apps/Mac/project.yml`](Apps/Mac/project.yml);
the build generates `Apps/Mac/KhuaPlayer.xcodeproj`. Edit the definition, not
the generated Xcode project.

The first build downloads checksum-pinned dependency source archives, builds
them with the macOS SDK toolchain, generates the Xcode project, packages the
runtime libraries, signs the app ad hoc, and verifies its Mach-O dependency
closure. Subsequent builds reuse validated dependency stamps.

Run the app, optionally opening a local media file through the macOS document
open event:

```bash
./Scripts/run.sh
./Scripts/run.sh /path/to/video.mkv
```

The generated app is located at
`.build/Build/Products/<configuration>/Khua.app`. Release builds also deploy
the verified app to `Khua.app` at the repository root; Debug builds leave that
copy unchanged. Both locations are ignored by Git. Local Release builds are
still ad-hoc signed, not distribution-ready artifacts.

## Repository scope

This repository contains the shipping application source and the reproducible
build and packaging recipes. Large media fixtures, benchmark suites, internal
experiments, generated Xcode projects, dependency build trees, and caches are
intentionally excluded.

Editable Icon Composer source and the deterministic static AppIcon export live
in [`Design/AppIcon`](Design/AppIcon).

The directory layout separates the Mac product, reusable-source candidates,
and platform implementations. See [REPOSITORY_LAYOUT.md](REPOSITORY_LAYOUT.md)
for ownership and build entry points. iPhone and iPad support is planned;
only the Mac product currently builds, and no mobile app target is included.

## Distribution

Local builds use ad-hoc signing. Developer ID releases and App Store archives
use separate, fail-closed signing configurations; see
[RELEASING.md](RELEASING.md). Release identity, version, bundle identifier, and
Apple Developer Team values must be supplied explicitly by the distributor.
The primary direct download is a signed, notarized, and stapled DMG with an
Applications shortcut. Generated apps, DMGs, ZIPs, archives, and symbols stay
outside Git history and are published through the release host.

Direct-distribution builds contain configuration-gated Sparkle support. Without
both `KHUA_SPARKLE_FEED_URL` and `KHUA_SPARKLE_PUBLIC_ED_KEY`, the updater does
not load, create a menu item, or make a network request. App Store builds omit
Sparkle and its configuration entirely. Configured direct builds check
automatically by default and expose an App-menu toggle to disable that behavior.

## Privacy and licensing

The application does not collect or transmit playback data. See
[PRIVACY.md](PRIVACY.md) for the current behavior.

Khua source is available under the [MIT License](LICENSE). The media and
subtitle libraries retain their own licenses; see
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) and
[`ThirdParty/Licenses`](ThirdParty/Licenses). Distributors are responsible for
satisfying all third-party license obligations.
