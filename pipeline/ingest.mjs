#!/usr/bin/env node
// Phase 1 — Ingest
//
// Usage:
//   node pipeline/ingest.mjs <url-or-file> [<url-or-file> ...]   (1–5 inputs)
//
// Each input may carry an inline timestamp hint:  URL#t=1m23s | URL#t=83 | URL#t=1:23
// The hint is recorded in work/manifest.json for Phase 2 (skip detection for that clip).
// It is NOT used to trim here — Phase 1 normalizes the whole source.
//
// Options:
//   --cookies <file>       Netscape cookies.txt applied to every download
//   --cookies-from-browser <chrome|safari|firefox|...>
//                          Read cookies from an installed browser's live session (macOS
//                          prompts for Keychain access on first use)
//   --force                Re-download / re-normalize even if outputs exist
//
// Per-platform cookies are auto-detected from assets/cookies/{instagram,tiktok,youtube}.txt.
// Instagram without a cookies file is a hard failure for that item (no retry, no substitution).
//
// Output: work/raw/clipN.<ext> (source), work/clipN.mp4 (1080x1920 / 30fps / -14 LUFS),
//         work/manifest.json (per-clip status + probe data).

import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, writeFileSync, statSync } from "node:fs";
import { resolve, dirname, join, extname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const WORK = join(ROOT, "work");
const RAW = join(WORK, "raw");
const COOKIE_DIR = join(ROOT, "assets", "cookies");

const TARGET = { w: 1080, h: 1920, fps: 30, lufs: -14, tp: -1.5, lra: 11 };

// ---------- arg parsing ----------
const argv = process.argv.slice(2);
const opts = { cookies: null, cookiesFromBrowser: null, force: false };
const inputs = [];
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === "--cookies") opts.cookies = resolve(argv[++i]);
  else if (a === "--cookies-from-browser") opts.cookiesFromBrowser = argv[++i];
  else if (a === "--force") opts.force = true;
  else if (a.startsWith("--")) die(`Unknown option: ${a}`);
  else inputs.push(a);
}
if (inputs.length === 0 || inputs.length > 5) {
  die(`Expected 1–5 inputs, got ${inputs.length}.`);
}
if (inputs.length < 5) {
  console.warn(`[warn] ${inputs.length} input(s) supplied; slots ${inputs.length + 1}–5 will be empty.\n`);
}
if (opts.cookies && !existsSync(opts.cookies)) die(`--cookies file not found: ${opts.cookies}`);

mkdirSync(RAW, { recursive: true });

// ---------- helpers ----------
function die(msg) {
  console.error(`[fatal] ${msg}`);
  process.exit(1);
}

function run(cmd, args, { capture = true } = {}) {
  return new Promise((res) => {
    const p = spawn(cmd, args, { stdio: ["ignore", capture ? "pipe" : "inherit", "pipe"] });
    let out = "", err = "";
    p.stdout?.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (err += d));
    p.on("close", (code) => res({ code, out, err }));
  });
}

// "#t=1m23s" | "#t=83" | "#t=1:23" | "#t=1h2m3s"  -> seconds
function parseTimestamp(frag) {
  const m = frag.match(/^t=(.+)$/);
  if (!m) return null;
  const v = m[1];
  if (/^\d+(\.\d+)?$/.test(v)) return parseFloat(v);
  if (/^\d+:\d{1,2}(:\d{1,2})?$/.test(v)) {
    const parts = v.split(":").map(Number);
    return parts.reduce((acc, n) => acc * 60 + n, 0);
  }
  const hms = v.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+(?:\.\d+)?)s)?$/);
  if (hms && (hms[1] || hms[2] || hms[3])) {
    return (+hms[1] || 0) * 3600 + (+hms[2] || 0) * 60 + (+hms[3] || 0);
  }
  return NaN;
}

function splitInput(raw) {
  // Only the URL *fragment* (#t=...) is a timestamp hint. TikTok's "&t=17895..." query
  // param is a tracking value and must be ignored.
  const hash = raw.indexOf("#");
  if (hash === -1) return { src: raw, hint: null };
  const src = raw.slice(0, hash);
  const ts = parseTimestamp(raw.slice(hash + 1));
  if (ts === null) return { src, hint: null };
  if (Number.isNaN(ts)) die(`Unparseable timestamp fragment on: ${raw}`);
  return { src, hint: ts };
}

function platformOf(src) {
  try {
    const h = new URL(src).hostname.replace(/^www\./, "");
    if (h.endsWith("instagram.com")) return "instagram";
    if (h.endsWith("tiktok.com")) return "tiktok";
    if (h.endsWith("youtube.com") || h === "youtu.be") return "youtube";
    return "other";
  } catch {
    return "file";
  }
}

