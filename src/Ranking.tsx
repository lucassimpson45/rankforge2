import React from "react";
import {
  AbsoluteFill,
  Sequence,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { Audio, Video } from "@remotion/media";
import { loadFont } from "@remotion/fonts";
import { Img } from "remotion";
import { buildTimeline, resolveCues, type Ranking as RankingT, type VoiceLine } from "./timeline";
import voiceJson from "../voice.json";
const VOICE = voiceJson as Record<string, VoiceLine>;

// ---- assets (local only; Anton = heavy condensed sans) ----
const FONT = "Anton";
loadFont({ family: FONT, url: staticFile("assets/fonts/Anton-Regular.ttf") });
// Every sound the composition can play, with the gain that brings its peak to roughly -3 dB.
// (per-track gain is applied to int16 samples and clamped, so each must stay under 0 dBFS alone)
const SFX_LIB: Record<string, { file: string; gain: number }> = {
  whoosh: { file: "assets/sfx/whoosh.wav", gain: 1.4 }, // peaks -4.5 dB
  impact: { file: "assets/sfx/impact.wav", gain: 2.4 }, // -12 dB
  click: { file: "assets/sfx/click.wav", gain: 1.4 }, // -4.3 dB
  ding: { file: "assets/sfx/ding.wav", gain: 1.3 }, // -5.7 dB
  fahh: { file: "assets/sfx/fahh.wav", gain: 1.1 }, // -3.8 dB
  "vine-boom": { file: "assets/sfx/vine-boom.wav", gain: 0.9 }, // 0 dB
  riser: { file: "assets/sfx/riser.wav", gain: 4.0 }, // -16 dB, ends at the first cut
  "i-got-this": { file: "assets/sfx/i-got-this.wav", gain: 0.85 }, // 0 dB meme line, opener test
};
const Sfx: React.FC<{ name: string; gain?: number }> = ({ name, gain = 1 }) => {
  const s = SFX_LIB[name];
  if (!s) throw new Error(`unknown sfx "${name}" — add it to SFX_LIB and assets/sfx`);
  return <Audio src={staticFile(s.file)} volume={s.gain * gain} />;
};

// ---- layout ----
const W = 1080;
const H = 1920;
const BAND_H = 370; // title band; also hides creator captions at the top of source clips
const TITLE_SHIFT = 90; // phones crop the top edge — push the title down ~¼ inch
const AREA_H = H - BAND_H;
const BG = "#0B0B0F";
const COL_X = 34; // numbered column left edge
const COL_TOP = BAND_H + 36;
const COL_GAP = 150; // vertical spacing between numbers
const NUM_SIZE = 118;
const LABEL_SIZE = 46;

// Audio staging. Per-track gain is applied to int16 samples and clamped, so each track stays
// under 0 dBFS on its own (whoosh peaks -4.5 dB, impact -12 dB, click -4.3 dB). The clip ducks
// under every transition so the hits punch through; pipeline/render.mjs runs a limiter on the mix.
const CLIP_VOL = process.env.REMOTION_MUTE_CLIPS ? 0 : 0.95; // env flag lets verify isolate the sfx bus
// Music beds live in Audios/ and rotate per video (pipeline/music.mjs writes ranking.json's
// `music` before every render). This fallback only applies to a bare Studio preview.
const DEFAULT_MUSIC = { file: "Audios/chopin-nocturne-op9-no2.wav", start: 0.85 };
const MUSIC_UNDER_CLIPS = 0.3; // ~-24 LUFS bed under -14 LUFS clip audio
const MUSIC_FADE_IN = 4; // frames, avoids a click when starting mid-song
const DUCK_VOL = 0.3;
const DUCK_IN = 9; // frames to recover after a cut
const REVEAL_DELAY = 6; // frames after the cut that the label + click land
const VOICE_VOL = 1.3; // lines peak around -4 to -6 dB; the clip ducks underneath
const AVATAR_DUCK = 0.35;
const AVATAR_H = 400; // goat height, bottom-left

const stroke = (px: number, color = "#000") =>
  ({ WebkitTextStroke: `${px}px ${color}`, paintOrder: "stroke fill" }) as React.CSSProperties;

// ---------------------------------------------------------------------------
const TitleBand: React.FC<{ title: RankingT["title"] }> = ({ title }) => (
  <div
    style={{
      position: "absolute",
      top: 0,
      left: 0,
      width: W,
      height: BAND_H,
      background: BG,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      fontFamily: FONT,
      textTransform: "uppercase",
      color: "#fff",
      lineHeight: 1,
      letterSpacing: 1,
      textAlign: "center",
      paddingTop: TITLE_SHIFT,
    }}
  >
    <div style={{ fontSize: 78 }}>{title.prefix}</div>
    <div style={{ fontSize: 90, marginTop: 8 }}>
      <span style={{ color: title.keywordColor }}>{title.keyword}</span> {title.suffix}
    </div>
  </div>
);

// ---------------------------------------------------------------------------
const NumberRow: React.FC<{
  n: number;
  label: string | null;
  emoji: string | null;
  revealedAt: number | null; // absolute frame the label pops in, null = never
  active: boolean;
  accent: string;
}> = ({ n, label, emoji, revealedAt, active, accent }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const y = COL_TOP + (n - 1) * COL_GAP;

  const revealed = revealedAt !== null && frame >= revealedAt;
  const pop = revealed
    ? spring({ frame: frame - (revealedAt as number), fps, config: { damping: 11, stiffness: 240, mass: 0.6 } })
    : 0;
  const numScale = active ? 1 + 0.06 * Math.sin((frame / fps) * Math.PI * 2 * 1.5) : 1;

  return (
    <div style={{ position: "absolute", left: COL_X, top: y, height: NUM_SIZE, display: "flex", alignItems: "center" }}>
      <div
        style={{
          fontFamily: FONT,
          fontSize: NUM_SIZE,
          lineHeight: 1,
          color: active ? accent : "#fff",
          width: 92,
          textAlign: "center",
          transform: `scale(${numScale})`,
          textShadow: "0 4px 0 rgba(0,0,0,0.6), 0 0 18px rgba(0,0,0,0.6)",
          ...stroke(8),
        }}
      >
        {n}
      </div>
      {revealed && label ? (
        <div
          style={{
            marginLeft: 10,
            transform: `scale(${pop})`,
            transformOrigin: "left center",
            display: "flex",
            alignItems: "center",
            gap: 12,
            fontFamily: FONT,
            fontSize: LABEL_SIZE,
            lineHeight: 1,
            color: "#fff",
            textTransform: "uppercase",
            letterSpacing: 1,
            whiteSpace: "nowrap",
            textShadow: "0 3px 0 rgba(0,0,0,0.6), 0 0 16px rgba(0,0,0,0.7)",
            ...stroke(6),
          }}
        >
          <span>{label}</span>
          <span style={{ fontFamily: "Apple Color Emoji, Noto Color Emoji, sans-serif", fontSize: LABEL_SIZE - 4, WebkitTextStroke: "0" }}>{emoji}</span>
        </div>
      ) : null}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Goat avatar: springs up from the bottom-left with a speech bubble, says its line, drops away.
const Avatar: React.FC<{ image: string; text: string; durationInFrames: number; preAdvanced: boolean }> = ({
  image, text, durationInFrames, preAdvanced,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const f = preAdvanced ? frame + 10 : frame; // first cue is already on screen at frame 0
  const enter = spring({ frame: f, fps, config: { damping: 12, stiffness: 200, mass: 0.7 } });
  const exitStart = durationInFrames - 6;
  const exit = frame >= exitStart ? interpolate(frame, [exitStart, durationInFrames], [0, 1], { extrapolateRight: "clamp" }) : 0;
  const y = (1 - enter) * AVATAR_H + exit * AVATAR_H;
  const wobble = Math.sin((frame / fps) * Math.PI * 2 * 3) * 2; // tiny talking wobble, degrees
  return (
    <div style={{ position: "absolute", left: 0, bottom: 0, width: W, height: AVATAR_H + 140, pointerEvents: "none" }}>
      <div style={{ position: "absolute", left: 10, bottom: 24, transform: `translateY(${y}px) rotate(${wobble}deg)`, transformOrigin: "50% 100%" }}>
        <Img src={staticFile(image)} style={{ height: AVATAR_H, width: "auto", filter: "drop-shadow(0 8px 18px rgba(0,0,0,0.5))" }} />
      </div>
      <div
        style={{
          position: "absolute",
          left: 430,
          bottom: AVATAR_H - 60,
          transform: `translateY(${y}px) scale(${enter})`,
          transformOrigin: "left bottom",
          background: "#fff",
          color: "#0B0B0F",
          fontFamily: FONT,
          fontSize: 52,
          lineHeight: 1,
          textTransform: "uppercase",
          letterSpacing: 1,
          padding: "20px 28px",
          borderRadius: 26,
          border: "5px solid #0B0B0F",
          whiteSpace: "nowrap",
          boxShadow: "0 8px 20px rgba(0,0,0,0.45)",
        }}
      >
        {text}
        {/* bubble tail pointing at the goat */}
        <div style={{ position: "absolute", left: -26, bottom: 26, width: 0, height: 0, borderTop: "18px solid transparent", borderBottom: "18px solid transparent", borderRight: "28px solid #0B0B0F" }} />
        <div style={{ position: "absolute", left: -16, bottom: 30, width: 0, height: 0, borderTop: "14px solid transparent", borderBottom: "14px solid transparent", borderRight: "20px solid #fff" }} />
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
export const Ranking: React.FC<{ ranking: RankingT }> = ({ ranking }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { segments } = buildTimeline(ranking, fps);
  const accent = ranking.title.keywordColor;
  const cues = resolveCues(ranking, segments, VOICE, fps);
  // clip gain at an absolute frame: ducked while the goat is talking
  const avatarDuck = (abs: number) =>
    cues.some((c) => abs >= c.from + c.voiceDelay && abs < c.from + c.voiceDelay + c.audioFrames + 3) ? AVATAR_DUCK : 1;
  // a ding-led opener replaces the cut sounds on the very first cut
  const openerHasDing = cues.some((c) => c.from === 0 && c.ding);
  // defaults = the recipe Lucas signed off on 2026-09-19 (instant-karma v2): ding reveals,
  // whoosh+impact cuts, a riser that lands on the first cut. Hits are placed per video.
  const sfxCfg: RankingT["sfx"] = { reveal: "ding", cut: ["whoosh", "impact"], intro: { sfx: "riser", leadIn: 2.6 }, ...(ranking.sfx ?? {}) };
  const revealSfx = sfxCfg.reveal ?? "ding";
  const cutSfx = sfxCfg.cut ?? ["whoosh", "impact"];
  const clipVol = ranking.clipAudio === false ? 0 : CLIP_VOL;
  const music = ranking.music === undefined ? DEFAULT_MUSIC : ranking.music;
  const musicVol = music?.volume ?? (clipVol === 0 ? 1 : MUSIC_UNDER_CLIPS);

  const activeSeg = segments.find((s) => frame >= s.from && frame < s.from + s.durationInFrames) ?? segments[segments.length - 1];
  // label pops 6 frames into the clip; the very first one is pre-advanced so frame 0 reads with sound off
  const revealFrame = (seg: (typeof segments)[number]) => (seg.from === 0 ? -12 : seg.from + REVEAL_DELAY);

  return (
    <AbsoluteFill style={{ background: BG }}>
      {/* clip area beneath the title band */}
      {segments.map((seg) => {
        const zoom = seg.slot.zoom ?? 1;
        const anchor = seg.slot.anchor ?? 0.5;
        return (
          <Sequence key={seg.slotNumber} from={seg.from} durationInFrames={seg.durationInFrames} premountFor={fps}>
            <div style={{ position: "absolute", top: BAND_H, left: 0, width: W, height: AREA_H, overflow: "hidden" }}>
              {/* source is already 1080x1920; crop the 320px the band takes according to `anchor`
                  (0 = keep top, 0.5 = center, 1 = keep bottom) and zoom around the same anchor */}
              <div
                style={{
                  position: "absolute",
                  left: 0,
                  top: -(H - AREA_H) * anchor,
                  width: W,
                  height: H,
                  transform: `scale(${zoom})`,
                  transformOrigin: `50% ${anchor * 100}%`,
                }}
              >
                <Video
                  src={staticFile(seg.src)}
                  trimBefore={seg.trimBefore}
                  trimAfter={seg.trimAfter}
                  volume={(f) =>
                    clipVol *
                    avatarDuck(seg.from + f) *
                    interpolate(f, [0, DUCK_IN, seg.durationInFrames - 4, seg.durationInFrames], [DUCK_VOL, 1, 1, 0.5], {
                      extrapolateLeft: "clamp",
                      extrapolateRight: "clamp",
                    })
                  }
                  style={{ width: W, height: H, display: "block" }}
                />
              </div>
            </div>
            {/* transition: whoosh + impact layered on the cut; reveal: click when the label lands */}
            {seg.from === 0 && openerHasDing
              ? null
              : cutSfx.map((name, i) => (
                  <Sequence key={name} from={i * 2} durationInFrames={fps * 3}>
                    <Sfx name={name} />
                  </Sequence>
                ))}
            <Sequence from={seg.from === 0 ? 0 : REVEAL_DELAY} durationInFrames={fps * 2}>
              <Sfx name={revealSfx} />
            </Sequence>
            {/* one-off hits inside this slot (the karma landing, the scream) */}
            {(sfxCfg.hits ?? [])
              .filter((h) => h.slot === seg.slotNumber)
              .map((h, i) => (
                <Sequence key={`hit-${i}`} from={Math.round(h.at * fps)} durationInFrames={fps * 3}>
                  <Sfx name={h.sfx} />
                </Sequence>
              ))}
          </Sequence>
        );
      })}

      <TitleBand title={ranking.title} />

      {/* numbered column 1..5, always visible, fills as slots reveal */}
      {[1, 2, 3, 4, 5].map((n) => {
        const seg = segments.find((s) => s.slotNumber === n);
        const slot = ranking.slots[String(n)];
        return (
          <NumberRow
            key={n}
            n={n}
            label={slot?.label ?? null}
            emoji={slot?.emoji ?? null}
            revealedAt={seg ? revealFrame(seg) : null}
            active={activeSeg?.slotNumber === n}
            accent={accent}
          />
        );
      })}

      {/* watermark */}
      <div
        style={{
          position: "absolute",
          left: "50%",
          transform: "translateX(-50%)",
          bottom: 430,
          fontFamily: FONT,
          fontSize: 40,
          color: "#fff",
          opacity: 0.42,
          letterSpacing: 2,
          textTransform: "uppercase",
          ...stroke(2, "rgba(0,0,0,0.6)"),
        }}
      >
        {ranking.watermark}
      </div>
      {/* music bed: one continuous pass of the song, no loops; ducks with the clip under the goat */}
      {music ? (
        <Audio
          src={staticFile(music.file)}
          trimBefore={Math.round((music.start ?? 0) * fps)}
          volume={(f) =>
            musicVol * avatarDuck(f) * interpolate(f, [0, MUSIC_FADE_IN], [0, 1], { extrapolateRight: "clamp" })
          }
        />
      ) : null}

      {/* opener: an extra sound on frame 0, on top of the first reveal ding (retention A/B) */}
      {sfxCfg.opener ? (
        <Sequence from={0} durationInFrames={fps * 3}>
          <Sfx name={sfxCfg.opener} />
        </Sequence>
      ) : null}

      {/* intro riser: builds so it lands exactly on the first cut */}
      {sfxCfg.intro && segments.length > 1 ? (
        <Sequence
          from={Math.max(0, segments[1].from - Math.round(sfxCfg.intro.leadIn * fps))}
          durationInFrames={Math.round(sfxCfg.intro.leadIn * fps)}
        >
          <Sfx name={sfxCfg.intro.sfx} />
        </Sequence>
      ) : null}

      {/* avatar cues: goat + bubble + voice line */}
      {ranking.avatar &&
        cues.map((c) => (
          <Sequence key={`av-${c.from}`} from={c.from} durationInFrames={c.durationInFrames} premountFor={fps}>
            <Avatar image={ranking.avatar!.image} text={c.text} durationInFrames={c.durationInFrames} preAdvanced={c.from === 0} />
            {c.ding ? <Sfx name="ding" /> : null}
            <Sequence from={c.voiceDelay}>
              <Audio src={staticFile(c.audio)} volume={VOICE_VOL} />
            </Sequence>
          </Sequence>
        ))}

</AbsoluteFill>
  );
};
