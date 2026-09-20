#!/usr/bin/env node
// Avatar voice lines — ElevenLabs TTS for every cue in ranking.json's `avatar.cues`.
// Cached in assets/voice/<voiceId>/<slug>.mp3 (never regenerated unless --force), durations
// measured with ffprobe and written to voice.json for the composition.
//
//   node --env-file=.env pipeline/voice.mjs [--force]
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ranking = JSON.parse(readFileSync(join(ROOT, "ranking.json"), "utf8"));
const force = process.argv.includes("--force");
const av = ranking.avatar;
if (!av?.voice || !av.cues?.length) { console.log("no avatar cues in ranking.json"); process.exit(0); }
const KEY = process.env.ELEVENLABS_API_KEY;
if (!KEY) { console.error("[fatal] ELEVENLABS_API_KEY not set (run with node --env-file=.env)"); process.exit(1); }
const MODEL = process.env.ELEVENLABS_MODEL_ID ?? "eleven_multilingual_v2";

const slug = (t) => t.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const dir = join(ROOT, "assets", "voice", av.voice);
mkdirSync(dir, { recursive: true });
const out = {};

for (const cue of av.cues) {
  const file = join(dir, `${slug(cue.text)}.mp3`);
  if (!existsSync(file) || force) {
    const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${av.voice}?output_format=mp3_44100_128`, {
      method: "POST",
      headers: { "xi-api-key": KEY, "content-type": "application/json" },
      body: JSON.stringify({
        text: cue.text,
        model_id: MODEL,
        voice_settings: { stability: 0.35, similarity_boost: 0.8, style: 0.6, use_speaker_boost: true },
      }),
    });
    if (!r.ok) { console.error(`[fatal] ElevenLabs ${r.status}: ${await r.text()}`); process.exit(1); }
    writeFileSync(file, Buffer.from(await r.arrayBuffer()));
    console.log(`generated  "${cue.text}" → ${file.replace(ROOT + "/", "")}`);
  } else {
    console.log(`cached     "${cue.text}"`);
  }
  // TTS pads both ends with silence; trim to the speech so cue timing is tight, and peak-normalize.
  const trimmed = file.replace(/\.mp3$/, ".wav");
  if (!existsSync(trimmed) || force) {
    const t = spawnSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-i", file, "-af",
      "silenceremove=start_periods=1:start_threshold=-42dB,areverse,silenceremove=start_periods=1:start_threshold=-42dB,areverse,apad=pad_dur=0.08",
      "-ar", "48000", "-ac", "2", "-c:a", "pcm_s16le", trimmed]);
    if (t.status !== 0) { console.error(t.stderr); process.exit(1); }
  }
  let p = spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", trimmed], { encoding: "utf8" });
  let useFile = trimmed, dur = parseFloat(p.stdout), tempo = 1;
  // optional cap: compress the line (pitch-preserving atempo, max 1.6x) so a quick cue stays quick
  // per-cue cap wins; otherwise the avatar-wide `tempo` (Lucas wants the goat quick)
  const wanted = cue.maxDuration && dur > cue.maxDuration ? dur / cue.maxDuration : (av.tempo ?? 1);
  if (wanted > 1.001) {
    tempo = Math.min(1.6, wanted);
    const fast = trimmed.replace(/\.wav$/, `.x${tempo.toFixed(2)}.wav`);
    if (!existsSync(fast) || force) {
      const t = spawnSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-i", trimmed, "-af", `atempo=${tempo.toFixed(3)}`, "-c:a", "pcm_s16le", fast]);
      if (t.status !== 0) { console.error(t.stderr); process.exit(1); }
    }
    p = spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", fast], { encoding: "utf8" });
    useFile = fast; dur = parseFloat(p.stdout);
  }
  out[cue.text] = { file: useFile.replace(ROOT + "/", ""), duration: +dur.toFixed(3), tempo: +tempo.toFixed(2) };
}
writeFileSync(join(ROOT, "voice.json"), JSON.stringify(out, null, 2) + "\n");
console.log("wrote voice.json:", Object.entries(out).map(([t, v]) => `"${t}" ${v.duration}s`).join(", "));