function cookiesFor(platform) {
  if (opts.cookies) return opts.cookies;
  const f = join(COOKIE_DIR, `${platform}.txt`);
  return existsSync(f) ? f : null;
}

function findRaw(idx) {
  const hit = readdirSync(RAW).find((f) => f.startsWith(`clip${idx}.`) && !f.endsWith(".json") && !f.endsWith(".part"));
  return hit ? join(RAW, hit) : null;
}

// ---------- download ----------
async function download(idx, src, platform) {
  const existing = findRaw(idx);
  if (existing && !opts.force) return { ok: true, path: existing, note: "cached" };

  const cookies = cookiesFor(platform);
  const hasAuth = !!(cookies || opts.cookiesFromBrowser);
  if (platform === "instagram" && !hasAuth) {
    return { ok: false, error: `Instagram requires a cookies file. Put a Netscape cookies.txt at assets/cookies/instagram.txt or pass --cookies <file>. Not retrying.` };
  }

  const args = [
    "--no-update", "--no-playlist", "--no-overwrites",
    "-f", "bv*+ba/b",
    "-S", "res,fps,vcodec:h264,acodec:aac",
    "--merge-output-format", "mp4",
    "--write-info-json",
    "-o", join(RAW, `clip${idx}.%(ext)s`),
    "--print", "after_move:filepath",
  ];
  if (cookies) args.push("--cookies", cookies);
  else if (opts.cookiesFromBrowser) args.push("--cookies-from-browser", opts.cookiesFromBrowser);
  args.push(src);

  // TikTok's web endpoint is flaky on some videos even with valid cookies; the mobile API
  // route (same video, different TikTok endpoint) is the documented second attempt.
  const routes = [[]];
  if (platform === "tiktok" && hasAuth) {
    routes.push(["--extractor-args", "tiktok:api_hostname=api16-normal-c-useast1a.tiktokv.com"]);
  }
  let r;
  for (const extra of routes) {
    r = await run("yt-dlp", [...extra, ...args]);
    if (r.code === 0) break;
    if (extra.length) console.log("  download: web route failed, mobile API route also failed");
    else if (routes.length > 1) console.log("  download: web route failed, trying mobile API route");
  }
  if (r.code !== 0) {
    const line = (r.err.match(/^ERROR:.*$/m) || [r.err.trim().split("\n").pop()])[0];
    let error = line;
    if (/requiring login|login required|--cookies/i.test(line) && !hasAuth) {
      error = `${platform} responded "login required" and no cookies file is present. Export a Netscape cookies.txt from a logged-in browser to assets/cookies/${platform}.txt (or pass --cookies <file>) and re-run. Not retrying.`;
    }
    return { ok: false, error };
  }
  const path = r.out.trim().split("\n").pop();
  if (!path || !existsSync(path)) return { ok: false, error: "yt-dlp exited 0 but no output file was found" };
  return { ok: true, path, note: "downloaded" };
}

// ---------- probe ----------
async function probe(file) {
  const r = await run("ffprobe", ["-v", "error", "-print_format", "json", "-show_streams", "-show_format", file]);
  if (r.code !== 0) throw new Error(`ffprobe failed: ${r.err.trim()}`);
  const j = JSON.parse(r.out);
  const v = j.streams.find((s) => s.codec_type === "video");
  const a = j.streams.find((s) => s.codec_type === "audio");
  if (!v) throw new Error("no video stream");
  const [n, d] = (v.avg_frame_rate || v.r_frame_rate || "0/1").split("/").map(Number);
  const rot = Number((v.side_data_list || []).find((s) => s.rotation != null)?.rotation ?? 0);
  const swapped = Math.abs(rot) === 90 || Math.abs(rot) === 270;
  return {
    width: swapped ? v.height : v.width,
    height: swapped ? v.width : v.height,
    fps: d ? +(n / d).toFixed(3) : null,
    vcodec: v.codec_name,
    acodec: a?.codec_name ?? null,
    hasAudio: !!a,
    duration: +parseFloat(j.format.duration).toFixed(3),
    pix_fmt: v.pix_fmt,
  };
}

async function measureLoudness(file) {
  // ebur128 gives integrated loudness + true peak of the finished file for verification.
  const r = await run("ffmpeg", ["-hide_banner", "-nostats", "-i", file, "-map", "0:a:0",
    "-af", "ebur128=peak=true:framelog=quiet", "-f", "null", "-"]);
  const I = r.err.match(/I:\s+(-?[\d.]+) LUFS/);
  const TP = r.err.match(/Peak:\s+(-?[\d.]+) dBFS/);
  return { integrated: I ? +I[1] : null, truePeak: TP ? +TP[1] : null };
}

