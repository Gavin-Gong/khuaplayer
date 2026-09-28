# Khua Website Design QA

## Evidence

- Source visual truth: `reference/final-design.png` (853 × 1844).
- Final implementation: `qa/current-full-page-final.png` (1440 × 4801).
- Focused Hero implementation: `qa/current-hero-final.png` (1440 × 900 CSS px at device scale 1).
- Full-view comparison: `qa/visual-qa-final.png` (3693 × 4897).
- Focused typography comparison: `qa/visual-qa-hero-final.png` (2912 × 996).
- Responsive matrix: `/tmp/khuaplayer-hero108-qa-20260902/hero-{en|zh}-{1440|1100|900|768|390|320}.png`.
- Browser-rendered implementation: `http://127.0.0.1:5173/`.

Paths above are relative to `Website/` unless an explicit temporary path or URL
is shown. Generated QA screenshots are local evidence and are not committed.

## Normalization and state

- The focused comparison crops the reference to 853 × 533, normalizes it to 1440 × 900, and places it beside the implementation's 1440 × 900 Hero with a 32 px divider and 96 px label bar.
- The full-view comparison proportionally scales the source to 2221 × 4801 beside the 1440 × 4801 implementation, with the same divider and label treatment.
- Primary comparison state: English, 1440 × 900, paused motion, no focused control.
- Responsive states: English and Simplified Chinese at 1440, 1100, 900, 768, 390, and 320 px widths.
- The user's latest feedback intentionally supersedes the reference's ultra-heavy condensed face: the desired target is now a larger, lighter, international editorial treatment while preserving the particle-led composition.

## Final findings

No actionable P0, P1, or P2 findings remain.

- Fonts and typography: English display text uses Funnel Display Variable at weight 340, `-0.055em` tracking, and a 10.8vw desktop Hero scale. The Hero is deliberately split into three balanced lines: `A MEDIA PLAYER / BUILT FOR / EXTREME SPEED.` Chinese remains on the macOS PingFang stack at weight 500. Body and interface labels remain IBM Plex Sans and IBM Plex Mono.
- Spacing and layout rhythm: the enlarged Hero fills substantially more of the first screen without colliding with the header, icon, description, CTAs, compatibility line, or scroll cue. Feature, metric, privacy, open-source, closing, and footer sections retain their established grid and vertical rhythm.
- Colors and visual tokens: bone white, near-black, cobalt/cyan, vermilion registration marks, and foreground/background contrast are unchanged from the approved visual direction.
- Image quality and asset fidelity: the supplied Khua app icon remains a sharp source asset with the existing shadow and crop. No visible source asset was replaced by a code-drawn approximation. Particle fields remain live Canvas artwork and keep the existing motion language.
- Copy and content: the `EXTREME SPEED` wording is preserved; only visual line breaks changed. English and Chinese content, navigation, CTA text, privacy message, open-source message, and 20 MB claim remain intact.
- Responsiveness: all twelve bilingual viewport states have `scrollWidth === clientWidth`. H1 lines stay within the viewport and do not intersect the header, icon, or CTA group. Desktop uses three lines; 390 and 320 px naturally reflow to five lines.
- Interaction and accessibility: language switching updates visible copy, document title, and `html lang`. Motion pause/play updates its accessible label and `aria-pressed` state. Controls remain visible and clickable.
- Runtime quality: browser QA found zero console errors, zero console warnings, and zero page errors. The production build and all four Sites worker tests pass.

## Comparison history

### Pass 1 — failed

- [P1] Anybody Variable remained visually too condensed and utilitarian, so the enlarged type still read as a generic commercial poster rather than a contemporary international product identity.
- [P1] Keeping the full English sentence on two lines limited the practical type scale and left less deliberate negative space around the app icon.

Fixes:

- Compared Hubot Sans, Funnel Display, and Bricolage Grotesque in the rendered Hero.
- Selected Funnel Display for its cleaner geometric construction and lighter editorial voice.
- Increased the desktop Hero from 9.4vw to 10.8vw, reduced the display weight to 340, tightened tracking, and changed the English composition from two lines to three.
- Repositioned and slightly resized the app icon so the type remains the dominant element.

### Pass 2 — passed

