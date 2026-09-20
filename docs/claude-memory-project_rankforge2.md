---
name: project-rankforge2
description: "RANKFORGE2 ranking-Shorts pipeline — location, phase status, TikTok auth quirk"
metadata: 
  node_type: memory
  type: project
  originSessionId: fccf5fcb-a264-4173-b6bb-bfa307f2eb92
  modified: 2026-09-16T15:46:31.830Z
---

RANKFORGE2 lives at `~/Desktop/PROJECTS/RANKFORGE2` (Node ESM + ffmpeg + yt-dlp; Remotion from Phase 4). Five-phase build (ingest → detection → ranking → Remotion → render), one phase per turn with user sign-off between. All five phases completed 2026-09-16; first video ("Ranking Best ROCK DROP Moments") delivered.

**Why:** TikTok returns "requiring login" for every URL from this machine with no cookies. Lucas doesn't know how to export cookies.txt, so he authorized `--cookies-from-browser chrome` (Chrome Profile 6 is logged into TikTok). yt-dlp is brew-installed; `curl_cffi` was pip-installed into its Cellar venv for impersonation.

**How to apply:** Invoke the `goatedrank-ranking-short` skill (~/.claude/skills/goatedrank-ranking-short) — it holds the full run, the look, the SFX design and the gotchas. Channel watermark is `@goatedrank`. Run ingest as `npm run ingest -- --cookies-from-browser chrome <urls>`; don't re-ask for cookies.txt. Lucas wants clips deleted after every render (`npm run finish` does it). Slot 5 of the current video is intentionally empty (viewer bait) — see [[feedback-carousel-speed]] for his general preference for speed over narration.

**Goat avatar (2026-09-17):** built and approved, but OFF by default. Lucas will say when to use it (every 4–5 videos as an A/B test). Text placements (title lowered 90 px in a 370 px band, watermark centered 430 px up) are locked — don't restyle between videos.

**Canonical recipe (2026-09-19):** the instant-karma v2 video is "exactly how every video should be made" — 5 slots × 7 s = 35 s, punchline inside each window, riser intro, ding reveals, vine boom on the two heaviest hits, fahh on the two comedic wipeouts, all creator branding cropped. Saved as `references/canonical-ranking.json` in the skill; the composition's SFX defaults now match it.