// ---------- normalize ----------
async function normalize(idx, rawPath, meta) {
  const out = join(WORK, `clip${idx}.mp4`);
  if (existsSync(out) && !opts.force && statSync(out).mtimeMs >= statSync(rawPath).mtimeMs) {
    return { ok: true, path: out, note: "cached" };
  }
  const TMP = join(WORK, "tmp");
  mkdirSync(TMP, { recursive: true });
  const vTmp = join(TMP, `clip${idx}_v.mp4`);
  const aTmp = (n) => join(TMP, `clip${idx}_a${n}.wav`);
  const base = ["-hide_banner", "-nostats", "-y"];
  const tail = (r) => r.err.trim().split("\n").slice(-3).join(" | ");

  // --- video: scale-to-cover, center crop, 30fps, H.264 ---
  const vf = [
    `scale=${TARGET.w}:${TARGET.h}:force_original_aspect_ratio=increase:flags=lanczos`,
    `crop=${TARGET.w}:${TARGET.h}`, // centered by default
    `fps=${TARGET.fps}`,
    "format=yuv420p",
  ].join(",");
  const rv = await run("ffmpeg", [...base, "-i", rawPath, "-map", "0:v:0", "-an", "-vf", vf,
    "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-profile:v", "high", "-level", "4.1",
    "-pix_fmt", "yuv420p", vTmp]);
  if (rv.code !== 0) return { ok: false, error: "video encode failed: " + tail(rv) };

  const acodec = ["-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-ac", "2"];

  // --- audio: no source track -> silent stereo, no loudnorm ---
  if (!meta.hasAudio) {
    const rm = await run("ffmpeg", [...base, "-i", vTmp, "-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo",
      "-map", "0:v:0", "-map", "1:a:0", "-shortest", "-c:v", "copy", ...acodec, "-movflags", "+faststart", out]);
    if (rm.code !== 0) return { ok: false, error: "mux failed: " + tail(rm) };
    return { ok: true, path: out, note: "no audio in source; silent track muxed" };
  }

  // --- audio pass 1: measure ---
  const ln = `loudnorm=I=${TARGET.lufs}:TP=${TARGET.tp}:LRA=${TARGET.lra}`;
  const p1 = await run("ffmpeg", [...base, "-i", rawPath, "-map", "0:a:0", "-af", `${ln}:print_format=json`, "-f", "null", "-"]);
  const jsonMatch = p1.err.match(/\{\s*"input_i"[\s\S]*?\}/);
  if (p1.code !== 0 || !jsonMatch) return { ok: false, error: "loudnorm pass 1 failed: " + tail(p1) };
  const m = JSON.parse(jsonMatch[0]);

  // --- audio pass 2: loudnorm with measured values -> 48k stereo wav ---
  const af2 = `${ln}:measured_I=${m.input_i}:measured_LRA=${m.input_lra}:measured_TP=${m.input_tp}` +
    `:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true,aresample=48000`;
  const p2 = await run("ffmpeg", [...base, "-i", rawPath, "-map", "0:a:0", "-af", af2, "-ar", "48000", "-ac", "2", "-c:a", "pcm_s16le", aTmp(0)]);
  if (p2.code !== 0) return { ok: false, error: "loudnorm pass 2 failed: " + tail(p2) };

  // --- audio pass 3+: loudnorm's dynamic mode undershoots on short transient-heavy clips.
  // Trim with a measured gain + true-peak-safe limiter until integrated loudness is within 0.3 LU.
  let cur = aTmp(0);
  let loud = await measureLoudness(cur);
  const steps = [`loudnorm ${m.input_i} → ${loud.integrated} LUFS`];
  const limit = Math.pow(10, (TARGET.tp - 0.5) / 20).toFixed(4); // 0.5 dB headroom: alimiter is sample-peak, we verify true-peak
  for (let n = 1; n <= 3 && Math.abs(loud.integrated - TARGET.lufs) > 0.3; n++) {
    const gain = (TARGET.lufs - loud.integrated).toFixed(2);
    const next = aTmp(n);
    const r = await run("ffmpeg", [...base, "-i", cur, "-af", `volume=${gain}dB,alimiter=limit=${limit}:attack=5:release=50:level=false`,
      "-ar", "48000", "-ac", "2", "-c:a", "pcm_s16le", next]);
    if (r.code !== 0) return { ok: false, error: `gain trim ${n} failed: ` + tail(r) };
    cur = next;
    loud = await measureLoudness(cur);
    steps.push(`trim ${gain > 0 ? "+" : ""}${gain} dB → ${loud.integrated} LUFS`);
  }

  // --- peak guard: loudnorm's linear mode can overshoot TP, and AAC adds ~0.3 dB; clamp it ---
  const aacHeadroom = 1.0; // measured: AAC at 192k raised true peak ~0.6 dB on a transient-heavy source
  if (loud.truePeak > TARGET.tp - aacHeadroom) {
    const next = aTmp(9);
    const ceiling = Math.pow(10, (TARGET.tp - aacHeadroom) / 20).toFixed(4);
    const r = await run("ffmpeg", [...base, "-i", cur, "-af", `alimiter=limit=${ceiling}:attack=3:release=60:level=false`,
      "-ar", "48000", "-ac", "2", "-c:a", "pcm_s16le", next]);
    if (r.code !== 0) return { ok: false, error: "peak limiter failed: " + tail(r) };
    cur = next;
    loud = await measureLoudness(cur);
    steps.push(`limiter → ${loud.integrated} LUFS / ${loud.truePeak} dBTP`);
  }

  // --- mux ---
  const rm = await run("ffmpeg", [...base, "-i", vTmp, "-i", cur, "-map", "0:v:0", "-map", "1:a:0",
    "-c:v", "copy", ...acodec, "-movflags", "+faststart", out]);
  if (rm.code !== 0) return { ok: false, error: "mux failed: " + tail(rm) };
  return { ok: true, path: out, note: steps.join("; ") };
}