- Focused side-by-side inspection confirms that the Hero has materially more scale and presence while remaining lighter and cleaner than the reference's heavy condensed treatment.
- Full-page inspection confirms the new face improves the hierarchy consistently across performance, size, privacy, open-source, and closing sections.
- The complete bilingual responsive matrix has no overflow or functional collisions.

## Follow-up polish

- [P3] At 1440 px, the end of `EXTREME SPEED.` and the app icon retain a measured 7 px gap. This deliberate near-touch increases tension without creating a collision.
- [P3] On some narrow widths, the low-opacity decorative icon shares geometric space with the scroll cue or CTA region. It remains behind the content and does not reduce legibility or clickability, so it is intentionally retained.

final result: passed

## Pass 3 — typography and copy refresh (2026-09-02)

Supersedes the Funnel Display findings above.

- Display type moved to Inter Tight Variable (weight 560, `-0.05em` tracking, sentence case) with one Instrument Serif italic accent word per headline. Chinese display stays on PingFang SC at weight 600 with the accent word in Songti SC. Body moved to Inter Variable; IBM Plex Mono is limited to eyebrows, indices, and compatibility lines.
- Removed the boxed vermilion eyebrow badges, the all-caps mono buttons, the hard black header rule, the `SILICON / SILICON` rail word, and the clipped rotated hero icon. Buttons are pills; the hero icon is fully visible, upright-ish, top right.
- Section palette: paper hero, ink speed section, paper formats and size sections, navy-to-cobalt privacy gradient, paper open-source section, bright-paper details grid, cobalt closing.
- New sections: Formats (large format-token row) and Details (six everyday features). Copy rewritten in both languages for a non-technical reader; no competitor names, benchmarks, or gated experimental features.
- Verified: English and Simplified Chinese at 1440, 1100, 900, 768, 390, and 320 px have `scrollWidth === clientWidth`; zero console errors or warnings; production build and Sites worker tests pass.

## Pass 4 — built-in macOS typography, performance diagram, Quick Look section (2026-09-02)

- All web-font packages removed. Display: Helvetica Neue Bold; accent: Bodoni 72 Book Italic; body: Charter; UI and labels: Helvetica Neue Medium; mono only for diagram tags. Chinese: PingFang SC with Songti SC Black accents.
- Performance section gained a two-route pipeline diagram (usual route vs Khua: VideoToolbox → Metal/IOSurface → screen) rendered in HTML/CSS and localized.
- New Quick Look section after Formats with a window-framed screenshot placeholder; the "Previews in Finder" detail card was replaced by "More than one at a time".
- Removed every "free" claim from the copy; open-source wording no longer promises that every line is public.
- Verified: both locales at 1440/1100/900/768/390/320 px without horizontal overflow; zero console issues; build and Sites tests pass.

## Pass 5 — diagram fact check (2026-09-02)

- The performance diagram now shows four layers on the Khua side: file, Khua, Metal · VideoToolbox, Apple silicon. Khua is no longer drawn as the only layer between file and chip; the Apple frameworks it calls are drawn as their own thin slab. Caption: "Between Khua and the chip there is nothing but Metal and VideoToolbox."
- Ghost stack label changed from "Layers of software in between" to "Extra layers in between" (Khua is software too). Title changed to "A typical stack".
- Performance copy qualified: hardware decoding applies "wherever the format allows", since FFmpeg/dav1d software fallback exists.
- File slabs are now opaque so slabs beneath no longer show through; leader lines start at the slab edge; both stacks share the same top edge and chip baseline in both locales.

## Pass 6 — hero, size, Quick Look wording, performance column (2026-09-02)

- Hero headline is now "Built for speed, from the ground up." / "为速度而生，从第一行代码起。" ("A media player" moved to the eyebrow and page title).
- App size demoted: removed from navigation, hero copy, and metadata; the size section leads with "Complete. Nothing extra.", a large "0" beside "plugins · codec packs · accounts", and a single small "About 20 MB today" note.
- Chinese Quick Look term corrected to Apple's "快速查看".
- Performance right column: the full-height divider became the column's own left border with clamp(1.75rem, 3vw, 3rem) of padding, so text no longer touches the line.

## Pass 7 — hero restored, size visual simplified (2026-09-02)

