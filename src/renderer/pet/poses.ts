import type { SpriteName } from './sprites';

// Body/face sprite poses. Distinct from postures.ts (PosturePreset = body
// rotation / leaf bias); a Pose swaps the actual body + face PNG set.
//   idle    — standing (the original behaviour)
//   reading — sitting with a book; eyes default to half-lidded
//   diary   — sitting writing a diary; blink runs open → half → closed
export type Pose = 'idle' | 'reading' | 'diary';

export interface PoseConfig {
  body: SpriteName;
  // Resting / eyes-open face.
  faceDefault: SpriteName;
  // Discrete mid-blink frame. When null the blink crossfades default↔closed
  // via alpha (idle/reading); when set the blink shows this frame outright
  // (diary — a deliberate "thinking" blink).
  faceHalf: SpriteName | null;
  // Eyes-closed face (blink hold).
  faceClosed: SpriteName;
  // Auto-tilt — idle only; a sitting character tilting its head reads as odd.
  tilt: boolean;
  // Layers composited into the alpha hit-mask. Sitting poses are wider and
  // shorter than idle; the mask is rebuilt from these so the hit test follows.
  hitMaskSprites: SpriteName[];
  // Foot/seat shadow Y offset (negative = up). The standing and sitting art
  // meet the ground at different heights, so this is per-pose.
  shadowYOffset: number;
}

export const POSES: Record<Pose, PoseConfig> = {
  idle: {
    body: 'body',
    faceDefault: 'face_front_open',
    faceHalf: null,
    faceClosed: 'face_front_closed',
    tilt: true,
    hitMaskSprites: ['body', 'sprout', 'face_front_open'],
    shadowYOffset: -8,
  },
  reading: {
    body: 'sit_readingbook',
    faceDefault: 'reading_book_face_open',
    faceHalf: 'reading_book_face_half',
    faceClosed: 'reading_book_face_closed',
    tilt: false,
    hitMaskSprites: ['sit_readingbook', 'reading_book_face_open'],
    // Standing offset (-8) floated the shadow ~4px above the seat — drop it.
    shadowYOffset: -4,
  },
  diary: {
    body: 'diary_body',
    faceDefault: 'diary_face_open',
    faceHalf: 'diary_face_half',
    faceClosed: 'diary_face_closed',
    tilt: false,
    hitMaskSprites: ['diary_body', 'diary_face_open'],
    // Best-guess sit value (same as reading) — verify diary on screen.
    shadowYOffset: -4,
  },
};
