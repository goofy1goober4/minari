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
  // Writing-hand overlay (diary pose). null = no pencil layer; when set it
  // sits between body and face and jitters in breathe(). See Minari.pencilSprite.
  pencil: SpriteName | null;
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
  // Horizontal nudge (canvas px, ×SPRITE_SCALE at render) on the whole face
  // layer — corrects poses where the head art isn't dead-centre over the body.
  faceOffsetX: number;
}

export const POSES: Record<Pose, PoseConfig> = {
  idle: {
    body: 'body',
    faceDefault: 'face_front_open',
    faceHalf: null,
    faceClosed: 'face_front_closed',
    pencil: null,
    tilt: true,
    hitMaskSprites: ['body', 'sprout', 'face_front_open'],
    shadowYOffset: -8,
    headTopY: 42,
    faceOffsetX: 0,
  },
  reading: {
    body: 'sit_readingbook',
    faceDefault: 'reading_book_face_open',
    faceHalf: 'reading_book_face_half',
    faceClosed: 'reading_book_face_closed',
    pencil: null,
    tilt: false,
    hitMaskSprites: ['sit_readingbook', 'reading_book_face_open'],
    shadowYOffset: null, // sitting — no floor shadow
    headTopY: 549,
    faceOffsetX: 0,
  },
  diary: {
    body: 'diary_body',
    faceDefault: 'diary_face_open',
    faceHalf: 'diary_face_half',
    faceClosed: 'diary_face_closed',
    pencil: 'diary_pencil',
    tilt: false,
    hitMaskSprites: ['diary_body', 'diary_face_open'],
    shadowYOffset: null, // sitting — no floor shadow
    headTopY: 609,
    faceOffsetX: 27,
  },
};