- Hero headline restored to "A media player built for speed." / "为速度而生的多媒体播放器。" so first-time visitors immediately know what the product is.
- Size section visual is now the app icon alone with the caption "One app. That's the whole install." / "一个应用，就是全部。"; the "0 plugins / codec packs / accounts" idea was dropped as confusing (codecs ship inside the app; accounts belong to the privacy story). Headline: "All you need. Nothing extra." / "该有的都在，没有多余。"

## Pass 8 — lightweight section reframed (2026-09-02)

- Dropped the icon-with-caption visual ("One app. That's the whole install." says nothing a Mac user does not already assume). The section now uses the standard two-column layout with the compact particle field as its only visual.
- New claim, checked against the codebase: nothing of Khua runs when it is closed (no helper apps, no menu bar agents, no background updater; Sparkle runs only inside the app in direct builds), decoding runs on the media engine rather than the CPU where formats allow, and the download is small. Headline: "Quiet when closed. Light when open." / "关掉即静，打开也轻。" Size remains a single small "About 20 MB today" note.

## Pass 9 — subtitle wording (2026-09-02)

- Every mention that could read as "downloads subtitles for you" was rewritten to say Khua loads embedded subtitles and subtitle files already next to the video, and explicitly that it never downloads any. Affected: hero description, formats description, and the detail card (now "Your subtitle files, loaded for you" / "旁边的字幕文件，自动加载").

## Pass 10 — motion polish (2026-09-02)

- Scroll parallax via `data-parallax`: hero icon lags at 0.22 of scroll speed, closing icon at 0.16, registration marks at ±0.08–0.12, the two layer stacks split slightly (-0.05 / 0.07). Offsets are written to `--py` inside a rAF scroll handler and cleared when motion is paused or reduced.
- Hero icon tilts up to about ±5° toward the pointer on fine-pointer devices.
- Headline lines reveal 90 ms apart; format tokens reveal 28 ms apart.
- Film-grain overlay (SVG turbulence, multiply, 5.5% opacity) over the whole page; hidden under forced colors.
- Button and link arrows nudge up-right on hover; download icons nudge down.
- Verified: no console errors, parallax values respond to scroll and pointer, both locales still free of horizontal overflow, build and Sites tests pass.

## Pass 11 — hero copy drift (2026-09-02)

- The hero copy block now drifts up at 0.1 of scroll speed and fades with an ease-in curve over the first 60% of the viewport height, via `--hero-shift` / `--hero-fade` set in the same rAF handler as the parallax. Cleared under reduced motion or when motion is paused.

## Pass 12 — body font (2026-09-02)

- Body copy moved from Charter to the system font (SF Pro Text). Charter read as bookish and default; SF unifies body with navigation and buttons so the page has two voices: Helvetica Neue Bold display with Bodoni italic accents, and SF for everything else. Sizes trimmed slightly (clamp 1.02–1.16rem, line-height 1.6). Iowan Old Style recorded as the serif alternative.

## Pass 13 — rotating hero word (2026-09-02)

- The hero accent is now a rotating slot: `RotatingWord` stacks every candidate in one grid cell, measures each at max-content width on a two-pass rAF, then animates the box to the active word's width so the trailing period stays tight against the word. Outgoing word rises and fades, incoming rises into place.
- Rotation stops and resets to the first word when motion is paused, under `prefers-reduced-motion`, or when the hero scrolls out of view. The `h1` carries an `aria-label` of the canonical sentence and the rotator is `aria-hidden`, so assistive tech reads one stable headline.
- Width was measured in-browser at 1440/1280/1100/950/800 px before any word was chosen. The line is nowrap down to 760px and must clear the app icon: usable width is 1097px at 1440px and 578px at 800px, against 825px for "built for speed." at 1440px.
- Verified: no console errors; no horizontal overflow at 1440/1100/900/768/390/320 in both locales; Chinese two-character words hold a constant 219px box, so the Chinese line never shifts.
- Mobile layout defect found and fixed during verification: below 600px the longer words wrapped, adding a line and changing the headline height by 41-76px as the word rotated. The run before the rotating slot now becomes its own line under 760px (`.before-rotator`), so the headline holds a constant height for every word at 1440/900/768/600/430/390/320 in both locales. Chinese was already stable because CJK glyphs are fixed width.
- Every word was re-measured with the width transition disabled; the earlier pass had been reading mid-animation and reported identical widths for all words.


