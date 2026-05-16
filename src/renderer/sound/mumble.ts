import type { Mood } from '../../shared/snapshot';

export interface VoiceProfile {
  basePitchHz: number;
  charGapMs: number;
  periodPauseMs: number;
  spacePauseMs: number;
  volume: number;
  endRise: boolean;
}

const VOWELS = new Set(['a', 'e', 'i', 'o', 'u']);
const NASAL_SAMPLES = ['eum', 'heum', 'eu', 'ang'] as const;
const CONSONANT_SAMPLES = ['dda', 'bba', 'gga', 'ha', 'ho', 'hi'] as const;
const ALL_SAMPLE_NAMES = [
  'a', 'e', 'i', 'o', 'u',
  ...NASAL_SAMPLES,
  ...CONSONANT_SAMPLES,
];

const PITCH_JITTER_HZ = 30;
const GAP_JITTER = 0.6;

// Inter-syllable spacing — kept short so chars feel connected, not staccato.
// Period/space pauses are separate constants so reducing this doesn't bleed
// into how punctuation breaks the line.
const BASE_CHAR_GAP_MS = 40;
const BASE_PERIOD_PAUSE_MS = 120;
const BASE_SPACE_PAUSE_MS = 90;

// Pull the next syllable forward by this much so the release of one fades
// into the attack of the next — natural crossfade given the 5ms edge fades.
const SYLLABLE_OVERLAP_S = 0.007;

const BASE_VOLUME = 0.7;

const PITCH_BAND_LOW_HZ = 280;
const PITCH_BAND_RANGE_HZ = 60;

// Global playback-rate scaler. <1 stretches each syllable (slower, softer);
// also lowers pitch since playbackRate couples speed and pitch — the band
// above is set high enough to compensate.
const PLAYBACK_RATE_MULTIPLIER = 0.88;

// Reference pitch the samples were recorded at — sets playbackRate=1.0.
// Tune by ear: if voices sound too low, raise; too chipmunky, lower.
const SAMPLE_REFERENCE_HZ = 100;

// Tiny fade so resampled samples don't click on edges.
const EDGE_FADE_S = 0.005;

const MOOD_TUNING: Record<
  Mood,
  { pitchMul: number; durationMul: number; volumeMul: number; endRise: boolean }
> = {
  calm: { pitchMul: 0.95, durationMul: 1.1, volumeMul: 1.0, endRise: false },
  curious: { pitchMul: 1.1, durationMul: 0.85, volumeMul: 1.0, endRise: true },
  sleepy: { pitchMul: 0.85, durationMul: 1.4, volumeMul: 0.55, endRise: false },
  content: { pitchMul: 1.0, durationMul: 1.0, volumeMul: 1.0, endRise: false },
  grumpy: { pitchMul: 0.92, durationMul: 1.05, volumeMul: 0.95, endRise: false },
  quiet: { pitchMul: 0.95, durationMul: 1.05, volumeMul: 0.7, endRise: false },
};

function hashNickname(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h) ^ s.charCodeAt(i);
  }
  return Math.abs(h | 0);
}

export function makeVoiceProfile(nickname: string, mood: Mood): VoiceProfile {
  const seed = hashNickname(nickname || 'minari');
  const seededPitch = PITCH_BAND_LOW_HZ + (seed % PITCH_BAND_RANGE_HZ);
  const tune = MOOD_TUNING[mood];
  return {
    basePitchHz: seededPitch * tune.pitchMul,
    charGapMs: BASE_CHAR_GAP_MS * tune.durationMul,
    periodPauseMs: BASE_PERIOD_PAUSE_MS * tune.durationMul,
    spacePauseMs: BASE_SPACE_PAUSE_MS * tune.durationMul,
    volume: BASE_VOLUME * tune.volumeMul,
    endRise: tune.endRise,
  };
}

// Runtime-tunable global scale (0..1) applied on top of per-mood profile.volume.
let globalVolume = 1;
let globalMuted = false;

export function setGlobalVolume(v: number) {
  globalVolume = Math.max(0, Math.min(1, v));
}
export function setGlobalMuted(m: boolean) {
  globalMuted = m;
}
export function getGlobalVolume(): number {
  return globalVolume;
}
export function getGlobalMuted(): boolean {
  return globalMuted;
}

let ctx: AudioContext | null = null;
const buffers = new Map<string, AudioBuffer>();
let loadingPromise: Promise<void> | null = null;

function getCtx(): AudioContext | null {
  if (typeof AudioContext === 'undefined') return null;
  if (!ctx) {
    try {
      ctx = new AudioContext();
    } catch {
      return null;
    }
  }
  if (ctx.state === 'suspended') {
    void ctx.resume().catch(() => {});
  }
  return ctx;
}

