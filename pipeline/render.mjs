#!/usr/bin/env node
// Phase 4/5 — Render with Remotion, then master the mix: a true-peak-safe limiter on the audio
// (video stream copied untouched) so layered SFX over -14 LUFS clips can never clip.
//
//   node pipeline/render.mjs [output/ranking.mp4]
import { spawnSync } from "node:child_process";
import { mkdirSync, renameSync, unlinkSync, existsSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const out = resolve(process.argv[2] ?? join(ROOT, "output", "ranking.mp4"));
const raw = out.replace(/\.mp4$/, ".unmastered.mp4");
mkdirSync(dirname(out), { recursive: true });

const run = (cmd, args) => spawnSync(cmd, args, { stdio: "inherit", cwd: ROOT });

console.log("[prep] cutting slot windows");
let pr = run("node", [join(ROOT, "pipeline", "prep.mjs")]);
if (pr.status !== 0) process.exit(pr.status ?? 1);

console.log("[render] remotion → " + raw);
let r = run("npx", ["remotion", "render", "Ranking", raw, "--codec=h264", "--crf=18", "--log=error"]);
if (r.status !== 0) process.exit(r.status ?? 1);

// AAC encoding raises true peak beyond the sample-peak limiter ceiling by an amount that varies
// with the mix's spectral content (typically ~0.6 dB, but layered SFX over some sources overshoot
// more). Limit, mux, then re-measure the actual AAC output and tighten further if it's still hot.
const TARGET_TP = -1.0; // dBTP ceiling verify.mjs checks
const measureTP = (file) => {
  const m = spawnSync("ffmpeg", ["-hide_banner", "-nostats", "-i", file, "-map", "0:a:0",
    "-af", "ebur128=peak=true:framelog=quiet", "-f", "null", "-"], { encoding: "utf8" });
  const TP = m.stderr.match(/Peak:\s+(-?[\d.]+) dBFS/);
  return TP ? +TP[1] : null;
};

console.log("[master] limiter → " + out);
let headroom = 0.6; // dB, initial assumption for AAC overshoot above the sample-peak limiter ceiling
let peak = null;
for (let attempt = 1; attempt <= 4; attempt++) {
  const ceiling = Math.pow(10, (TARGET_TP - headroom) / 20).toFixed(4);
  r = run("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-i", raw,
    "-map", "0:v:0", "-map", "0:a:0", "-c:v", "copy",
    "-af", `alimiter=limit=${ceiling}:attack=3:release=60:level=false`,
    "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-movflags", "+faststart", out]);
  if (r.status !== 0) process.exit(r.status ?? 1);
  peak = measureTP(out);
  console.log(`  attempt ${attempt}: headroom ${headroom.toFixed(1)} dB → measured ${peak} dBTP`);
  if (peak !== null && peak <= TARGET_TP) break;
  headroom += 0.8;
}
if (peak !== null && peak > TARGET_TP) {
  console.error(`[master] WARNING: true peak still ${peak} dBTP after 4 tightening passes`);
}
unlinkSync(raw);
console.log("[done] " + out);