## Pass 14 — rotating word set settled (2026-09-02)

Three scoring rounds, 98 agents. Shipping set: English `["speed", "one job"]`, Chinese `["速度", "从容"]`.

Measured means (three judges per word, 1-10, 5 = acceptable, 8 = earns the italic):
speed 7.0, 从容 6.8, 速度 6.7, one job 6.0 (unanimous, no judge below 6), clarity 6.0, 观影 5.7,
干净 5.3 (one judge at 3), calm 5.0, 画面 5.0, 专注 5.0, focus 5.3, stillness 4.7, 流畅 4.7, fluidity 4.3.

Cut for reasons other than score: `clarity` and `清晰` are the display industry's terms for picture
enhancement, which shipping builds compile out; `fluidity` and `流畅` duplicate copy that already
exists ("stays smooth through 4K and HDR" / 「4K 与 HDR 依然流畅」) and 流畅 is also the bottom rung of
the 流畅/标清/高清/超清 picker; `MKV`, `4K`, `HDR`, `quiet`, `安静`, `the chip` and `轻量` all appear
elsewhere in the copy, `MKV` in the hero body one line beneath the slot.

Two rounds were discarded as unsound before this one. The first panel rejected 36 of 40 candidates on
register and produced zero survivors, so its five recommended words had never passed its own gates.
The second replaced four of six shipping words with editor suggestions that were never scored; the
synthesizer said so in its own residual-risk note. Only words with real measured means ship.

Known weaknesses, accepted rather than solved: neither companion scored above 7, so by the rubric
neither "earns the italic"; all three judges reported "you had one job" as the first flicker on
`one job`; two of three read `从容` as 不慌不忙, which sits above 「双击文件，立刻播放」. The English and
Chinese sets now argue different second ideas. Cutting `quiet` from the hero body would reopen the
calm family for both languages; rewriting the hero body's format list would free `MKV`, the only
concrete high-intent word available.

## Pass 15 — rotating words chosen for meaning, layout tuned to fit

The author's direction: pick the words that describe the app best and adjust the design to fit them,
rather than choosing words by width. Shipping set: `speed → responsiveness → fluidity → efficiency →
performance` and `速度 → 迅捷 → 流畅 → 效率 → 性能`. Each word names one facet of performance: opens
instantly, reacts instantly, stays smooth through 4K/HDR, leaves the CPU and battery alone, and the
umbrella word last. `efficient` was rejected as an adjective; `efficiency` is the noun. 迅捷 stands in for
responsiveness because 为响应而生 reads as "born to answer a call"; 即时响应 is the literal alternative
and also fits, but breaks the two-character rhythm.

Two layout changes make the longest word fit without shrinking the headline noticeably:

