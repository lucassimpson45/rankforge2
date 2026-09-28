---
name: goatedrank-ranking-short
description: Turns 4–5 social video links (TikTok, YouTube, Instagram) into a finished vertical ranking Short for the @goatedrank channel — "Ranking Best [KEYWORD] Moments", numbered 1–5 list that fills in as clips play, whoosh/impact/click SFX, hard cut with no outro. Uses the RANKFORGE2 pipeline (yt-dlp → ffmpeg normalize → mechanical highlight detection → ranking.json → Remotion → limiter → verify → delete clips). Use this whenever Lucas pastes video links and wants a ranking, top-5, countdown, "rank these", "best moments", RankFS-style, or goatedrank video — even if he only says "make one of those" or "another ranking short". Also use it for edits to an existing one (change the title, labels, cut points, SFX, watermark, text size, order).
---

# @goatedrank ranking Short

One command chain, one JSON of decisions, one MP4. The project lives at
`~/Desktop/PROJECTS/RANKFORGE2` and already has the scripts, the Remotion composition,
the fonts and SFX. Don't rebuild it — run it, edit `ranking.json`, re-run.

Lucas wants speed: do the whole thing in one turn, make the judgment calls yourself, and
report the decisions at the end so he can flip any of them. Send him the MP4 with
SendUserFile when it's done. He does not want a phase-by-phase play-by-play.

## The recipe (locked — "exactly how every video should be made", Lucas, 2026-09-19)

The instant-karma video (`references/canonical-ranking.json`) is the template. Every video:

1. **Five links → five slots**, reveal 5→1, strongest and most argument-worthy at #1, hard
   cut after #1. (Four links → slots 5–2 + bare #1 bait; only when he gives four.)
2. **7.0 s per slot** → 35 s total, inside 28–38 with no exceptions. Shorten only when the
   source segment physically can't give 7 s, and say so.
3. **The window contains the punchline.** Setup → payoff → a beat of aftermath, in that
   order, with the payoff ~60 % in. If a still shows only the aftermath (someone already
   wet / already on the ground), the window is wrong — walk it back until the fall, splash
   or hit is inside. Lucas sent v1 back for exactly this.
4. **Labels**: 2–3 punchy words + one emoji ("Kick Backfire 🦵", "Pond Payback 🦢").
5. **Title**: `Ranking Best [KEYWORD] Moments`, keyword red/yellow/blue.
6. **Crop every creator caption, handle, logo and compilation badge** with `zoom`/`anchor`
   (verify with a still per slot). If the action lives under the caption, move the clip to
   a row whose label clears it rather than zooming past ~1.35.
7. **SFX**: riser that ends on the first cut · **ding** on every reveal · whoosh+impact on
   every cut · **vine boom** on the two heaviest landings · **fahh** on the two comedic
   wipeouts · nothing on the fifth. Hit times come from the audio peak inside the window.
8. **No goat** unless he says so. No outro. Delete clips after.
9. Deliver the MP4 with the compact report; list the calls he might flip.

## The run

```bash
cd ~/Desktop/PROJECTS/RANKFORGE2
npm run ingest -- --cookies-from-browser chrome "<url1>" "<url2>" "<url3>" "<url4>" ["<url5>"]
npm run detect                     # RMS + scene-change windows, 3x3 contact sheets → work/sheets/
# read the sheets, write ranking.json (see below)
npm run finish                     # pre-cut slots → render → limiter master → verify → delete clips
```

If `ranking.json` has an `avatar` block, generate its voice lines first (cached, so it only
hits ElevenLabs for new text):

```bash
node --env-file=.env pipeline/voice.mjs
```

- `#t=1m23s` on a URL is a timestamp hint: detection is skipped for that clip and the
  window is anchored there.