// ---------- main ----------
const manifest = { createdAt: new Date().toISOString(), target: TARGET, clips: [] };
let failures = 0;

for (let i = 0; i < inputs.length; i++) {
  const idx = i + 1;
  const { src, hint } = splitInput(inputs[i]);
  const platform = platformOf(src);
  const entry = { index: idx, input: inputs[i], source: src, platform, timestampHint: hint, status: "pending" };
  manifest.clips.push(entry);
  console.log(`\n[clip${idx}] ${platform} ${src}${hint != null ? `  (hint t=${hint}s)` : ""}`);

  try {
    // 1. acquire
    let rawPath;
    if (platform === "file") {
      if (!existsSync(src)) throw new Error(`local file not found: ${src}`);
      rawPath = resolve(src);
      console.log(`  source : local file`);
    } else {
      const dl = await download(idx, src, platform);
      if (!dl.ok) throw new Error(dl.error);
      rawPath = dl.path;
      console.log(`  download: ${dl.note} → ${rawPath.replace(ROOT + "/", "")}`);
    }
    entry.raw = rawPath;

    // 2. probe source
    const srcMeta = await probe(rawPath);
    entry.sourceProbe = srcMeta;
    console.log(`  source : ${srcMeta.width}x${srcMeta.height} @ ${srcMeta.fps}fps, ${srcMeta.duration}s, ${srcMeta.vcodec}/${srcMeta.acodec ?? "no audio"}`);
    if (hint != null && hint >= srcMeta.duration) {
      throw new Error(`timestamp hint ${hint}s is beyond source duration ${srcMeta.duration}s`);
    }

    // 3. normalize
    const nz = await normalize(idx, rawPath, srcMeta);
    if (!nz.ok) throw new Error(`normalize failed: ${nz.error}`);
    entry.normalized = nz.path;

    // 4. verify output
    const outMeta = await probe(nz.path);
    const loud = await measureLoudness(nz.path);
    entry.outputProbe = { ...outMeta, ...loud };
    const okDims = outMeta.width === TARGET.w && outMeta.height === TARGET.h;
    const okFps = Math.abs(outMeta.fps - TARGET.fps) < 0.01;
    const okLoud = srcMeta.hasAudio ? Math.abs(loud.integrated - TARGET.lufs) <= 0.5 : true;
    const okPeak = srcMeta.hasAudio ? loud.truePeak <= TARGET.tp + 0.5 : true;
    console.log(`  output : ${outMeta.width}x${outMeta.height} @ ${outMeta.fps}fps, ${outMeta.duration}s, I=${loud.integrated} LUFS, TP=${loud.truePeak} dBTP  (${nz.note})`);
    if (!okDims || !okFps || !okLoud || !okPeak) {
      throw new Error(`verification failed: dims=${okDims} fps=${okFps} loudness=${okLoud} truepeak=${okPeak}`);
    }
    entry.status = "ok";
    console.log(`  ✔ ok`);
  } catch (e) {
    entry.status = "failed";
    entry.error = e.message;
    failures++;
    console.log(`  ✘ FAILED: ${e.message}`);
  }
}

writeFileSync(join(WORK, "manifest.json"), JSON.stringify(manifest, null, 2));

// ---------- summary ----------
console.log("\n==== Phase 1 summary ====");
for (const c of manifest.clips) {
  const tag = c.status === "ok" ? "OK    " : "FAILED";
  const d = c.outputProbe ? `${c.outputProbe.duration}s ${c.outputProbe.integrated} LUFS` : "";
  console.log(`clip${c.index}  ${tag}  ${c.platform.padEnd(9)} ${d}${c.error ? "  " + c.error : ""}`);
}
console.log(`\nmanifest: work/manifest.json`);
process.exit(failures ? 2 : 0);
