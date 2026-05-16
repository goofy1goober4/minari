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
  // Foot shadow Y offset (negative = up); null hides the shadow entirely —
  // a sitting character reads fine without a floor shadow.
  shadowYOffset: number | null;
  // Head top in canvas px (alpha-bbox top of faceDefault). Anchors the speech
  // bubble above the head; scales with SPRITE_SCALE so it tracks any pose/size.
  headTopY: number;
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
    headTopY: 42,
  },
  reading: {
    body: 'sit_readingbook',
    faceDefault: 'reading_book_face_open',
    faceHalf: 'reading_book_face_half',
    faceClosed: 'reading_book_face_closed',
    tilt: false,
    hitMaskSprites: ['sit_readingbook', 'reading_book_face_open'],
    shadowYOffset: null, // sitting — no floor shadow
    headTopY: 549,
  },
  diary: {
    body: 'diary_body',
    faceDefault: 'diary_face_open',
    faceHalf: 'diary_face_half',
    faceClosed: 'diary_face_closed',
    tilt: false,
    hitMaskSprites: ['diary_body', 'diary_face_open'],
    shadowYOffset: null, // sitting — no floor shadow
    headTopY: 609,
  },
};
