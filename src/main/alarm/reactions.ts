// Four reactions Minari has when a coding-agent alarm pings her. The bubble
// text is the "what the user reads"; the kind drives the renderer animation
// (startle = bigger jump, others = standard nudge). Mood is what to record
// on the diary side and biases the mumble voice for that line.
//
// Selection is uniform-random by default. Callers can pass a `force` to pin
// a specific reaction — used by the demo trigger so the hackathon video can
// reliably show "...loud." Hooks in the wild fire random.

import type { Mood } from '../../shared/snapshot';

export type ReactionKind = 'startled_jump' | 'annoyed_glare' | 'done' | 'loud';

export interface AlarmReaction {
  kind: ReactionKind;
  text: string;
  mood: Mood;
}

export const REACTIONS: readonly AlarmReaction[] = [
  { kind: 'startled_jump', text: '!?', mood: 'curious' },
  { kind: 'annoyed_glare', text: '...mm.', mood: 'grumpy' },
  { kind: 'done', text: '...done.', mood: 'quiet' },
  { kind: 'loud', text: '...loud.', mood: 'grumpy' },
];

const KINDS: readonly ReactionKind[] = REACTIONS.map((r) => r.kind);

export function isReactionKind(s: unknown): s is ReactionKind {
  return typeof s === 'string' && (KINDS as readonly string[]).includes(s);
}

export function pickReaction(
  force: ReactionKind | null = null,
  rand: () => number = Math.random,
): AlarmReaction {
  if (force) {
    const found = REACTIONS.find((r) => r.kind === force);
    if (found) return found;
  }
  const i = Math.floor(rand() * REACTIONS.length);
  return REACTIONS[Math.min(i, REACTIONS.length - 1)];
}
