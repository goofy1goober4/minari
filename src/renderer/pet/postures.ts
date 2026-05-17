import type { Activity } from '../../shared/snapshot';

export interface PosturePreset {
  // Additive bias on body.rotation. Negative = forward droop, positive = lean back.
  leanRad: number;
  // Additive base rotation per leaf. Per existing convention:
  //   left leaf: positive = tip up; negative = tip down.
  //   right leaf: negative = tip up; positive = tip down.
  leafBaseLeft: number;
  leafBaseRight: number;
  // Period of the breathing oscillation in seconds.
  breathPeriodSec: number;
}

export const POSTURE_PRESETS: Record<Activity, PosturePreset> = {
  sleeping: {
    leanRad: -0.15,
    leafBaseLeft: -0.4,
    leafBaseRight: 0.4,
    breathPeriodSec: 8,
  },
  dozing: {
    leanRad: -0.08,
    leafBaseLeft: -0.2,
    leafBaseRight: 0.2,
    breathPeriodSec: 6.5,
  },
  reading: {
    leanRad: -0.05,
    leafBaseLeft: 0.1,
    leafBaseRight: -0.05,
    breathPeriodSec: 5,
  },
  looking_out: {
    leanRad: 0.05,
    leafBaseLeft: 0.15,
    leafBaseRight: -0.15,
    breathPeriodSec: 5,
  },
  idle: {
    leanRad: 0,
    leafBaseLeft: 0,
    leafBaseRight: 0,
    breathPeriodSec: 5,
  },
  // Sitting, bent over the diary — mirrors the reading posture.
  diary: {
    leanRad: -0.05,
    leafBaseLeft: 0.1,
    leafBaseRight: -0.05,
    breathPeriodSec: 5,
  },
};
