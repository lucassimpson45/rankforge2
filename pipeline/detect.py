#!/usr/bin/env python3
"""Phase 2 — Highlight detection (mechanical).

For each normalized clip in work/manifest.json:
  1. audio RMS envelope (100 ms hops) -> peaks
  2. scene-change timestamps (ffmpeg `select=gt(scene,T)`)
  3. score candidate windows of WINDOW seconds; keep top N (non-overlapping)
  4. export a 3x3 contact sheet per candidate to work/sheets/
Writes work/detection.json. Clips with a timestampHint skip detection and get a single
window anchored on the hint.

Usage: python3 pipeline/detect.py [--window 6.5] [--top 3]
"""
import argparse, json, os, subprocess, sys, tempfile
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WORK = os.path.join(ROOT, "work")
SHEETS = os.path.join(WORK, "sheets")

ap = argparse.ArgumentParser()
ap.add_argument("--window", type=float, default=6.5, help="candidate window length, seconds (4–7)")
ap.add_argument("--top", type=int, default=3)
ap.add_argument("--scene-thresh", type=float, default=0.30)
args = ap.parse_args()
assert 4.0 <= args.window <= 7.0, "window must be 4–7 s"

HOP = 0.1  # seconds per RMS frame
SR = 16000


def sh(cmd, **kw):
    return subprocess.run(cmd, capture_output=True, text=True, **kw)


def rms_envelope(path):
    with tempfile.NamedTemporaryFile(suffix=".raw", delete=False) as tmp:
        raw = tmp.name
    r = sh(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", path, "-map", "0:a:0",
            "-ac", "1", "-ar", str(SR), "-f", "s16le", raw])
    if r.returncode != 0:
        raise RuntimeError(r.stderr.strip())
    x = np.fromfile(raw, dtype=np.int16).astype(np.float32) / 32768.0
    os.unlink(raw)
    hop = int(SR * HOP)
    n = len(x) // hop
    if n == 0:
        return np.zeros(1)
    frames = x[: n * hop].reshape(n, hop)
    env = np.sqrt((frames ** 2).mean(axis=1) + 1e-12)
    # light smoothing (3-frame moving average) so single-sample clicks don't dominate
    k = np.ones(3) / 3
    return np.convolve(env, k, mode="same")


def scene_changes(path, thresh):
    r = sh(["ffmpeg", "-hide_banner", "-i", path, "-vf", f"select='gt(scene,{thresh})',showinfo",
            "-an", "-f", "null", "-"])
    ts = []
    for line in r.stderr.splitlines():
        if "pts_time:" in line:
            try:
                ts.append(float(line.split("pts_time:")[1].split()[0]))
            except ValueError:
                pass
    return ts


def candidate_windows(env, scenes, duration, window, top):
    """Slide a window over the clip; score = peak RMS (weighted) + mean RMS + scene-change bonus.
    Windows are placed so the loudest moment sits ~60% in (viewer sees the build-up)."""
    if duration <= window:
        return [dict(start=0.0, end=round(duration, 3), score=float(env.max()), reason="clip shorter than window; whole clip")]
    t = np.arange(len(env)) * HOP
    peak_i = env.argsort()[::-1]
    cands = []
    for i in peak_i:
        pt = t[i]
        start = max(0.0, min(pt - window * 0.6, duration - window))
        end = start + window
        if any(abs(start - c["start"]) < window * 0.5 for c in cands):
            continue  # non-max suppression: keep windows distinct
        m = (t >= start) & (t < end)
        sc_in = [s for s in scenes if start <= s <= end]
        score = 2.0 * env[i] + env[m].mean() + 0.02 * len(sc_in)
        cands.append(dict(start=round(start, 3), end=round(end, 3), score=round(float(score), 4),
                          peak_t=round(float(pt), 2), peak_rms=round(float(env[i]), 4),
                          scene_cuts=[round(s, 2) for s in sc_in]))
        if len(cands) >= top:
            break
    return sorted(cands, key=lambda c: -c["score"])


def contact_sheet(path, start, end, out):
    # 9 frames evenly spaced across the window, tiled 3x3 at 360x640 each -> 1080x1920
    n = 9
    step = (end - start) / n
    # trim to the window, then keep one frame every `step` seconds (exactly 9 for the tile)
    sel = (f"trim=start={start:.3f}:end={end:.3f},"
           f"select='isnan(prev_selected_t)+gte(t-prev_selected_t\\,{step:.4f})'")
    vf = (f"{sel},scale=360:640,"
          f"drawtext=text='%{{pts\\:hms}}':x=8:y=8:fontsize=28:fontcolor=white:box=1:boxcolor=black@0.6,"
          f"tile=3x3")
    r = sh(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", path, "-vf", vf,
            "-frames:v", "1", "-q:v", "3", out])
    if r.returncode != 0:
        # drawtext needs a font; fall back without timestamps if unavailable
        vf = f"{sel},scale=360:640,tile=3x3"
        r = sh(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", path, "-vf", vf,
                "-frames:v", "1", "-q:v", "3", out])
        if r.returncode != 0:
            raise RuntimeError(r.stderr.strip())


def main():
    manifest = json.load(open(os.path.join(WORK, "manifest.json")))
    os.makedirs(SHEETS, exist_ok=True)
    result = {"window": args.window, "clips": []}
    for c in manifest["clips"]:
        if c.get("status") != "ok":
            continue
        idx, path, dur = c["index"], c["normalized"], c["outputProbe"]["duration"]
        entry = {"index": idx, "duration": dur, "candidates": []}
        hint = c.get("timestampHint")
        if hint is not None:
            start = max(0.0, min(hint - 1.0, dur - args.window))
            entry["candidates"] = [dict(start=round(start, 3), end=round(min(dur, start + args.window), 3),
                                        score=None, reason=f"user timestamp hint t={hint}s; detection skipped")]
            entry["detection"] = "skipped"
        else:
            env = rms_envelope(path)
            scenes = scene_changes(path, args.scene_thresh)
            entry["scene_changes"] = [round(s, 2) for s in scenes]
            entry["rms_peak_t"] = round(float(np.argmax(env) * HOP), 2)
            entry["candidates"] = candidate_windows(env, scenes, dur, args.window, args.top)
            entry["detection"] = "rms+scene"
        for k, cand in enumerate(entry["candidates"], 1):
            sheet = os.path.join(SHEETS, f"clip{idx}_cand{k}.jpg")
            contact_sheet(path, cand["start"], cand["end"], sheet)
            cand["sheet"] = os.path.relpath(sheet, ROOT)
        result["clips"].append(entry)
        print(f"clip{idx}  dur={dur}s  {entry['detection']}  scenes={len(entry.get('scene_changes', []))}")
        for k, cand in enumerate(entry["candidates"], 1):
            extra = f"peak@{cand['peak_t']}s rms={cand['peak_rms']}" if "peak_t" in cand else cand.get("reason", "")
            print(f"   cand{k}: {cand['start']:6.2f}–{cand['end']:6.2f}  score={cand['score']}  {extra}")
    json.dump(result, open(os.path.join(WORK, "detection.json"), "w"), indent=2)
    print("\nwrote work/detection.json and work/sheets/*.jpg")


if __name__ == "__main__":
    main()
