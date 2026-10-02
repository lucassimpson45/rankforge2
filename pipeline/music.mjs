#!/usr/bin/env node
// Music rotation (Lucas, 2026-10-02: "shuffle between the two for every single video").
// If ranking.json has no `music` key, pick the next track in Audios/ after the one the last
// committed video used, so consecutive videos never share a bed. Any file dropped into Audios/
// joins the rotation. `start` skips the track's leading silence. `"music": null` = no music.
//
//   node pipeline/music.mjs        (run automatically by render.mjs)
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const path = join(ROOT, "ranking.json");
const r = JSON.parse(readFileSync(path, "utf8"));
if (r.music !== undefined) {
  console.log(`[music] keeping ${r.music ? r.music.file : "none"} from ranking.json`);
  process.exit(0);
}

const tracks = readdirSync(join(ROOT, "Audios")).filter((f) => /\.(wav|mp3|m4a)$/i.test(f)).sort().map((f) => `Audios/${f}`);
if (!tracks.length) { console.error("[music] Audios/ is empty"); process.exit(1); }

// last video's bed = music.file in the most recent commit of ranking.json that had one
const log = spawnSync("git", ["log", "--format=%H", "-n", "20", "--", "ranking.json"], { cwd: ROOT, encoding: "utf8" });
let last = null;
for (const sha of log.stdout.split("\n").filter(Boolean)) {
  const show = spawnSync("git", ["show", `${sha}:ranking.json`], { cwd: ROOT, encoding: "utf8" });
  try { const f = JSON.parse(show.stdout).music?.file; if (f && tracks.includes(f)) { last = f; break; } } catch {}
}
const file = tracks[(tracks.indexOf(last) + 1) % tracks.length];

// leading silence → start offset
const sd = spawnSync("ffmpeg", ["-hide_banner", "-i", join(ROOT, file), "-t", "10", "-af", "silencedetect=n=-45dB:d=0.2", "-f", "null", "-"], { encoding: "utf8" });
const m = sd.stderr.match(/silence_start: 0(?:\.0+)?\s[\s\S]*?silence_end: ([\d.]+)/);
const start = m ? Math.max(0, +(+m[1] - 0.05).toFixed(2)) : 0;

r.music = { file, start };
writeFileSync(path, JSON.stringify(r, null, 2) + "\n");
console.log(`[music] rotation: last video used ${last ?? "nothing in Audios/"} → ${file} (start ${start}s)`);
