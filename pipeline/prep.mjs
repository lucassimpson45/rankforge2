#!/usr/bin/env node
// Pre-cut every slot window in ranking.json to its own small file (work/slotN.mp4) so Remotion
// never has to seek inside a long source (a 2-minute HEVC compilation stalled the renderer).
// Writes prepared.json {slot: {file, duration}} which the composition prefers over clip+in/out.
//
//   node pipeline/prep.mjs
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const r = JSON.parse(readFileSync(join(ROOT, "ranking.json"), "utf8"));
const out = {};
for (const n of r.revealOrder) {
  const s = r.slots[String(n)];
  if (!s.clip) continue;
  const src = join(ROOT, s.clip);
  if (!existsSync(src)) { console.error(`[fatal] missing ${s.clip} — run ingest first`); process.exit(1); }
  const dst = join(ROOT, "work", `slot${n}.mp4`);
  const dur = (s.out - s.in).toFixed(3);
  // -ss before -i + re-encode = frame-accurate cut; libx264 keeps decode cheap for the renderer
  const p = spawnSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-ss", String(s.in), "-i", src, "-t", dur,
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "16", "-pix_fmt", "yuv420p", "-g", "30",
    "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-ac", "2", "-movflags", "+faststart", dst], { encoding: "utf8" });
  if (p.status !== 0) { console.error(p.stderr); process.exit(1); }
  const d = spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", dst], { encoding: "utf8" });
  out[String(n)] = { file: `work/slot${n}.mp4`, duration: +parseFloat(d.stdout).toFixed(3) };
  console.log(`slot${n}  ${s.in}–${s.out}s → work/slot${n}.mp4 (${out[String(n)].duration}s)`);
}
writeFileSync(join(ROOT, "prepared.json"), JSON.stringify(out, null, 2) + "\n");