1. The hero icon moved out of the headline band. It now sits at the bottom-right of `.hero-copy`
   (inside a new `.hero-copy-motion` wrapper so it does not inherit the copy's scroll fade), aligned
   with the button row. Previously it occupied the top-right and capped the second line at 1174px on
   a 1440 viewport; the copy's own right edge is 1375px.
2. The headline went from `10vw / 10.4rem` to `9.6vw / 9.6rem` (and 9.6–9.7vw at the 1100 / 900
   breakpoints), a 4–8% reduction, and the cap keeps `responsiveness` inside the 92rem copy width on
   1920-wide screens, which the old cap did not.

Verified with `verify5.mjs`: every word at 1920, 1680, 1440, 1280, 1100, 950, 800, 768, 600, 430,
390 and 320 in both locales, forced one at a time with transitions disabled; no document overflow,
period never past the copy edge (tightest: `responsiveness` at 800px, 755/764), no intersection with
the icon, constant h1 height across words at every width, zero console errors. `npm run build` and
`npm run test:sites` (4/4) pass.

## Pass 16 — a battery word was explored, not shipped

The author asked which word could carry "low power draw" in both languages. Measured and drafted
`battery life` / `续航` into the rotation in place of `efficiency` / `效率`, then reverted both at the
author's request: the swap had not been asked for, and the phrasing was not good. The shipping set is
unchanged from pass 15. A brief edit to the Performance body that named the battery explicitly was
reverted with it.

Findings kept for the next attempt. Width is not the constraint: `battery life`, `endurance`,
`longevity` and `stamina` are all narrower than `responsiveness`, which remains the binding word, and
every two-character Chinese option fits. The constraint is register. `battery life` is prosaic and
consumer-electronics in the Bodoni italic; `endurance` and `stamina` are athletic metaphors that
leave unclear what is enduring; `power efficiency` is long and duplicates the word it would replace;
`all-day battery` promises a duration nothing on the page measures. In Chinese `省电` is verb-object
and reads as appliance advertising inside 为X而生, `低耗` is not idiomatic alone, and `能效` is the
appliance energy-rating term — narrower and more accurate about energy than the shipping `效率`,
which reads as general efficiency.

Whatever word eventually ships, the page already carries its justification one sentence into the
Performance body — decoding on the chip's media engine instead of the CPU — qualified by "Wherever
the format allows", which matters because the software decode path has no power advantage.

## Pass 17 — resilient playback, on-device subtitles, Particle Star Trail

The app gained three headline features in 0.3.0–0.4.0, and the author asked for them to be emphasized.
Every claim was checked against the source before it was written:

- Resilient playback: `Modules/MediaCore/Core/SPResilience.hpp`, `SPContainerRecovery.hpp` and the
  per-container planners under `Recovery/` repair structure through a read-only byte overlay (the file is
  never modified), damage evidence becomes timeline bands (partial / none / pending), and the UI strings
  cover waiting for a trailing index, stalled downloads, and plain-language failure reasons. The copy is
  best-effort throughout: "plays everything that can be played", never "plays every broken file".
- Subtitles: `Modules/Captions` uses `SpeechTranscriber` (SpeechAnalyzer) and `TranslationSession`, all
  `@available(macOS 26.0, *)`; translation is interleaved with transcription and bilingual cues publish
  per sentence, translation above the original (`CaptionSRT.swift`). PRIVACY.md confirms on-device
  processing and system-managed model downloads, so the section carries that footnote. The Formats line
  "nothing is ever downloaded" became "Khua never downloads subtitles" so it stays true next to it.
- Particle Star Trail: ported `SPDustLayer.swift` to Canvas 2D (`src/StarTrail.jsx`): stratified grains,
  persistent rail, suspended unplayed side, settling front with a crest, exponential-plus-Gaussian pointer
  profile, additive halos, max blending, bloom-in of sampled colors, damage tints. Liquid and Classic
  follow `SPProgressView` (4pt rail, 7pt on hover, Gaussian bulge σ15 / amp 5, knob 15pt), drawn at
  player scale rather than the particle zoom.

Chinese naming for "resilient playback": 韧性播放. It is the faithful, dignified term and pairs with a
plain headline (文件坏了，照样往下播). Rejected: 容错播放 (server-engineering register), 顽强播放 (comic),
能播尽播 (exact meaning of best-effort, but echoes 应检尽检-style slogans). The familiar 边下边播 is used in
the body for the still-downloading case.

Two pre-existing CSS defects surfaced while checking phone widths, and both were fixed: the ≤900px rule
that collapses `.feature-grid` to one column had been merged into the headline font-size rule, so every
feature section rendered as a 0px + 256px two-column grid on phones; and `.locale-zh .locale-zh
.details-heading h2` (three places) could never match, so the Chinese Details heading used the Latin
display settings.

Verification: no horizontal overflow or clipped labels at 1920 / 1440 / 1280 / 1100 / 900 / 768 / 600 /
430 / 390 / 320 in either locale; English nav hidden ≤1280px and never overlapping the header actions
above it; zero console errors; the demos draw a still frame under reduced motion and after the pause
control, stop requesting frames once settled, and still respond to hover.

## Pass 18 — resilience legend corrected

The author caught that the resilience card contradicted the Star Trail section: it drew the timeline in
white and listed a white "正常播放" swatch, while the app keeps the video's colors and only tints damaged
spans (`SPDustLayer.swift` mixes amber / red over the film color; `SPChrome.swift` shows the hover
labels 勉强可播 / 没有内容; healthy files pass no bands). Fixed: the card now uses film colors (a cool
night palette to match `kyoto-by-night.mkv`, so no scene can be mistaken for damage), the legend keeps
only the app's two named classes, and the gray span is described in a sentence because the app draws it
without a label.

## Pass 19 — Quick Look illustration

The screenshot placeholder is replaced by a drawn illustration (`src/QuickLookDemo.jsx`), in the site's
own style rather than a pixel copy of macOS: a Finder window with `kyoto-by-night.mkv` selected, a Space
keycap that presses once, and the Quick Look panel scaling out of the selection and playing the same
night scene used by the resilience demo. The panel's controls follow the extension's real layout in
`Apps/Mac/QuickLook/Preview/PreviewControlsView.swift` (play, back 10, forward 10, position, slider,
duration). Finder strings use macOS's own Chinese names (个人收藏, 桌面, 下载, 影片, 文稿; 用“Khua”打开).
On phones the sidebar and three files hide, the two windows stack, and the skip buttons drop out.

## Pass 20 — refined particle rendering (hero only, for review)

`ParticleField.jsx` gains a refined renderer, enabled only for `mode="hero"` through `REFINED_MODES`
so the author can compare before rolling it out. It adds three depth layers (far 50%: small, faint,
soft, slow; mid 38%; near 12%: large, bright, fast), each with its own speed and its own scroll and
pointer parallax; a life envelope so particles fade in and out instead of popping; brightness tied to
speed; tails tapered in two segments; and soft round heads drawn from pre-rendered radial sprites
along a continuous cobalt-to-cyan ramp (vermilion accents kept at ~1.5%). Frame rate in the headless
check is unchanged (51.5 fps against 52 before). Reduced motion and the pause control still draw a
settled still frame. Other modes render exactly as before.

Rolled out to every particle field after review (the old streak renderer is removed). Parallax now
reads each canvas's own position rather than the page scroll, so lower sections do not shift off;
path-following fields (privacy, open source, closing) also get per-layer speed. Dark and blue sections
draw additively with a brighter periwinkle-to-ice ramp, 1.55× alpha, 1.3× glow and stronger tails,
because cobalt particles all but vanished on the blue ground.

## Pass 21 — one particle field for the whole page

The author found the page incoherent: some sections had particles and some had none, seven unrelated
backdrop drawings, and the ∞ figure twice (Formats and Open source). Now every section carries the same
particle material, each as a local shape with a meaning: hero streams out of the app icon; Performance
bursts from the chip; Resilience, Subtitles, Star Trail, Quick Look and Details carry a sparse ambient
drift (62% alpha, 240 particles, no corner crosses) so the demos stay the focus; Formats runs seven
parallel strands; Light by design converges to a point; Privacy is held inside a circle; Open source
releases outward (replacing the second ∞); the close is a vortex. All pre-drawn dashed line motifs are
gone; only the chip core and the convergence point keep a drawn glow.

## Pass 22 — performance diagram, fact-checked

The author asked whether the two-stack diagram was accurate. It was not, in two ways: the ghosted
"usual stack / layers of relays" implied other players are slower, which is unverifiable and a
competitor comparison by implication; and the caption "only Metal and VideoToolbox between Khua and the
chip" ignored the FFmpeg/dav1d software path and macOS's own driver layers. Now there is one stack for
Khua Player's own path, with the file as a flat card rather than a fake software layer, and a glowing
zero-copy band. Zero copy is verified in source: decoders output IOSurface-backed pixel buffers and
`SPMetalRenderer.mm` wraps them with `CVMetalTextureCacheCreateTextureFromImage`; the software path also
writes into IOSurfaces. Labels are one or two words so they fit at 320px; the caption explains.

## Pass 23 — Boosts: Motion+, Brightness+, Turbo

New dark section after Resilient playback, with before/after demos in `src/BoostDemos.jsx`. Motion+
renders one panning night street twice, the left half sampled at 24 fps and the right at 48, split like
the app's hold-C compare (same labels); frame ticks along the bottom mark original frames white and
generated frames cyan so the idea survives a screenshot or reduced motion. The moon was removed from
that scene because it fell only in the right half and read as "brighter" rather than "smoother".
Brightness+ is a draggable split of the shared Kyoto footage, labeled an illustration. Turbo plays the
footage with the app's HUD; the keycap can be pressed and held with a mouse or finger, and otherwise
the demo alternates normal and held every 2.8 s. Turbo and Brightness+ left the Details grid, which
gained frame stepping (, and .) and screenshots (S). Sections were reordered to keep dark and light
alternating; the English nav (nine labels) now hides below 1400px.
