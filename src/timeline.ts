import rankingJson from "../ranking.json";
import preparedJson from "../prepared.json";
const PREPARED = preparedJson as Record<string, { file: string; duration: number }>;

export type Slot = {
  clip: string | null;
  in?: number;
  out?: number;
  label: string | null;
  emoji: string | null;
  zoom?: number;
  anchor?: number; // 0 keep top … 1 keep bottom of the source when cropping under the band
  why?: string;
};

export type AvatarCue = {
  text: string;
  at?: "start";
  after?: number; // slot number; the cue fires when the segment following that slot's segment starts
  maxDuration?: number;
  hold?: number; // minimum seconds on screen
  display?: string; // bubble text if it should differ from the spoken line (censoring)
  ding?: boolean; // play the ding just before the line
};

export type SfxHit = { slot: number; at: number; sfx: string }; // `at` = seconds into that slot's window

export type SfxConfig = {
  reveal?: string; // sound on every label pop (default "click")
  opener?: string; // extra sound at frame 0, together with the first reveal (e.g. "i-got-this")
  cut?: string[]; // sounds layered on every cut (default ["whoosh", "impact"])
  intro?: { sfx: string; leadIn: number }; // plays so it ENDS at the first cut, e.g. a riser
  hits?: SfxHit[]; // one-off sounds at a moment inside a slot (the karma landing, the scream)
};

// Background music bed. Plays straight through from `start` (seconds into the track) — never looped.
export type MusicConfig = {
  file: string; // e.g. assets/music/pure-imagination.wav (normalized to -14 LUFS)
  start?: number; // seconds into the track where the video begins
  volume?: number; // default 1 when clip audio is muted, MUSIC_UNDER_CLIPS otherwise
};

export type Ranking = {
  sfx?: SfxConfig;
  music?: MusicConfig | null; // omitted = the house bed (DEFAULT_MUSIC); null = no music
  clipAudio?: boolean; // false strips the source clips' own audio (music + SFX only)
  avatar?: { image: string; voice: string; tempo?: number; cues: AvatarCue[] };
  title: { prefix: string; keyword: string; suffix: string; keywordColor: string };
  watermark: string;
  fps: number;
  revealOrder: number[];
  cutAfterLastReveal: boolean;
  durationRange?: [number, number];
  durationNote?: string;
  slots: Record<string, Slot>;
};

export const ranking = rankingJson as unknown as Ranking;

/** Timeline: one segment per revealed slot, in reveal order, hard-cut back to back. */
export function buildTimeline(r: Ranking, fps: number) {
  let from = 0;
  const segments = r.revealOrder.map((slotNumber) => {
    const s = r.slots[String(slotNumber)];
    if (!s.clip || s.in == null || s.out == null) {
      throw new Error(`slot ${slotNumber} is in revealOrder but has no clip/in/out`);
    }
    const durationInFrames = Math.round((s.out - s.in) * fps);
    // pipeline/prep.mjs pre-cuts each window to work/slotN.mp4; fall back to the full clip + trim
    const prep = PREPARED[String(slotNumber)];
    const src = prep ? prep.file : s.clip;
    const trimBefore = prep ? 0 : Math.round(s.in * fps);
    const seg = { slotNumber, slot: s, from, durationInFrames, src, trimBefore, trimAfter: trimBefore + durationInFrames };
    from += durationInFrames;
    return seg;
  });
  return { segments, totalFrames: from };
}

export type VoiceLine = { file: string; duration: number; tempo?: number };

/** Absolute frame windows for every avatar cue (start frame, duration in frames, audio file). */
export function resolveCues(
  r: Ranking,
  segments: ReturnType<typeof buildTimeline>["segments"],
  voice: Record<string, VoiceLine>,
  fps: number,
) {
  if (!r.avatar) return [];
  const TAIL = 0.35; // seconds the goat lingers after the line ends
  return r.avatar.cues.flatMap((cue) => {
    const line = voice[cue.text];
    if (!line) throw new Error(`no voice line for "${cue.text}" — run: node --env-file=.env pipeline/voice.mjs`);
    let from: number;
    if (cue.at === "start") from = 0;
    else {
      const i = segments.findIndex((s) => s.slotNumber === cue.after);
      if (i < 0 || i + 1 >= segments.length) return []; // slot absent or nothing plays after it
      from = segments[i + 1].from;
    }
    const voiceDelay = cue.ding ? 7 : 0; // ding lands first, the line follows a beat later
    const seconds = Math.max(cue.hold ?? 0, voiceDelay / fps + line.duration + TAIL);
    return [{
      text: cue.display ?? cue.text, from, durationInFrames: Math.round(seconds * fps),
      audio: line.file, audioFrames: Math.ceil(line.duration * fps), voiceDelay, ding: !!cue.ding,
    }];
  });
}