function loadAllSamples(audioCtx: AudioContext): Promise<void> {
  if (loadingPromise) return loadingPromise;
  console.log('[mumble] loading samples from ' + new URL('./sounds/a.wav', document.baseURI).href);
  loadingPromise = Promise.all(
    ALL_SAMPLE_NAMES.map(async (name) => {
      try {
        const res = await fetch(`./sounds/${name}.wav`);
        if (!res.ok) {
          console.warn(`[mumble] failed to load sounds/${name}.wav: HTTP ${res.status}`);
          return;
        }
        const arr = await res.arrayBuffer();
        const buf = await audioCtx.decodeAudioData(arr);
        buffers.set(name, buf);
      } catch (err) {
        console.warn(`[mumble] failed to load sounds/${name}.wav:`, err);
      }
    }),
  ).then(() => {
    console.log('[mumble] loaded ' + buffers.size + '/' + ALL_SAMPLE_NAMES.length + ' samples');
  });
  return loadingPromise;
}

export function primeAudio() {
  const audioCtx = getCtx();
  console.log('[mumble] primeAudio ctx=' + (audioCtx ? audioCtx.state : 'null'));
  if (audioCtx) void loadAllSamples(audioCtx);
}

function pickSampleName(ch: string): string | null {
  const lower = ch.toLowerCase();
  if (VOWELS.has(lower)) return lower;
  if (lower === 'm' || lower === 'n') {
    return NASAL_SAMPLES[Math.floor(Math.random() * NASAL_SAMPLES.length)];
  }
  if (/[a-z]/.test(lower)) {
    return CONSONANT_SAMPLES[Math.floor(Math.random() * CONSONANT_SAMPLES.length)];
  }
  return null;
}

export async function playMumble(text: string, profile: VoiceProfile) {
  console.log('[mumble] play triggered, text=' + JSON.stringify(text));
  const audioCtx = getCtx();
  if (!audioCtx) return;
  await loadAllSamples(audioCtx);

  let t = audioCtx.currentTime + 0.005;
  const lastVoiced = findLastVoiced(text);

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (ch === '.') {
      t += profile.periodPauseMs / 1000;
      continue;
    }
    if (/\s/.test(ch)) {
      t += profile.spacePauseMs / 1000;
      continue;
    }

    const sampleName = pickSampleName(ch);
    if (!sampleName) {
      t += profile.charGapMs / 1000;
      continue;
    }
    const buf = buffers.get(sampleName);
    if (!buf) {
      t += profile.charGapMs / 1000;
      continue;
    }

    let pitchHz = profile.basePitchHz;
    pitchHz += (Math.random() - 0.5) * PITCH_JITTER_HZ;
    if (profile.endRise && i === lastVoiced) pitchHz *= 1.2;

    const playbackRate = (pitchHz / SAMPLE_REFERENCE_HZ) * PLAYBACK_RATE_MULTIPLIER;
    const dur = buf.duration / playbackRate;

    const effectiveVol = globalMuted ? 0 : profile.volume * globalVolume;
    scheduleSample(audioCtx, t, buf, playbackRate, effectiveVol);

    const gapS =
      (profile.charGapMs * (1 - GAP_JITTER / 2 + Math.random() * GAP_JITTER)) / 1000;
    const advance = Math.max(dur / 2, dur + gapS - SYLLABLE_OVERLAP_S);
    t += advance;
  }
}

function findLastVoiced(text: string): number {
  for (let i = text.length - 1; i >= 0; i--) {
    if (/[a-zA-Z]/.test(text[i])) return i;
  }
  return -1;
}

function scheduleSample(
  audioCtx: AudioContext,
  startAt: number,
  buf: AudioBuffer,
  playbackRate: number,
  volume: number,
) {
  const src = audioCtx.createBufferSource();
  src.buffer = buf;
  src.playbackRate.value = playbackRate;

  const dur = buf.duration / playbackRate;
  const fade = Math.min(EDGE_FADE_S, dur / 4);

  const gain = audioCtx.createGain();
  gain.gain.setValueAtTime(0, startAt);
  gain.gain.linearRampToValueAtTime(volume, startAt + fade);
  gain.gain.setValueAtTime(volume, startAt + dur - fade);
  gain.gain.linearRampToValueAtTime(0, startAt + dur);

  src.connect(gain);
  gain.connect(audioCtx.destination);
  src.start(startAt);
  src.stop(startAt + dur);
}
