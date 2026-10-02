# ranking.json

Lives at `~/Desktop/PROJECTS/RANKFORGE2/ranking.json`. `src/timeline.ts` turns it into
back-to-back segments; `pipeline/verify.mjs` reads it to check labels. Nothing renders
without it.

```jsonc
{
  "title": { "prefix": "Ranking Best", "keyword": "ROCK DROP", "suffix": "Moments", "keywordColor": "#FFD400" },
  "watermark": "@goatedrank",
  "fps": 30,
  "revealOrder": [5, 4, 3, 2],        // playback order; slots not listed stay bare on screen
  "cutAfterLastReveal": true,
  "durationRange": [28, 38],           // optional; verify's floor/ceiling. Lower only when the sources can't reach 28 s
  "durationNote": "why the range was changed",
  "slots": {
    "5": { "clip": "work/clip2.mp4", "in": 5.0,  "out": 12.0,  "label": "Canyon Drop", "emoji": "🪨", "zoom": 1.25, "anchor": 0.5,
           "why": "Longest free-fall but the rock is a speck — weakest payoff, opens the list; zoom hides the VOXI watermark box" },
    "4": { "clip": "work/clip1.mp4", "in": 1.68, "out": 8.68,  "label": "Gorge Smash", "emoji": "💥", "zoom": 1.0,  "anchor": 0.5,
           "why": "Hand-thrown boulder into a gorge, audible impact ~6.5 s" },
    "3": { "clip": "work/clip3.mp4", "in": 6.58, "out": 13.58, "label": "Tree Killer", "emoji": "🌳", "zoom": 1.1,  "anchor": 1.0,
           "why": "Rock tumbles downhill into a tree, dust cloud 10.6–12 s; anchor 1 + zoom hides the creator caption" },
    "2": { "clip": "work/clip4.mp4", "in": 0.0,  "out": 7.0,   "label": "Quarry Bomb", "emoji": "🌊", "zoom": 1.0,  "anchor": 0.3,
           "why": "Excavator drops a marble block into a lake — biggest splash; anchor 0.3 keeps the block at the top in frame" },
    "1": { "clip": null, "label": null, "emoji": null,
           "why": "Never revealed — hard cut after slot 2 so the viewer expects a #1 that never comes" }
  }
}
```

Field notes

- `clip` paths are relative to the project root and are served through the `public/work`
  symlink; `work/clipN.mp4` is the normalized file from ingest (`clipN` = Nth URL given).
- `in`/`out` are seconds in the normalized clip. Duration per slot = `out − in`, 4–7 s.
- `zoom` scales the footage around `anchor`; `anchor` also decides which 280 px of the
  1920-tall source is sacrificed under the title band (0 = crop the bottom, 1 = crop the
  top, 0.5 = split).
- `why` is for the report and for Lucas; the renderer ignores it.
- `music`: `{ file, start, volume? }` — omitted = house bed (Pure Imagination) at 0.3 under
  clip audio; `null` = no music. `start` ≈ 137.5 − video length (song ends ~137.5 s).
- `clipAudio: false` strips the source clips' audio; music then defaults to volume 1.
  SFX hit times can't come from RMS then — place them from 6 fps strips of the payoff.
- `delogo` also works per slot (`slots.N.delogo`).
- `keywordColor`: yellow `#FFD400` default; red `#FF3B30` or blue `#2F80FF` also on spec.

Detection output that informs the picks: `work/detection.json` (candidates with
`start`/`end`/`peak_t`/`scene_cuts`) and `work/sheets/clipN_candK.jpg` (3x3 tiles with
timestamps burned in, sampled evenly across the window).