- **One compilation link instead of 4–5 links** ("use the first four clips of this
  video"): ingest the single URL, find the clip boundaries with
  `ffmpeg -vf "select='gt(scene,0.4)',showinfo"` on `work/clip1.mp4`, contact-sheet each
  segment (import `contact_sheet` from `pipeline/detect.py`), and point every slot at the
  same `work/clip1.mp4` with different `in`/`out`. Segments are often shorter than 7 s;
  see Duration below.
  **Every slot must be one continuous shot** (Lucas, 2026-09-25: "u used two clips") — run
  scene detection at `gt(scene,0.08)` and keep each window between two real cuts; a camera
  angle change inside a window counts as two clips.
- **Burned-in compilation watermark** (e.g. "@SlickClips"): crop it with `anchor` if the
  payoff survives, otherwise add `"delogo": [{"x","y","w","h"}]` (source px) to
  `ranking.json` — top-level applies to every slot, per-slot overrides. `prep.mjs` runs
  ffmpeg `delogo` on the pre-cut. Measure the box on a full-res frame first.
- **TikTok ingest falling back to the "mobile API" or "embed" route** returns a copy with
  TikTok's bouncing watermark. Re-run ingest with `--force` until no route message prints.
- `npm run finish` deletes `work/raw` and `work/*.mp4` at the end. Lucas asked for this
  (laptop storage) — any re-render after that needs the ingest step again (~40 s).
- `npm run studio` opens Remotion Studio if a layout tweak needs eyeballing live.

## Hard rules (these are why the pipeline is shaped the way it is)

- **You cannot watch video.** Highlight picks come from `pipeline/detect.py` (audio RMS
  peaks + scene cuts) plus *looking at the contact sheet stills* in `work/sheets/`. Say
  what you saw in the stills; never claim to have watched footage.
- **yt-dlp only.** TikTok on this Mac returns "requiring login" without cookies —
  `--cookies-from-browser chrome` is the authorized fix (Chrome is logged in). Instagram
  needs `assets/cookies/instagram.txt`; if it's missing the ingest fails that item with a
  clear message. Don't substitute a different source.
- **SFX and fonts come from `assets/sfx` and `assets/fonts` only.** Never synthesize a
  tone, never reference a file that isn't on disk. The one sanctioned way to add a sound is
  Lucas handing you a file (drop in `SFX/`) or a specific YouTube link he asks for
  (`yt-dlp -x --audio-format wav` into `SFX/`, then trim into `assets/sfx/` and add to
  `SFX_LIB`) — never go hunting for sounds yourself. Avoid `/System/Library/Sounds`
  (Apple-licensed).
- **Transformative output.** Our overlay, our ranking, our labels; crop out creator
  captions/watermarks with per-clip `zoom`/`anchor` where possible.

## Writing ranking.json

Full schema and the current example in [references/ranking-json.md](references/ranking-json.md).
Decisions to make, in order:

1. **Cut points** — one window per clip, 4–7 s. Read each contact sheet: where is the
   setup, where is the payoff, does the payoff land inside the window? Prefer the
   detector's top candidate unless the stills show the peak is a compilation edit or
   the payoff is cut off. Start a window *after* a creator caption disappears if that
   costs < 1 s.
2. **Order** — reveal 5 → 1, escalating impact. Biggest visual payoff last.
3. **Bait slot** — with four links, slots 5–2 get clips and **#1 stays bare**; the video
   hard-cuts after slot 2 so the viewer expects a #1 that never comes. With five links,
   fill all five. Never add an outro.
4. **Title** — `Ranking Best [KEYWORD] Moments`, keyword in `#FFD400` yellow (red/blue
   also allowed). Keyword is the thing the clips share ("ROCK DROP"). `keywordColor` also
   colours the active number. When Lucas says "not yellow" (insane-accuracy, 2026-09-28)
   use red `#FF3B30` / blue `#2F80FF`, and give each video of a batch its own colour.
5. **Labels** — 2–3 words + one emoji, all caps in render, punchy nouns ("Quarry Bomb 🌊",
   "Tree Killer 🌳"). The one at the top of the list should be the one most likely to
   start an argument in the comments.
6. **Crop** — `zoom` > 1 crops in; `anchor` 0 keeps the top of the source, 1 keeps the
   bottom. Use anchor 1 + zoom ~1.1 to push a top caption under the title band; anchor
   ~0.3 when the action starts at the top of the frame (something being dropped).
7. **Duration** — spec is 28–38 s. Four clips × 7 s = 28.0 s, which is the floor, so
   with four links every window needs to be the full 7 s. If the source segments are
   shorter than that (compilations often are), don't pad or slow anything — set
   `"durationRange": [20, 38]` plus a `durationNote` in `ranking.json` so verify reads
   the real floor, and say so in the report.
8. **Overlay collisions** — creator captions/emoji rows that can't be cropped will sit
   behind our labels if they fall on rows 2–5 (frame y ≈ 460–1040). Render a still of
   that slot (`npx remotion still Ranking --frame=N out.png`) and, if it collides, move
   the clip to a slot whose label row clears it (swapping 4↔5 is usually free) rather
   than zooming past ~1.3.

## The goat avatar — OFF by default, only when Lucas says so

Lucas is A/B-testing the mascot: he'll ask for it on roughly every 4th–5th video and
compare performance. Do **not** add an `avatar` block unless he explicitly asks for the
goat on that video; a `ranking.json` without `avatar` renders the plain format (and no
ding opener — the normal whoosh/impact plays on the first cut). When he does ask, the
mascot (`assets/avatar/goat.png`, transparent, already trimmed) pops up from the
bottom-left with a white speech bubble and an ElevenLabs line (voice
`zfWx5IjUaWGWTId9hv9t`), then drops away. Clip audio ducks to 35 % while it talks. Cues
go in `ranking.json`:

```json
"avatar": { "image": "assets/avatar/goat.png", "voice": "zfWx5IjUaWGWTId9hv9t", "tempo": 1.25,
  "cues": [ { "at": "start", "text": "watch this", "maxDuration": 0.65, "ding": true },
            { "after": 4, "text": "what the fuck", "display": "what the F&@k" },
            { "after": 3, "text": "number 1 is insane" } ] }
```

- `tempo` speeds every line (Lucas: "make the goat's audio quicker" — 1.25× is his current
  setting); `maxDuration` overrides it per cue.
- `ding: true` plays `ding.wav` at the cue and delays the line 7 frames; on the opening cue
  it also *replaces* the whoosh/impact on the first cut (he didn't want a whoosh at 0 s).
- `display` is what the bubble shows when it must differ from the spoken text — swear words
  get censored on screen ("F&@k") but not in the audio.

- `at: "start"` is on screen from frame 0 (pre-advanced spring so it reads immediately).
- `after: N` fires the moment the segment *following* slot N begins. A cue whose slot has
  nothing after it is silently dropped (e.g. `after: 2` in a 4-slot bait video).
- `maxDuration` time-compresses the line (pitch-preserving atempo, ≤1.6×) — Lucas wants the
  opener at 0.5–0.7 s, and natural TTS of "watch this" is ~1.15 s. Leave the others natural.
- Lines are cached in `assets/voice/<voiceId>/` as trimmed WAVs; `voice.json` holds the
  durations the composition reads. Never regenerate a cached line unless asked (`--force`).
- Vary the hype lines between videos ("number 1 is insane", "wait for number 1", "what the
  fuck") — same voice, same goat, different words. Keep the bubble text identical to the
  spoken line so it works with sound off.

## The look (already implemented in `src/Ranking.tsx` — locked, Lucas signed off 2026-09-17)

Don't move text around between videos; these placements were tuned against his phone.
Title band 370 px solid `#0B0B0F` with the title pushed 90 px down inside it (phone UI
was clipping the top line), Anton 78/90 px, keyword colored. Numbers 1–5 in Anton 118 px
down the left edge starting just under the band, 150 px apart, white with 8 px black
stroke; the active number turns yellow and breathes. Labels 46 px, no background pill (a
pill covered the footage — Lucas killed it), just stroke + glow. Watermark `@goatedrank`
horizontally centered, 430 px up from the bottom, 42 % opacity, drawn under the goat's
bubble. Footage fills everything under the band.

## SFX (config-driven since 2026-09-19)

`src/Ranking.tsx` has `SFX_LIB` — every sound with the gain that puts its peak near −3 dB
(`whoosh`, `impact`, `click`, `ding`, `fahh`, `vine-boom`, `riser`). `assets/sfx/` holds
trimmed copies (leading silence removed); Lucas's raw drops live in `SFX/` — import new ones
with a `-ss` trim and add them to `SFX_LIB`. Never download or synthesize a sound.

`ranking.json` decides where they play:

```json
"sfx": {
  "reveal": "ding",                          // every label pop (default "click")
  "cut": ["whoosh", "impact"],               // layered on every cut, 2 frames apart (default)
  "intro": { "sfx": "riser", "leadIn": 2.6 }, // ENDS on the first cut — intro only, per Lucas
  "hits": [ { "slot": 1, "at": 3.3, "sfx": "vine-boom" },   // seconds into that slot's window
            { "slot": 2, "at": 5.7, "sfx": "fahh" } ]
}
```

`"opener": "i-got-this"` plays the "I Got This" meme line on frame 0, on top of the first
ding. Lucas is A/B-testing it for retention. Since 2026-09-28 it's **your call** ("start using
it SOMETIMES"): put it on roughly every 3rd video without asking — when he asks for a batch,
give it to one of them, not all — and say in the report which ones have it. Check the last
couple of commits' `ranking.json` so it doesn't land on back-to-back videos.

Lucas's three favourites and where they belong: **ding** on reveals, **vine boom** on the
heaviest landing (the karma hit, the big splash — read the RMS `peak_t` from
`work/detection.json`, convert to window-relative, and put the hit there), **fahh** on the
comedic wipeouts. Don't stack a hit on every slot; two booms + two fahhs across five clips
is plenty. The clip audio ducks to 30 % at each cut and recovers over 9 frames.
`pipeline/render.mjs` runs an ffmpeg `alimiter` (−2.5 dB ceiling) on the mix after
Remotion so hot SFX can't clip.

## Verify before delivering

`npm run verify` (part of `finish`) checks 1080x1920, 30 fps, 28–38 s, every label in
`revealOrder` present with an in-range reveal frame, timeline frames == file frames,
cropdetect finds no letterbox/pillarbox on sampled frames, true peak ≤ −1.0 dBTP.
Report the numbers. If it fails, fix and re-render; don't hand over a failing file.

## Report format

After delivery, one compact block: verification numbers; a table of slot / source /
in–out / label / one-line why; the judgment calls he might want to flip (bait slot,
any creator caption left visible, anything at a spec limit). No narration of the steps.

## When things go wrong

See [references/gotchas.md](references/gotchas.md) — TikTok flakiness, loudnorm
undershoot, `@remotion/media` ignoring `objectFit`, cropdetect's skip, the
`ranking.ts`/`Ranking.tsx` case collision, and how to isolate the SFX bus.
