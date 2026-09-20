# RANKFORGE2 — ranking-format Shorts pipeline

Social links in → finished 1080x1920 / 30fps ranking Short out (Remotion overlay, ffmpeg + yt-dlp underneath).

## Run

```bash
# 1. ingest (download + normalize to 1080x1920, 30fps, -14 LUFS)      → work/clipN.mp4, work/manifest.json
npm run ingest -- --cookies-from-browser chrome "<url1>" "<url2>#t=1m23s" "<url3>" "<url4>" "<url5>"

# 2. detect highlights (audio RMS peaks + scene cuts, 3x3 contact sheets)  → work/detection.json, work/sheets/
npm run detect

# 3. write ranking.json  (order, title keyword, labels, emoji, in/out per slot, crop zoom/anchor)
#    — this is the approval step; nothing renders until it exists

# 3b. (optional) goat avatar lines — needs ELEVENLABS_API_KEY in .env
node --env-file=.env pipeline/voice.mjs

# 4. pre-cut slots + render + master + verify + delete clips             → output/ranking.mp4
npm run finish
```

`npm run studio` opens Remotion Studio for tweaking the composition live. `npm run render`, `npm run verify`, `npm run clean` are the individual steps of `finish`.

## Rules baked in
- yt-dlp only. TikTok on this machine needs `--cookies-from-browser chrome` (or `assets/cookies/tiktok.txt`). Instagram needs a cookies file; without one it fails that item with a clear message, no retry.
- SFX and fonts are read from `assets/sfx` and `assets/fonts` only. Nothing is downloaded or synthesized; a missing file fails the render.
- Every clip is normalized before composition: scale-to-cover + center crop, 30fps, H.264 CRF18, two-pass loudnorm + measured trim/limiter to -14 LUFS / -1.5 dBTP.
- Highlight detection is mechanical (RMS + scene change). Cut points are chosen from contact sheets and written into `ranking.json` by a human/Claude — never claimed from "watching" video.
- Video hard-cuts after the last revealed slot. No outro.

## ranking.json
```json
{
  "title": { "prefix": "Ranking Best", "keyword": "ROCK DROP", "suffix": "Moments", "keywordColor": "#FFD400" },
  "watermark": "@goatedrank",
  "fps": 30,
  "revealOrder": [5, 4, 3, 2],          // slots that get a clip, in playback order; slots not listed stay bare
  "slots": {
    "5": { "clip": "work/clip2.mp4", "in": 5.0, "out": 12.0, "label": "Canyon Drop", "emoji": "🪨",
           "zoom": 1.22, "anchor": 0.5 }   // zoom > 1 crops in; anchor 0 = keep top, 1 = keep bottom
  }
}
```

## Verification (`npm run verify`)
1080x1920, 30 fps, 28–38 s, every label in `revealOrder` present with an in-range reveal frame, timeline frame count == file frame count, cropdetect on sampled frames returns the full clip area (no letterbox/pillarbox), true peak ≤ -1.0 dBTP.

## Layout
```
pipeline/ingest.mjs    Phase 1   download + normalize
pipeline/detect.py     Phase 2   RMS/scene detection + contact sheets
ranking.json           Phase 3   the approved edit
src/                   Phase 4   Remotion composition (Root.tsx, Ranking.tsx, timeline.ts)
pipeline/prep.mjs      Phase 4   pre-cuts each slot window to work/slotN.mp4 (prepared.json)
pipeline/voice.mjs     Phase 4   ElevenLabs lines for the goat avatar (assets/voice/, voice.json)
pipeline/render.mjs    Phase 4/5 prep → Remotion → alimiter master
pipeline/verify.mjs    Phase 5   checks
work/                  clips + manifests (clips deleted by `npm run clean`)
output/                final renders
assets/sfx, assets/fonts, assets/cookies
public/                symlinks → ../work, ../assets (Remotion staticFile root)
```
