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

// -2.5 dB sample ceiling (0.7499): AAC encoding raises true peak ~0.6 dB, verify wants <= -1.0 dBTP.
console.log("[master] limiter → " + out);
r = run("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-i", raw,
  "-map", "0:v:0", "-map", "0:a:0", "-c:v", "copy",
  "-af", "alimiter=limit=0.7499:attack=3:release=60:level=false",
  "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-movflags", "+faststart", out]);
if (r.status !== 0) process.exit(r.status ?? 1);
unlinkSync(raw);
console.log("[done] " + out);
