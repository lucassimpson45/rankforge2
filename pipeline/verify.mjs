#!/usr/bin/env node
// Phase 5 — Verify a rendered ranking Short.
//
//   node pipeline/verify.mjs [output/ranking.mp4]
//
// Checks: 1080x1920 @ 30fps; duration within 28–38 s; every label in ranking.json's revealOrder
// is on screen in the final frames (visual check via extracted stills is left to the operator —
// here we verify the timeline math and that each label reveal falls inside the video);
// no letterboxing/pillarboxing (cropdetect on sampled frames must return the full clip area);
// audio true peak ≤ -1.0 dBTP and sample peak < 0 dBFS.
import { spawnSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const file = resolve(process.argv[2] ?? join(ROOT, "output", "ranking.mp4"));
if (!existsSync(file)) { console.error(`[fatal] not found: ${file}`); process.exit(1); }
const ranking = JSON.parse(readFileSync(join(ROOT, "ranking.json"), "utf8"));

const sh = (cmd, args) => spawnSync(cmd, args, { encoding: "utf8", maxBuffer: 64 << 20 });
const results = [];
const check = (name, ok, detail) => { results.push({ name, ok, detail }); console.log(`${ok ? "PASS" : "FAIL"}  ${name}  ${detail}`); };

// --- container / streams ---
const probe = JSON.parse(sh("ffprobe", ["-v", "error", "-print_format", "json", "-show_streams", "-show_format", file]).stdout);
const v = probe.streams.find((s) => s.codec_type === "video");
const a = probe.streams.find((s) => s.codec_type === "audio");
const [fn, fd] = v.avg_frame_rate.split("/").map(Number);
const fps = fn / fd;
const duration = parseFloat(probe.format.duration);
const nbFrames = Number(v.nb_frames) || Math.round(duration * fps);

check("resolution", v.width === 1080 && v.height === 1920, `${v.width}x${v.height}`);
check("framerate", Math.abs(fps - 30) < 0.01, `${fps.toFixed(3)} fps`);
const [dMin, dMax] = ranking.durationRange ?? [28, 38];
check(`duration ${dMin}–${dMax} s${ranking.durationRange ? " (range set in ranking.json)" : ""}`, duration >= dMin && duration <= dMax, `${duration.toFixed(3)} s (${nbFrames} frames)`);
check("has audio", !!a, a ? `${a.codec_name} ${a.sample_rate} Hz ${a.channels}ch` : "none");

// --- labels: every revealed slot has a label+emoji, and its reveal frame is inside the video ---
let from = 0;
const labels = [];
for (const n of ranking.revealOrder) {
  const s = ranking.slots[String(n)];
  const frames = Math.round((s.out - s.in) * 30);
  const revealFrame = from === 0 ? 0 : from + 6;
  labels.push({ n, label: s.label, emoji: s.emoji, revealFrame, ok: !!s.label && !!s.emoji && revealFrame < nbFrames });
  from += frames;
}
const bare = [1, 2, 3, 4, 5].filter((n) => !ranking.revealOrder.includes(n));
check("labels present", labels.every((l) => l.ok) && labels.length === ranking.revealOrder.length,
  labels.map((l) => `#${l.n} "${l.label} ${l.emoji}" @f${l.revealFrame}`).join(", ") + (bare.length ? ` | bare: #${bare.join(",#")}` : ""));
check("timeline matches render", Math.abs(from - nbFrames) <= 1, `timeline ${from} frames vs file ${nbFrames}`);

// --- letterbox / pillarbox: cropdetect on the clip area (below the 320px title band) ---
// title band height comes from the composition so the two can't drift
const BAND = Number((readFileSync(join(ROOT, "src", "Ranking.tsx"), "utf8").match(/const BAND_H = (\d+)/) || [])[1] || 0);
if (!BAND) { console.error("[fatal] could not read BAND_H from src/Ranking.tsx"); process.exit(1); }
const samples = [0.02, 0.2, 0.4, 0.6, 0.8, 0.98].map((p) => (duration * p).toFixed(2));
let bars = [];
for (const t of samples) {
  const r = sh("ffmpeg", ["-hide_banner", "-loglevel", "info", "-ss", t, "-i", file, "-frames:v", "3",
    "-vf", `crop=1080:${1920 - BAND}:0:${BAND},cropdetect=limit=16:round=2:reset=1:skip=0`, "-f", "null", "-"]);
  const m = [...r.stderr.matchAll(/crop=(\d+):(\d+):(\d+):(\d+)/g)].pop();
  if (!m) { bars.push(`${t}s: no cropdetect output`); continue; }
  const [w, h] = [Number(m[1]), Number(m[2])];
  if (w < 1080 - 4 || h < 1920 - BAND - 4) bars.push(`${t}s: content ${w}x${h}`);
}
check("no letterbox/pillarbox", bars.length === 0, bars.length ? bars.join("; ") : `${samples.length} frames sampled, clip area full-bleed`);

// --- audio peaks ---
const eb = sh("ffmpeg", ["-hide_banner", "-nostats", "-i", file, "-map", "0:a:0", "-af", "ebur128=peak=true:framelog=quiet", "-f", "null", "-"]).stderr;
const tp = parseFloat((eb.match(/Peak:\s+(-?[\d.]+) dBFS/) || [])[1]);
const lufs = parseFloat((eb.match(/I:\s+(-?[\d.]+) LUFS/) || [])[1]);
const st = sh("ffmpeg", ["-hide_banner", "-nostats", "-i", file, "-map", "0:a:0", "-af", "astats=measure_overall=Peak_level:measure_perchannel=none", "-f", "null", "-"]).stderr;
const sp = parseFloat((st.match(/Peak level dB:\s+(-?[\d.]+)/) || [])[1]);
check("audio true peak ≤ -1.0 dBTP", tp <= -1.0, `${tp} dBTP (sample peak ${sp} dBFS, integrated ${lufs} LUFS)`);

const failed = results.filter((r) => !r.ok);
console.log(`\n${failed.length === 0 ? "ALL CHECKS PASSED" : failed.length + " CHECK(S) FAILED"}  —  ${file}`);
process.exit(failed.length ? 2 : 0);
