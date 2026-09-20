# Gotchas learned building RANKFORGE2 (2026-09-16)

**TikTok "requiring login"** — every TikTok URL from this Mac hits it without cookies.
`--cookies-from-browser chrome` fixes it (Lucas authorized; he doesn't know how to
export cookies.txt). yt-dlp is brew-installed with `curl_cffi` pip-installed into its
Cellar venv for impersonation. Even with cookies the web route occasionally fails on a
video; `ingest.mjs` then retries once via the mobile API
(`--extractor-args tiktok:api_hostname=api16-normal-c-useast1a.tiktokv.com`) — same
video, different TikTok endpoint. If the video really is gone, TikTok's oEmbed
(`https://www.tiktok.com/oembed?url=<url>`) is a quick public availability check.

**loudnorm undershoots on short transient-heavy clips** (rocks hitting things landed at
−17.7 / −15.6 LUFS instead of −14). `ingest.mjs` encodes video once, runs loudnorm
two-pass on audio to WAV, then measures with ebur128 and applies `volume` + `alimiter`
trims until within ±0.3 LU, then stream-copy muxes. Don't go back to single-pass.

**`@remotion/media` `<Video>` ignores `objectFit`/`height` when rendering** — it draws
the frame at native size. Crop by wrapping it in a div sized 1080x1920, offset by
`-(H - AREA_H) * anchor`, inside an `overflow: hidden` clip area; apply `zoom` as a
`scale()` on the wrapper with `transformOrigin: 50% anchor%`.

**Per-track volume > 1 is fine at render** (`applyVolume` multiplies int16 samples and
clamps per track), so keep each SFX under 0 dBFS on its own (whoosh peaks −4.5 dB →
max ~1.6×, impact −12 dB → max ~3.5×, click −4.3 dB → max ~1.5×) and let
`pipeline/render.mjs`'s limiter handle the sum.

**Isolating the SFX bus** for a listen/measure:
`REMOTION_MUTE_CLIPS=1 npx remotion render Ranking /tmp/sfx.mp4 --frames=200-260`
(`CLIP_VOL` reads that env var). Cross-correlating `pop.wav`/`click.wav` against the
output confirms reveals; whoosh is noise-like and won't correlate — use the muted slice.

**cropdetect prints nothing for the first 2 frames** by default; the verify script feeds
3 frames with `skip=0` and `-loglevel info`. `-frames:v 1` silently yields no result.

**macOS case-insensitive FS**: `src/ranking.ts` and `src/Ranking.tsx` collide (TS1261).
The data module is `src/timeline.ts`; don't recreate a `ranking.ts`.

**Contact sheet sampling**: `select=between(t,a,b)` grabs 2 adjacent frames at 30 fps and
the 3x3 tile fills with duplicates. `detect.py` uses
`trim` + `select='isnan(prev_selected_t)+gte(t-prev_selected_t,step)'` for exactly 9
evenly spaced frames.

**Creator captions that can't be cropped** (mid-frame text like "Big smash" in the first
second of a clip): either start the window after the caption ends if it costs < 1 s, or
leave it and flag it in the report. Zooming past ~1.3 on a 480p source looks bad.

**Four links = 28.0 s exactly** at 7 s per clip — the floor of the 28–38 s spec. Five
links give slack. Don't shorten any window below 7 s with four links.

**AAC raises true peak ~0.6 dB.** Both `ingest.mjs` (per-clip) and `render.mjs` (master)
limit at a ceiling 1 dB below the −1.5 dBTP target for that reason. A limiter set *at*
the target verifies at −0.9 dBTP and fails.

**`npm run finish` stops on a failed check** (`&&` chain), so the clips survive for the
re-render; only a passing verify triggers `clean`.

**Remotion stalls seeking inside long sources.** A 125 s HEVC compilation with five slots
plus avatar audio timed out at a worker chunk boundary (frame ~160–175) every run, while
any short `--frames` range rendered fine. `pipeline/prep.mjs` (run by `render.mjs`) now
pre-cuts each slot window to `work/slotN.mp4`; `timeline.ts` prefers those via
`prepared.json`. Don't remove that step to "simplify".

**Orphaned `chrome-headless-shell` processes** from a killed render make the next one time
out "setting up the headless browser" — `pkill -f chrome-headless-shell` before retrying.

**Pasted images aren't on disk.** Ask Lucas to save the file to the asset path; don't
fabricate a stand-in. Check the corner pixels' alpha (`ffmpeg … -vf crop=4:4:0:0 -f rawvideo`)
before reaching for `rembg`; trim transparent padding with `alphaextract,cropdetect`.

**GitHub backup** — `https://github.com/lucassimpson45/rankforge2` (private). Two `gh`
accounts live on this Mac; the repo belongs to `lucassimpson45` while `simpsonlite` is
usually active. Before pushing: `gh auth switch --user lucassimpson45`, push, then switch
back. `.env`, cookies, `node_modules/`, `work/`, `output/` are gitignored on purpose;
`voice.json` and `prepared.json` are committed because the composition imports them.
Commit after every video (ranking.json changes) so the backup stays current.
